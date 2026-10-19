-- =============================================================
-- 011_baseline_reconcile.sql
-- =============================================================
-- این migration شکاف بین repository و دیتابیس زنده را می‌بندد.
--
-- همهٔ محتوای این فایل از روی دیتابیس زنده استخراج شده است
-- (project ref: ezcdjwthdptfnyialjpw) و هیچ چیز حدسی نیست.
-- منبع: pg_policies، pg_constraint، pg_indexes،
--        information_schema.columns
--
-- چیزی که در Git نبود ولی زنده وجود داشت:
--   1) ستون vehicles.current_mileage
--   2) جدول service_templates (۱۰ ردیف مرجع)
--   3) مجموعهٔ policy های services / vehicles /
--      vehicle_ownerships / vehicle_services / service_templates
--      که دستی در Dashboard ساخته شده بودند
--
-- هدف: از این پس `supabase db reset` روی یک پروژهٔ تازه
-- باید همان چیزی را بسازد که در production هست.
--
-- این فایل عمداً «واقعیت را ثبت می‌کند» و «سخت‌گیر نمی‌کند».
-- سخت‌گیری در 012_security_hardening.sql انجام می‌شود.
--
-- تمام دستورات idempotent هستند.
-- =============================================================


-- =============================================================
-- 1) vehicles.current_mileage
--
-- فرانت‌اند این ستون را می‌خواند و می‌نویسد، ولی در هیچ
-- migration گیتی نبود. در نتیجه reset کامل، اپ را می‌شکست.
-- nullable است تا خودروی تازه موعد سرویس الکی عقب‌افتاده نشود.
-- =============================================================

alter table public.vehicles
  add column if not exists current_mileage integer;

comment on column public.vehicles.current_mileage is
  'کیلومتر فعلی خودرو. فقط رو به بالا به‌روزرسانی می‌شود (monotonic).';


-- =============================================================
-- 2) service_templates — دادهٔ مرجع دوره‌ای
--
-- مدل‌محور است، نه برند‌محور: هر ردیف برای یک جفت
-- (brand, model) است. تأییدشده با دادهٔ زنده:
--   پژو   / 206 تیپ 2
--   لکسوس / ls460L
-- =============================================================

create table if not exists public.service_templates (
  id           uuid        primary key default gen_random_uuid(),
  brand        text        not null,
  model        text        not null,
  service_name text        not null,
  interval_km  integer     not null,
  created_at   timestamptz not null default now()
);

comment on table public.service_templates is
  'جدول مرجع سرویس‌های دوره‌ای. مدل‌محور: هر ردیف یک جفت (brand, model).';


alter table public.service_templates
  enable row level security;


-- دادهٔ مرجع برای همه قابل خواندن است. RLS روشن می‌ماند،
-- فقط SELECT. (زنده دقیقاً همین policy را دارد.)
drop policy if exists "Everyone can read service templates"
  on public.service_templates;

create policy "Everyone can read service templates"
  on public.service_templates
  for select
  to public
  using (true);


-- =============================================================
-- 3) profiles — مطابق migration 001 (بدون تغییر)
--
-- فقط برای کامل بودن تصویر ذکر می‌شود؛ زنده همین است.
--   SELECT / UPDATE با شرط auth.uid() = id
-- بازنویسی نمی‌شود چون از قبل در Git هست.
-- =============================================================


-- =============================================================
-- 4) vehicles policies — همان چیزی که زنده دارد
--
-- ⚠ توجه: policy «Users can insert vehicles» با شرط true
-- یک آسیب‌پذیری واقعی است و در 012 حذف می‌شود. اینجا فقط
-- برای هم‌خوانی repository با production بازتولید می‌شود.
-- =============================================================

drop policy if exists "Owners can insert their vehicles"
  on public.vehicles;

create policy "Owners can insert their vehicles"
  on public.vehicles
  for insert
  to public
  with check (auth.uid() is not null);


drop policy if exists "Users can insert vehicles"
  on public.vehicles;

create policy "Users can insert vehicles"
  on public.vehicles
  for insert
  to public
  with check (true);


drop policy if exists "Users can view own vehicles"
  on public.vehicles;

create policy "Users can view own vehicles"
  on public.vehicles
  for select
  to public
  using (
    exists (
      select 1
      from public.vehicle_ownerships
      where vehicle_ownerships.vehicle_id = vehicles.id
        and vehicle_ownerships.owner_id   = auth.uid()
    )
  );


drop policy if exists "Users can view vehicles"
  on public.vehicles;

create policy "Users can view vehicles"
  on public.vehicles
  for select
  to public
  using (auth.uid() is not null);


drop policy if exists "Owners can update their vehicles"
  on public.vehicles;

create policy "Owners can update their vehicles"
  on public.vehicles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = vehicles.id
        and vo.owner_id   = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = vehicles.id
        and vo.owner_id   = auth.uid()
    )
  );


