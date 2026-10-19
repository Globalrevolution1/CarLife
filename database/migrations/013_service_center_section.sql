-- =============================================================
-- 013 — بخش ۶ PRD: مرکز خدمات خودرو
-- =============================================================
--
-- وضعیت قبل اجرا:
--   * service_centers را RLS فعال داشت ولی هیچ policy نداشت
--     یعنی از Data API کاملاً بسته بود (در 012 بخش 9 ثبت شده).
--   * services هیچ UPDATE policy نداشت.
--
-- مطابق بخش ۶ PRD:
--   * مرکز خدمات خودش را ثبت می‌کند (نام، تماس، شهر، آدرس)
--   * مالک هنگام ثبت سرویس، مرکز را انتخاب می‌کند
--     یعنی سرویس به آن مرکز نسبت داده می‌شود
--   * مرکز سرویس‌های نسبت‌داده‌شده به خودش را تأیید می‌کند
--     و وضعیت service_center_verified می‌گیرد
--
-- تصمیم امنیتی مهم:
--   * هیچ UPDATE policy روی services باز نمی‌شود.
--     تأیید فقط از طریق تابع SECURITY DEFINER انجام می‌شود
--     تا یک کاربر نتواند وضعیت سرویس دیگران را عوض کند
--     و نتواند سرویس مرکز دیگری را تصاحب کند.
--
--   * هیچ policy جدیدی روی vehicles اضافه نمی‌شود چون
--     services به vehicles و vehicle به services وصل شدن
--     رکورسیون ایجاد می‌کند (infinite recursion detected).
--     پنل مرکز فقط نام سرویس/کیلومتر/تاریخ را نشان می‌دهد.
--
-- اجرای این فایل idempotent است: چند بار اجرا شدن آسیبی ندارد.
-- =============================================================


-- =============================================================
-- 1) اتصال FK بین services و service_centers
--
-- ستون service_center_id از قبل وجود داشت، ولی بدون FK هر
-- عدد بی‌ربطی می‌شد داخلش ذخیره کرد.
-- =============================================================

do $$
begin
  if not exists (
    select 1
      from information_schema.table_constraints
     where constraint_name = 'services_service_center_id_fkey'
       and table_name = 'services'
       and table_schema = 'public'
  ) then
    alter table public.services
      add constraint services_service_center_id_fkey
      foreign key (service_center_id)
      references public.service_centers (id)
      on delete set null;
  end if;
end
$$;


-- =============================================================
-- 2) مقدار پیش‌فرض is_verified
--
-- تا ادمین مرکزی را تأیید نکرده، مرکز «تأییدنشده» ثبت می‌شود.
-- هیچ ردیفی در جدول نیست (0 ردیف)، پس تغییر default امن است.
-- =============================================================

alter table public.service_centers
  alter column is_verified set default false;


-- =============================================================
-- 3) grant های جدول service_centers
--
-- بدون grant، policy اصلاً معنا ندارد: PostgREST ابتدا grant
-- را نگاه می‌کند و بعد RLS.
-- anon عمداً هیچ دسترسی‌ای نمی‌گیرد.
-- =============================================================

grant select, insert, update, delete
  on table public.service_centers
  to authenticated;


-- =============================================================
-- 4) policy های service_centers
-- =============================================================

-- فهرست مراکز برای انتخاب در فرم ثبت سرویس: عمومی است
-- (اطلاعات شغلی مثل نام، شهر، آدرس).
drop policy if exists "Service centers are visible to signed-in users"
  on public.service_centers;

create policy "Service centers are visible to signed-in users"
  on public.service_centers for select
  to authenticated
  using (true);


-- هر کاربر فقط می‌تواند مرکز خودش را بسازد.
drop policy if exists "Owners can register their own service center"
  on public.service_centers;

create policy "Owners can register their own service center"
  on public.service_centers for insert
  to authenticated
  with check (owner_id = auth.uid());


-- و فقط مرکز خودش را ویرایش یا حذف کند.
drop policy if exists "Owners can update their own service center"
  on public.service_centers;

create policy "Owners can update their own service center"
  on public.service_centers for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());


drop policy if exists "Owners can delete their own service center"
  on public.service_centers;

create policy "Owners can delete their own service center"
  on public.service_centers for delete
  to authenticated
  using (owner_id = auth.uid());


-- =============================================================
-- 5) policy خواندن سرویس برای مرکز خدمات
--
-- سیاست select فعلی فقط مالک خودرو را پوشش می‌دهد. مرکز
-- خدمات مالک خودرو نیست وگرنه پنلش خالی می‌ماند.
-- دقت: این policy فقط به service_centers وصل می‌شود، نه به
-- vehicles، تا رکورسیون رخ ندهد.
-- =============================================================

drop policy if exists "Centers can view services linked to them"
  on public.services;

create policy "Centers can view services linked to them"
  on public.services for select
  to authenticated
  using (
    exists (
      select 1
        from public.service_centers sc
       where sc.id = services.service_center_id
         and sc.owner_id = auth.uid()
    )
  );


-- =============================================================
-- 6) تأیید سرویس توسط مرکز خدمات
--
-- قواعد داخل تابع:
--   * تماس‌دهنده باید لاگین کرده باشد
--   * تماس‌دهنده باید لااقل یک مرکز خدمات ثبت کرده باشد
--   * سرویس باید از قبل به مرکز تماس‌دهنده نسبت داده شده باشد
--     (مالک موقع ثبت سرویس مرکز را انتخاب کرده)؛ بنابراین
--     هیچ مرکزی نمی‌تواند سرویس مرکز دیگری را تصاحب کند
--   * فقط verification_status و service_center_id عوض می‌شود؛
--     هیچ فیلد دیگری (هزینه، توضیح، کیلومتر) دست نمی‌خورد
-- =============================================================

create or replace function public.verify_service(
  p_service_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_center_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ابتدا وارد حساب خود شوید.'
      using errcode = '42501';
  end if;

  select sc.id
    into v_center_id
    from public.service_centers sc
   where sc.owner_id = auth.uid()
   order by sc.created_at
   limit 1;

  if v_center_id is null then
    raise exception 'ابتدا مرکز خدمات خود را ثبت کنید.'
      using errcode = '42501';
  end if;

  update public.services
     set verification_status = 'service_center_verified',
         service_center_id    = v_center_id,
         updated_at           = now()
   where id = p_service_id
     and service_center_id = v_center_id
     and verification_status is distinct from 'service_center_verified';

  if not found then
    raise exception
      'این سرویس به مرکز خدمات شما متصل نیست یا قبلاً تأیید شده است.'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;


-- فقط authenticated. anon و public اجازهٔ فراخوانی ندارند.
revoke execute on function public.verify_service(uuid)
  from public, anon;

grant execute on function public.verify_service(uuid)
  to authenticated;


-- =============================================================
-- 7) خلاصهٔ آنچه این migration انجام می‌دهد
--
--   * policy های service_centers: 0 → 4
--   * سیاست جدید روی services: +1 (خواندن برای مرکز)
--   * تابع verify_service ساخته شد
--   * FK اتصال services به service_centers ساخته شد
--
-- هیچ policy ای از 012 بسته یا حذف نمی‌شود.
-- =============================================================
