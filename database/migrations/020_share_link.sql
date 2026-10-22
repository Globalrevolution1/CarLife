-- =============================================================
-- 020_share_link.sql — فاز ۸ (Trust & Resale)
-- لینک اشتراک‌پذیر گزارش خودرو برای خریدار
--
-- چرا توکنِ جدا از UUID خودرو؟
--   /report/:id از شناسهٔ خودرو استفاده می‌کند و پشت
--   ProtectedRoute است. اگر همان شناسه را عمومی کنیم،
--   شناسه‌ای که در پرس‌وجوها و لاگ‌ها می‌چرخد تبدیل به کلید
--   دسترسی می‌شود. توکنِ اختصاصی + انقضا، دسترسی را
--   «قابل لغو» و «موقت» می‌کند: بعد از فروش خودرو کافی است
--   لینک باطل شود.
--
-- مدل دسترسی:
--   * نوشتن (فعال‌سازی / تمدید / لغو) → خودِ مالک، از طریق
--     UPDATE روی vehicles؛ policy «Owners can update their
--     vehicles» (012) پوشش می‌دهد، policy جدید لازم نیست.
--   * خواندن عمومی → فقط از مسیر تابع get_shared_vehicle_report
--     که security definer است و شرط توکن + انقضا را داخل خودش
--     بررسی می‌کند. جدول vehicles همچنان برای anon بسته می‌ماند؛
--     هیچ view عمومی ساخته نمی‌شود تا امکان «list کردنِ» همهٔ
--     گزارش‌های فعال وجود نداشته باشد.
-- =============================================================


-- -------------------------------------------------------------
-- 1) ستون‌ها
-- -------------------------------------------------------------

alter table public.vehicles
  add column if not exists share_token uuid,
  add column if not exists share_expires_at timestamptz;

comment on column public.vehicles.share_token is
  'توکن دسترسی عمومی به گزارش خودرو؛ فقط زمانی معتبر است که share_expires_at در آینده باشد';
comment on column public.vehicles.share_expires_at is
  'مهلت اعتبار لینک اشتراک؛ null یعنی اشتراک غیرفعال است';

-- هر خودرو یک توکنِ ثابت و یکتا داشته باشد؛ فعال‌سازی بعدی
-- توکن را عوض می‌کند تا لینک‌های قبلی بی‌اثر شوند.
alter table public.vehicles
  alter column share_token set default gen_random_uuid();

update public.vehicles
   set share_token = gen_random_uuid()
 where share_token is null;

-- بدون ایندکس یکتا، حدسِ توکن ورودیِ خطی دارد (و همچنین
-- تضمین یکتایی از سمت دیتابیس می‌آید).
create unique index if not exists vehicles_share_token_uidx
  on public.vehicles (share_token)
  where share_token is not null;


-- -------------------------------------------------------------
-- 2) تابع خواندن عمومی — تنها دروازهٔ دسترسی بدون ورود
--
-- security definer ⇒ RLS جداول زیرین دور زده می‌شود؛ پس همهٔ
-- شرط‌های حفاظتی باید داخل تابع باشند. پارامتر ورودی هم
-- «کلید» است: بدون آن هیچ ردیفی برنمی‌گردد.
-- -------------------------------------------------------------

create or replace function public.get_shared_vehicle_report(
  p_token uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'vehicle', jsonb_build_object(
      'id',                       v.id,
      'brand',                    v.brand,
      'model',                    v.model,
      'production_year_solar',    v.production_year_solar,
      'production_year_gregorian', v.production_year_gregorian,
      'color',                    v.color,
      'vin',                      v.vin,
      'current_mileage',          v.current_mileage
    ),
    'valid_until', v.share_expires_at,
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                  s.id,
          'title',               s.title,
          'description',         s.description,
          'service_date',        s.service_date,
          'mileage',             s.mileage,
          'cost',                s.cost,
          'verification_status', s.verification_status,
          'center_name',         sc.name
        )
        order by s.service_date desc nulls last,
                 s.created_at   desc
      )
      from public.services s
      left join public.service_centers sc
             on sc.id = s.service_center_id
      where s.vehicle_id = v.id
    ), '[]'::jsonb)
  )
  from public.vehicles v
  where v.share_token = p_token
    and v.share_expires_at is not null
    and v.share_expires_at > now();
$$;

comment on function public.get_shared_vehicle_report(uuid) is
  'گزارش عمومی خودرو با لینک اشتراک؛ فقط برای توکن معتبر و منقضی‌نشده. شناسهٔ خودرو پذیرفته نمی‌شود.';


-- -------------------------------------------------------------
-- 3) امتیاز اجرا
--
-- پیش‌فرض پستگرس این است که EXECUTE روی تابع به PUBLIC
-- داده می‌شود؛ باید صریح پس گرفته شود تا کنترل دست به دست
-- نشود. anon عمداً اجراکنندهٔ اصلی است: خریدار وارد نشده.
-- -------------------------------------------------------------

revoke execute on function public.get_shared_vehicle_report(uuid)
  from public, anon, authenticated;

grant execute on function public.get_shared_vehicle_report(uuid)
  to anon, authenticated;


-- -------------------------------------------------------------
-- 4) سلب دسترسی مستقیم به ستون‌های اشتراک برای نقش‌های عمومی
--
-- anon اصلاً grant روی vehicles ندارد (012 فقط SELECT را به
-- authenticated داده)، ولی صریح بیان کردن هزینه‌اش کم است و
-- اسناد را خوانا می‌کند.
-- -------------------------------------------------------------

revoke select, update, insert, delete
  on table public.vehicles
  from anon;


-- =============================================================
-- وضعیت اجرا
-- =============================================================
-- پس از اجرا، راستی‌آزمایی با نقش anon:
--
--   set role anon;
--   select public.get_shared_vehicle_report('<توکن معتبر>'::uuid);
--     → آبجکت vehicle + services
--   select public.get_shared_vehicle_report(gen_random_uuid());
--     → null   (توکن ناشناخته)
--   -- پس از گذاشتن share_expires_at در گذشته:
--     → null   (منقضی)
--
-- و همچنان:
--   select * from public.vehicles  (با نقش anon)
--     → 42501  — جدول بسته می‌ماند.
-- =============================================================
