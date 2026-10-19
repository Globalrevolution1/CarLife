-- =============================================================
-- 015 — تصویر فاکتور سرویس  (بخش «ثبت سرویس» PRD)
-- =============================================================
--
-- PRD:
--   ثبت سرویس ← اطلاعات ← «تصویر فاکتور»
--   Database ← Services ← image
--   Backend ← Storage
--
-- وضعیت قبل اجرا:
--   * ستون services.image اصلاً وجود نداشت
--     (در هیچ migration ای ساخته نشده بود — grep خالی)
--   * هیچ bucket ای ساخته نشده بود
--
-- تصمیم‌های امنیتی:
--   * bucket خصوصی است (public = false).
--     فاکتور اطلاعات خودرو و پلاک را لو می‌دهد؛ لینک عمومی نمی‌خواهیم.
--     نمایش در پرونده با createSignedUrl انجام می‌شود.
--
--   * مسیر فایل:  <vehicle_id>/<uuid>.<ext>
--     پوشه = خودرو، نه کاربر. دلیل: هنگام «انتقال مالکیت» باید
--     تصاویر فاکتور هم مثل بقیهٔ پرونده به خریدار منتقل شود.
--     policy روی active ownership می‌سازد، پس:
--       مالک قبلی بعد از فروش دسترسی ندارد (درست مثل بقیهٔ پرونده)
--       خریدار بلافاصله دسترسی پیدا می‌کند
--
--   * رکورسیون ندارد: policy روی storage.objects فقط
--     vehicle_ownerships را می‌خواند و سیاست select آن
--     (012) فقط owner_id = auth.uid() است؛ یعنی هیچ join
--     اضافه‌ای ندارد که برگردد به vehicles یا services.
--
-- idempotent: چند بار اجرا شدن آسیبی ندارد.
-- =============================================================


-- =============================================================
-- 1) ستون تصویر
-- =============================================================

alter table public.services
  add column if not exists image text;

comment on column public.services.image is
  'مسیر فایل تصویر فاکتور داخل bucket service-invoices';


-- =============================================================
-- 2) bucket خصوصی
--
-- file_size_limit = 5 مگابایت
-- allowed_mime_types = فقط تصویر (نه PDF، نه هر چیز دیگر)
-- =============================================================

insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'service-invoices',
    'service-invoices',
    false,
    5242880,
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ]
  )
on conflict (id) do nothing;


-- =============================================================
-- 3) grant صریح روی storage.objects
--
-- پروژه‌های جدید Supabase grant پیش‌فرض ندارند؛ بدون grant،
-- policy اصلاً اجرا نمی‌شود (همان ترتیب grant ← RLS در 013).
-- اگر پروژه از قبل grant داشته باشد تکرار بی‌ضرر است.
-- =============================================================

grant select, insert, update, delete
  on table storage.objects
  to authenticated;


-- =============================================================
-- 4) helper: آیا این مسیر متعلق به خودرویِ فعالِ کاربر جاری است؟
--
--   (storage.foldername(name))[1]  →  اولین بخش مسیر
--   با uuid::text مقایسه می‌شود نه cast مستقیم تا اگر کسی
--   مسیر غیر uuid داد، خطا نگیرد و فقط رد شود.
-- =============================================================

create or replace function public._owns_active_vehicle_folder(
  p_path text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.vehicle_ownerships vo
     where vo.owner_id   = auth.uid()
       and vo.end_date   is null
       and vo.vehicle_id::text = p_path
  );
$$;

revoke execute on function public._owns_active_vehicle_folder(text)
  from public, anon;

grant execute on function public._owns_active_vehicle_folder(text)
  to authenticated;


-- =============================================================
-- 5) policy های bucket
-- =============================================================

-- بارگذاری: فقط مالکِ فعالِ همان خودرو
drop policy if exists "Vehicle owners can upload invoice images"
  on storage.objects;

create policy "Vehicle owners can upload invoice images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'service-invoices'
    and public._owns_active_vehicle_folder(
      (storage.foldername(name))[1]
    )
  );


-- خواندن: همان شرط → بعد از انتقال، خریدار می‌بیند و فروشنده نه
drop policy if exists "Vehicle owners can read invoice images"
  on storage.objects;

create policy "Vehicle owners can read invoice images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'service-invoices'
    and public._owns_active_vehicle_folder(
      (storage.foldername(name))[1]
    )
  );


-- حذف: فقط مالکِ فعال (برای تعویض یا جا‌به‌جایی عکس)
drop policy if exists "Vehicle owners can delete invoice images"
  on storage.objects;

create policy "Vehicle owners can delete invoice images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'service-invoices'
    and public._owns_active_vehicle_folder(
      (storage.foldername(name))[1]
    )
  );


-- =============================================================
-- 6) خلاصه
--
--   * ستون services.image ساخته شد
--   * bucket service-invoices (خصوصی، ۵MB، فقط تصویر)
--   * 3 policy روی storage.objects — همه بر پایهٔ مالکیت فعال
--   * هیچ policy یا دادهٔ موجودی تغییر نمی‌کند
-- =============================================================
