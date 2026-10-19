-- =============================================================
-- 012_security_hardening.sql
-- =============================================================
-- همهٔ تغییرات این فایل بر پایهٔ خواندن مستقیم pg_policies،
-- pg_constraint و probing زندهٔ PostgREST نوشته شده‌اند.
-- هیچ فرضی بدون تأیید باقی نمانده است.
--
-- اجرا: بعد از 011. هر دو idempotent هستند.
--
-- ⚠ اگر این فایل را اجرا کنی، «مسیر ثبت خودرو» باید همزمان
-- با تابع register_vehicle (بخش 3) کار کند. دلیلش در همان
-- بخش توضیح داده شده.
-- =============================================================


-- =============================================================
-- خلاصهٔ آسیب‌پذیری‌ها (همه تأییدشده)
--
-- V1 — INSERT ناشناس روی vehicles            [بحرانی]
--   policy «Users can insert vehicles» با with check (true)
--   روی PUBLIC. چون policy های permissive با OR ترکیب
--   می‌شوند، شرط سخت‌گیرانهٔ policy دیگر بی‌اثر می‌شود.
--   اثبات زنده: POST /rest/v1/vehicles {} با کلید anon
--   → HTTP 400 کد 23502 (رسیدن به NOT NULL؛ یعنی مجوز رد شد
--   نه اینکه رد نشده باشد). یعنی از لایهٔ policy گذشت.
--
-- V2 — خواندن همهٔ خودروها توسط هر کاربر واردشده   [بالا]
--   policy «Users can view vehicles» با شرط
--   (auth.uid() is not null). هر کاربر لاگین‌کرده
--   می‌تواند کل جدول vehicles را بخواند: برند، مدل،
--   رنگ، کیلومتر و VIN. VIN شناسهٔ حساس خودرو است.
--
-- V3 — تصاحب خودروی دیگران                      [بحرانی]
--   policy های INSERT روی vehicle_ownerships فقط
--   (owner_id = auth.uid()) را چک می‌کنند، نه اینکه
--   خودرو مال کسی نباشد. هر کاربر واردشده می‌تواند
--   ردیف مالکیت برای خودروی قربانی بسازد و از آن پس
--   همهٔ policy های مبتنی بر مالکیت به او دسترسی بدهند.
--   این یعنی تصاحب کامل خودرو و سرویس‌هایش.
--
-- V4 — ثبت سرویس برای خودروی دیگران             [بالا]
--   policy «Owners can insert their own vehicle services»
--   فقط created_by = auth.uid() را چک می‌کند. با OR شدن
--   با policy درست، شرط مالکیت دور زده می‌شود.
--
-- V5 — دسترسی مالک قبلی بعد از انتقال مالکیت     [متوسط]
--   هیچ‌کدام از policy های مبتنی بر مالکیت
--   (end_date is null) را چک نمی‌کنند. امروز
--   ۰ ردیف مالکیت منقضی وجود دارد، پس هنوز فعال
--   نیست؛ ولی با اولین انتقال مالکیت فعال می‌شود.
--
-- V6 — نبود یکتایی مالک فعال                    [متوسط]
--   هیچ constraint یا index ای مانع دو مالک فعال
--   همزمان برای یک خودرو نمی‌شود.
--
-- U1 — بدون policy سالم نمی‌ماند
--   ثبت خودرو با .insert().select() کار می‌کند چون
--   RETURNING به policy خواندن نیاز دارد و در آن لحظه
--   هنوز ردیف مالکیتی وجود ندارد. پس تنها چیزی که
--   آن را ممکن می‌کند V2 است. اگر V2 را ساده حذف کنیم،
--   ثبت خودرو می‌شکند. راه‌حل: تابع register_vehicle
--   در بخش 3.
-- =============================================================


-- =============================================================
-- 1) بستن INSERT ناشناس روی vehicles  (V1)
-- =============================================================

