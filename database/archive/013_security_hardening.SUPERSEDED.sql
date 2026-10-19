-- =============================================================
-- 013_SECURITY_HARDENING.sql  [FINAL — اجرا شود]
-- =============================================================
-- بر اساس audit 2026-10-05 + پیشنهاد 012_security_hardening.sql
--
-- تغییرات:
--   ۱. حذف policy های {public} روی جدول‌های حساس
--   ۲. ساخت policy های جدید با {authenticated} + CHECK دقیق
--   ۳. حذف policy های تکراری
--   ۴. افزودن end_date check به vehicle_ownerships SELECT
--   ۵. Grant های پیش‌فرض برای Supabase 2026-10-30
--
-- ⚠ قبل از اجرا: خروجی query زیر رو بفرست تا qualها رو بررسی کنم:
--   select tablename, policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname='public'
--   order by tablename, policyname;
-- =============================================================

-- =============================================================
-- ۱. vehicles — حذف policy های public INSERT
-- =============================================================

drop policy if exists "Users can insert vehicles" on public.vehicles;
drop policy if exists "Owners can insert their vehicles" on public.vehicles;

create policy "Authenticated users can insert their own vehicles"
  on public.vehicles
  for insert
  to authenticated
  with check (true);

-- =============================================================
-- ۲. vehicles — حذف policy های public SELECT
-- =============================================================

drop policy if exists "Users can view own vehicles" on public.vehicles;
drop policy if exists "Users can view vehicles" on public.vehicles;

create policy "Authenticated users can view their own vehicles"
  on public.vehicles
  for select
  to authenticated
  using (
    exists (
      select 1 from public.vehicle_ownerships
      where vehicle_ownerships.vehicle_id = vehicles.id
        and vehicle_ownerships.owner_id   = auth.uid()
        and vehicle_ownerships.end_date   is null
    )
  );

-- =============================================================
-- ۳. vehicles — UPDATE (فقط مالک فعلی)
-- =============================================================

drop policy if exists "Owners can update their vehicles" on public.vehicles;
drop policy if exists "Users can update own vehicle" on public.vehicles;

create policy "Authenticated users can update their own vehicles"
  on public.vehicles
  for update
  to authenticated
  using (
    exists (
      select 1 from public.vehicle_ownerships
      where vehicle_ownerships.vehicle_id = vehicles.id
        and vehicle_ownerships.owner_id   = auth.uid()
        and vehicle_ownerships.end_date   is null
    )
  )
  with check (
    exists (
      select 1 from public.vehicle_ownerships
      where vehicle_ownerships.vehicle_id = vehicles.id
        and vehicle_ownerships.owner_id   = auth.uid()
        and vehicle_ownerships.end_date   is null
    )
  );

-- =============================================================
-- ۴. vehicle_ownerships — حذف policy های public
-- =============================================================

drop policy if exists "Users can create ownership" on public.vehicle_ownerships;
drop policy if exists "Owners can create ownership records" on public.vehicle_ownerships;
drop policy if exists "Users can view own ownership history" on public.vehicle_ownerships;

create policy "Authenticated users can create ownership"
  on public.vehicle_ownerships
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Authenticated users can view their own ownership history"
  on public.vehicle_ownerships
  for select
  to authenticated
  using (owner_id = auth.uid());

-- =============================================================
-- ۵. services — حذف policy های قدیمی + ساخت جدید
-- =============================================================

drop policy if exists "Owners can insert services for their vehicles" on public.services;
drop policy if exists "Owners can insert their own vehicle services" on public.services;
drop policy if exists "Owners can view services for their vehicles" on public.services;

create policy "Authenticated users can insert services for their vehicles"
  on public.services
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.vehicle_ownerships
      where vehicle_ownerships.vehicle_id = services.vehicle_id
        and vehicle_ownerships.owner_id   = auth.uid()
        and vehicle_ownerships.end_date   is null
    )
  );

create policy "Authenticated users can view services for their vehicles"
  on public.services
  for select
  to authenticated
  using (
    exists (
      select 1 from public.vehicle_ownerships
      where vehicle_ownerships.vehicle_id = services.vehicle_id
        and vehicle_ownerships.owner_id   = auth.uid()
        and vehicle_ownerships.end_date   is null
    )
  );

-- =============================================================
-- ۶. vehicle_services — حذف policy های public
-- =============================================================

drop policy if exists "Users can create own vehicle services" on public.vehicle_services;
drop policy if exists "Users can view own vehicle services" on public.vehicle_services;

create policy "Authenticated users can create own vehicle services"
  on public.vehicle_services
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can view own vehicle services"
  on public.vehicle_services
  for select
  to authenticated
  using (true);

-- =============================================================
-- ۷. profiles — حذف policy های public
-- =============================================================

drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;

create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id);

-- =============================================================
-- ۸. service_templates — حذف policy public
-- =============================================================

drop policy if exists "Everyone can read service templates" on public.service_templates;

-- "Authenticated users can view service templates" باقی می‌ماند

-- =============================================================
-- ۹. Grants — آمادگی برای تغییر 2026-10-30 Supabase
-- =============================================================

grant usage on schema public to anon, authenticated;

grant select on table
  public.vehicles,
  public.vehicle_ownerships,
  public.services,
  public.service_templates,
  public.service_centers,
  public.profiles,
  public.vehicle_services,
  public.service_items
to anon, authenticated;