-- =============================================================
-- 5) vehicle_ownerships policies — همان چیزی که زنده دارد
-- =============================================================

drop policy if exists "Users can create ownership"
  on public.vehicle_ownerships;

create policy "Users can create ownership"
  on public.vehicle_ownerships
  for insert
  to public
  with check (owner_id = auth.uid());


drop policy if exists "Owners can create ownership records"
  on public.vehicle_ownerships;

create policy "Owners can create ownership records"
  on public.vehicle_ownerships
  for insert
  to public
  with check (auth.uid() = owner_id);


drop policy if exists "Users can view own ownership history"
  on public.vehicle_ownerships;

create policy "Users can view own ownership history"
  on public.vehicle_ownerships
  for select
  to public
  using (owner_id = auth.uid());


-- =============================================================
-- 6) services policies — همان چیزی که زنده دارد
--
-- ⚠ policy دوم فقط created_by را چک می‌کند و نه مالکیت
-- خودرو را؛ یعنی هر کاربر واردشده می‌تواند برای خودروی
-- دیگری سرویس ثبت کند. در 012 حذف می‌شود.
-- =============================================================

drop policy if exists "Owners can view services for their vehicles"
  on public.services;

create policy "Owners can view services for their vehicles"
  on public.services
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = services.vehicle_id
        and vo.owner_id   = auth.uid()
    )
  );


drop policy if exists "Owners can insert services for their vehicles"
  on public.services;

create policy "Owners can insert services for their vehicles"
  on public.services
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = services.vehicle_id
        and vo.owner_id   = auth.uid()
    )
  );


drop policy if exists "Owners can insert their own vehicle services"
  on public.services;

create policy "Owners can insert their own vehicle services"
  on public.services
  for insert
  to authenticated
  with check (created_by = auth.uid());


-- =============================================================
-- 7) vehicle_services policies — همان چیزی که زنده دارد
--
-- این جدول با services هم‌پوشانی دارد و فرانت‌اند هیچ‌جا
-- از آن استفاده نمی‌کند. حذف نمی‌شود چون ۲ ردیف دادهٔ
-- تاریخی دارد؛ فقط ثبت می‌شود.
-- =============================================================

drop policy if exists "Users can view own vehicle services"
  on public.vehicle_services;

create policy "Users can view own vehicle services"
  on public.vehicle_services
  for select
  to public
  using (
    exists (
      select 1
      from public.vehicle_ownerships
      where vehicle_ownerships.vehicle_id = vehicle_services.vehicle_id
        and vehicle_ownerships.owner_id   = auth.uid()
    )
  );


drop policy if exists "Users can create own vehicle services"
  on public.vehicle_services;

create policy "Users can create own vehicle services"
  on public.vehicle_services
  for insert
  to public
  with check (
    exists (
      select 1
      from public.vehicle_ownerships
      where vehicle_ownerships.vehicle_id = vehicle_services.vehicle_id
        and vehicle_ownerships.owner_id   = auth.uid()
    )
  );


-- =============================================================
-- 8) service_items و service_centers
--
-- هر دو RLS روشن دارند و هیچ policy ندارند، یعنی از مسیر
-- Data API بسته‌اند. فرانت‌اند هم از هیچ‌کدام استفاده نمی‌کند.
-- عمداً دست‌نخورده می‌مانند تا کسی ناخواسته بازشان نکند.
-- =============================================================


-- =============================================================
-- 9) دادهٔ مرجع (۱۰ ردیف زنده)
--
-- بدون unique constraint، پس به‌جای on conflict از not exists
-- استفاده می‌شود تا اجرای دوباره ردیف تکراری نسازد.
-- =============================================================

insert into public.service_templates
  (brand, model, service_name, interval_km)
select
  seed.brand,
  seed.model,
  seed.service_name,
  seed.interval_km
from (
  values
    ('پژو',   '206 تیپ 2', 'فیلتر روغن',        10000),
    ('پژو',   '206 تیپ 2', 'تعویض روغن موتور',   10000),
    ('پژو',   '206 تیپ 2', 'فیلتر هوا',          15000),
    ('پژو',   '206 تیپ 2', 'فیلتر کابین',        15000),
    ('پژو',   '206 تیپ 2', 'روغن گیربکس',        50000),
    ('پژو',   '206 تیپ 2', 'شمع',                50000),
    ('پژو',   '206 تیپ 2', 'تسمه تایم',          60000),
    ('لکسوس', 'ls460L',     'تعویض روغن گیربکس',   5000),
    ('لکسوس', 'ls460L',     'تعویض روغن',         10000),
    ('لکسوس', 'ls460L',     'تعویض فیلتر هوا',    20000)
) as seed (brand, model, service_name, interval_km)
where not exists (
  select 1
  from public.service_templates existing
  where existing.brand        = seed.brand
    and existing.model        = seed.model
    and existing.service_name = seed.service_name
);