drop policy if exists "Users can insert vehicles"
  on public.vehicles;

-- سیاست دوم هم عمداً حذف می‌شود: از این پس ساخت خودرو
-- فقط از مسیر register_vehicle انجام می‌شود تا هیچ خودروی
-- «بی‌مالک» ساخته نشود. (در اجرای فعلی ۰ خودروی بی‌مالک داریم.)
drop policy if exists "Owners can insert their vehicles"
  on public.vehicles;

-- نوشتن مستقیم هم بسته می‌شود؛ RPC با security definer
-- این کار را انجام می‌دهد.
revoke insert on table public.vehicles from anon, authenticated;


-- =============================================================
-- 2) خواندن خودرو فقط برای مالک فعال  (V2 + V5)
-- =============================================================

drop policy if exists "Users can view vehicles"
  on public.vehicles;

drop policy if exists "Users can view own vehicles"
  on public.vehicles;

create policy "Users can view own vehicles"
  on public.vehicles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = vehicles.id
        and vo.owner_id   = auth.uid()
        and vo.end_date   is null
    )
  );


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
        and vo.end_date   is null
    )
  )
  with check (
    exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = vehicles.id
        and vo.owner_id   = auth.uid()
        and vo.end_date   is null
    )
  );


-- =============================================================
-- 3) ثبت اتمیک خودرو — جایگزین V2 برای RETURNING  (U1 + V3)
--
-- چرا تابع لازم است:
--   ثبت خودرو با .insert().select() به policy خواندن
--   نیاز دارد. خودروی تازه هنوز ردیف مالکیت ندارد، پس
--   هیچ policy مبتنی بر مالکیت اجازهٔ RETURNING نمی‌دهد.
--   تا امروز policy نشتی V2 این را ممکن می‌کرد.
--
-- این تابع:
--   خودرو و ردیف مالکیت را در یک تراکنش می‌سازد،
--   مالک را از auth.uid() می‌گیرد (کاربر نمی‌تواند
--   مالک جعل کند)، و شناسه را برمی‌گرداند.
-- =============================================================

-- نکتهٔ نوع پارامترها:
--   سال‌ها integer گرفته می‌شوند، نه smallint. دلیل: در
--   فراخوانی مستقیم SQL، عدد صحیح بدون کست با smallint
--   تطبیق نمی‌خورد و خطای 42883 می‌دهد
--   («function does not exist»). ستون‌های جدول همان
--   smallint می‌مانند و کست در insert خودکار انجام می‌شود.
create or replace function public.register_vehicle(
  p_vin                       text,
  p_brand                     text,
  p_model                     text,
  p_production_year_solar     integer,
  p_production_year_gregorian integer,
  p_color                     text,
  p_current_mileage           integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'برای ثبت خودرو باید وارد حساب شوی.'
      using errcode = '42501';
  end if;

  if p_vin is null or btrim(p_vin) = '' then
    raise exception 'شماره شاسی (VIN) الزامی است.'
      using errcode = '23502';
  end if;

  insert into public.vehicles (
    vin,
    brand,
    model,
    production_year_solar,
    production_year_gregorian,
    color,
    current_mileage
  )
  values (
    btrim(p_vin),
    p_brand,
    p_model,
    p_production_year_solar,
    p_production_year_gregorian,
    p_color,
    p_current_mileage
  )
  returning id into v_id;

  insert into public.vehicle_ownerships (
    vehicle_id,
    owner_id,
    start_date
  )
  values (
    v_id,
    v_uid,
    current_date
  );

  return v_id;
end;
$$;

comment on function public.register_vehicle is
  'ثبت اتمیک خودرو + مالکیت فعال. مالک همیشه auth.uid() است.';

revoke all on function public.register_vehicle(
  text, text, text, integer, integer, text, integer
) from public;

grant execute on function public.register_vehicle(
  text, text, text, integer, integer, text, integer
) to authenticated;


-- =============================================================
-- 4) بستن تصاحب خودرو  (V3 + V6)
--
-- یک index یکتا: برای هر خودرو حداکثر یک مالکیت فعال.
-- این هم تصاحب را می‌بندد (نمی‌شود مالک دوم فعال اضافه کرد)
-- و هم V6 را حل می‌کند.
--
-- ترتیب مهم است: اول index، بعد پاک‌سازی policy ها.
-- =============================================================

create unique index if not exists vehicle_ownerships_one_active_owner
  on public.vehicle_ownerships (vehicle_id)
  where end_date is null;


-- policy های INSERT تکراری: فقط یکی با نام روشن‌تر نگه داشته
-- می‌شود، و همان هم فقط مالکیت خود را می‌پذیرد.
drop policy if exists "Owners can create ownership records"
  on public.vehicle_ownerships;

drop policy if exists "Users can create ownership"
  on public.vehicle_ownerships;

create policy "Users can create ownership"
  on public.vehicle_ownerships
  for insert
  to authenticated
  with check (auth.uid() = owner_id);


drop policy if exists "Users can view own ownership history"
  on public.vehicle_ownerships;

create policy "Users can view own ownership history"
  on public.vehicle_ownerships
  for select
  to authenticated
  using (owner_id = auth.uid());


-- =============================================================
-- 5) بستن ثبت سرویس برای خودروی دیگران  (V4 + V5)
-- =============================================================

drop policy if exists "Owners can insert their own vehicle services"
  on public.services;

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
        and vo.end_date   is null
    )
  );


drop policy if exists "Owners can insert services for their vehicles"
  on public.services;

create policy "Owners can insert services for their vehicles"
  on public.services
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = services.vehicle_id
        and vo.owner_id   = auth.uid()
        and vo.end_date   is null
    )
  );


-- =============================================================
-- 6) همان سخت‌گیری برای جدول قدیمی vehicle_services  (V5)
--
-- فرانت‌اند از این جدول استفاده نمی‌کند، ولی باز گذاشتنش
-- با شرط ناقص بد است. سیاست‌ها هم‌سان می‌شوند.
-- =============================================================

drop policy if exists "Users can view own vehicle services"
  on public.vehicle_services;

create policy "Users can view own vehicle services"
  on public.vehicle_services
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = vehicle_services.vehicle_id
        and vo.owner_id   = auth.uid()
        and vo.end_date   is null
    )
  );


drop policy if exists "Users can create own vehicle services"
  on public.vehicle_services;

create policy "Users can create own vehicle services"
  on public.vehicle_services
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.vehicle_ownerships vo
      where vo.vehicle_id = vehicle_services.vehicle_id
        and vo.owner_id   = auth.uid()
        and vo.end_date   is null
    )
  );


-- =============================================================
-- 7) حذف policy تکراری service_templates
--
-- دو policy خواندن داشت: {authenticated} و {public}، هر دو
-- با using (true). یکی کافی است و همان هم در 011 ساخته شد.
-- =============================================================

drop policy if exists "Authenticated users can view service templates"
  on public.service_templates;


-- =============================================================
-- 8) بهبود صحت دادهٔ مرجع
--
-- زنده هیچ CHECK ای روی interval_km ندارد. همهٔ ۱۰ ردیف
-- فعلی مقدار مثبت دارند، پس افزودن این شرط بی‌خطر است و
-- جلوی فاصلهٔ سرویس صفر/منفی را می‌گیرد.
-- =============================================================

alter table public.service_templates
  drop constraint if exists service_templates_interval_km_positive;

alter table public.service_templates
  add constraint service_templates_interval_km_positive
  check (interval_km > 0);


-- ایندکس مدل‌محور: کوئری اصلی همیشه (brand, model) است.
create index if not exists service_templates_brand_model_idx
  on public.service_templates (brand, model);


-- =============================================================
-- 9) یادآوری‌ها برای آینده (بدون تغییر امروز)
--
-- الف) انتقال مالکیت: با index یکتای بخش 4، برای انتقال
--      مالکیت باید اول end_date مالکیت قبلی ست شود. هیچ
--      policy ای برای UPDATE روی vehicle_ownerships وجود
--      ندارد، پس این کار فعلاً از کلاینت ممکن نیست و
--      باید با یک تابع security definer مثل
--      transfer_ownership() اضافه شود. تا آن زمان انتقال
--      مالکیت از پنل انجام می‌شود.
--
-- ب) service_items و service_centers هیچ policy ندارند و
--    عملاً از Data API بسته‌اند. چون فرانت‌اند هم از آن‌ها
--    استفاده نمی‌کند، عمداً همین‌طور بسته می‌مانند.
--
-- ج) grant های صریح: Supabase از 2026-10-30 جدول‌هایی که
--    به anon/authenticated دسترسی ندارند را به‌طور پیش‌فرض
--    منتشر نمی‌کند. جدول‌هایی که فرانت‌اند می‌خواند
--    (vehicles, vehicle_ownerships, services,
--    service_templates, profiles) باید grant صریح داشته
--    باشند تا بعد از آن تاریخ قطع نشوند.
-- =============================================================

grant usage on schema public to anon, authenticated;

grant select on table
  public.vehicles,
  public.vehicle_ownerships,
  public.services,
  public.service_templates,
  public.profiles
to authenticated;

grant select on table
  public.service_templates
to anon;


-- =============================================================
-- 10) لایهٔ دوم دفاعی روی grant ها
--
-- Supabase به‌صورت پیش‌فرض همهٔ امتیازها را به anon و
-- authenticated می‌دهد و RLS را به‌عنوان دروازه نگه می‌دارد.
-- ولی RLS روی TRUNCATE اعمال نمی‌شود. دسترسی‌های
-- TRUNCATE / REFERENCES / TRIGGER از مسیر Data API اصلاً
-- استفاده نمی‌شوند، پس برداشتنشان ریسک صفر و سود خالص است.
--
-- SELECT / INSERT / UPDATE / DELETE دست‌نخورده می‌ماند چون
-- PostgREST به آن‌ها نیاز دارد و RLS کنترلشان می‌کند.
-- =============================================================

revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;


-- =============================================================
-- وضعیت اجرا
-- =============================================================
-- این migration و migration شمارهٔ 011 در تاریخ 2026-10-17
-- روی پروژهٔ زندهٔ ezcdjwthdptfnyialjpw اجرا شدند.
--
-- اثبات پس از اجرا (probing با کلید anon عمومی):
--
--   POST /rest/v1/vehicles  {}
--     قبل از اجرا → HTTP 400 کد 23502  (مجوز داشت)
--     بعد از اجرا → HTTP 401 کد 42501  (RLS رد کرد)
--
-- شمارش policy ها: ۱۷ → ۱۱
--
-- وضعیت نهایی policy های جدول‌های حساس:
--   vehicles            : SELECT + UPDATE  (مالک فعال)
--   vehicle_ownerships  : SELECT + INSERT  (خودِ کاربر)
--   services            : SELECT + INSERT  (مالک فعال)
--   vehicle_services    : SELECT + INSERT  (مالک فعال)
--   service_templates   : SELECT           (دادهٔ مرجع)
--   profiles            : SELECT + UPDATE  (خودِ کاربر)
--
-- تصاحب خودرو (V3) با index یکتای
-- vehicle_ownerships_one_active_owner بسته شد.
--
-- ثبت خودرو از این پس فقط با register_vehicle انجام می‌شود؛
-- در نتیجه INSERT مستقیم روی vehicles برای هیچ نقشی باز
-- نیست و هیچ خودروی بی‌مالکی ساخته نمی‌شود.
-- =============================================================