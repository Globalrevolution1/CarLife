-- =============================================================
-- پاک‌سازی دادهٔ تست End-to-End
-- =============================================================
-- آخرین به‌روزرسانی: 2026-10-19
--
-- تست‌های انجام‌شده روی دیتابیس زنده:
--   2026-10-18: ثبت‌نام → ثبت خودرو → ثبت سرویس → بررسی سلامت
--   2026-10-19: ثبت مرکز خدمات → انتخاب مرکز هنگام ثبت سرویس
--               → تأیید سرویس توسط مرکز
--   2026-10-19: ساخت کد انتقال → دریافت با حساب دوم
--               → بسته شدن دسترسی مالک قبلی
--   2026-10-19: پوشش template برای مدل ثبت‌نشده
--               → ثبت سرویس با تصویر فاکتور (Storage)
--
-- چیزهایی که این فایل پاک می‌کند:
--   * ۱ خودروی تست (پژو 206 تیپ 9)
--     → مالکیت‌ها، سرویس‌ها و کدهای انتقال با CASCADE پاک می‌شوند
--   * ۱ مرکز خدمات تست
--   * ۱ کاربر تست
--     → پروفایل با CASCADE پاک می‌شود
--
-- دستور حذف خودرو باید قبل از حذف مرکز و کاربر اجرا شود.
--
-- ⚠ قبل از اجرا مطمئن شو این مقادیر دادهٔ واقعی نیستند:
--      vin    = 'IRANE2E0000000101'
--      center = 'تعمیرگاه مرکز تست'
--      email  = 'karnegar.e2e.20261018@example.com'
-- =============================================================


-- =============================================================
-- ۰) تصاویر فاکتور — نکتهٔ حیاتی
--
--    حذف مستقیم از storage.objects با خطای زیر مسدود است:
--      ERROR: Direct deletion from storage tables is not allowed.
--             Use the Storage API instead.
--    (تریگر storage.protect_delete — حتی برای postgres)
--
--    پس تصویر باید «قبل از این اسکریپت» و «با حسابِ مالک» از
--    Storage API حذف شود؛ وگرنه بعد از حذفِ مالکیت، فایل
--    برای همیشه یتیم می‌ماند (هیچ policy ای دیگر به آن
--    دسترسی نمی‌دهد).
--
--    کد لازم در کنسولِ صفحهٔ لاگین‌شده (یا هر جای اپ):
--
--      const mod = await import("/src/lib/supabase.js");
--      await mod.supabase.storage.from("service-invoices")
--        .remove(["<vehicle_id>/<uuid>.png"]);
--
--    یا حذف گروهی برای همهٔ خودروهای یک کاربر:
--      ۱) از دیتابیس مسیرها را بگیر:
--           select o.name from storage.objects o
--            where o.bucket_id = 'service-invoices';
--      ۲) هر کدام را با remove([...]) از طریق کلاینت پاک کن.
--
--    نکته: سیاست DELETE استوریج برای «مالک فعالِ همان خودرو»
--    ساخته شده (migration 015)؛ پس حذف باید قبل از انتقال
--    مالکیت و قبل از حذف کاربر انجام شود.
-- =============================================================

select
  (select count(*) from storage.objects
    where bucket_id = 'service-invoices') as invoice_images_total;


-- =============================================================
-- ۱) بررسی قبل از حذف
-- =============================================================

select
  (select count(*) from public.vehicles) as vehicles,
  (select count(*) from public.vehicle_ownerships) as ownerships,
  (select count(*) from public.services) as services,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from auth.users) as users,
  (select count(*) from public.service_centers) as centers,
  (select count(*) from public.vehicle_transfer_codes) as codes,
  (select count(*) from public.vehicles
     where vin = 'IRANE2E0000000101') as test_vehicle,
  (select count(*) from auth.users
     where email = 'karnegar.e2e.20261018@example.com') as test_users,
  (select count(*) from public.service_centers sc
     where sc.owner_id in (
       select u.id from auth.users u
        where u.email = 'karnegar.e2e.20261018@example.com')) as test_centers;


-- =============================================================
-- ۲) حذف خودروی تست
--    (مالکیت‌ها، سرویس‌ها و کدهای انتقال با CASCADE پاک می‌شوند)
-- =============================================================

delete from public.vehicles
where vin = 'IRANE2E0000000101';


-- =============================================================
-- ۳) حذف مرکز خدمات تست
--    (باید بعد از حذف سرویس‌ها باشد تا FK راضی بماند)
-- =============================================================

delete from public.service_centers sc
using auth.users u
where sc.owner_id = u.id
  and u.email = 'karnegar.e2e.20261018@example.com';


-- =============================================================
-- ۴) حذف کاربر تست
--    (پروفایل با CASCADE پاک می‌شود)
-- =============================================================

delete from auth.users
where email in (
  'karnegar.e2e.20261018@example.com',
  'karnegar.buyer.20261019@example.com'
);


-- =============================================================
-- ۵) بررسی بعد از حذف
--
--    کاربرِ واقعی پروژه نباید حذف شود؛ ایمیل‌های زیر
--    هیچ‌کدام نباید باقی بمانند و باید دقیقاً ۱ کاربر
--    (حساب واقعی کارفرما) باقی بماند.
-- =============================================================

select
  (select count(*) from public.vehicles) as vehicles,
  (select count(*) from public.vehicle_ownerships) as ownerships,
  (select count(*) from public.services) as services,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from auth.users) as users,
  (select count(*) from public.service_centers) as centers,
  (select count(*) from public.vehicle_transfer_codes) as codes,
  (select count(*) from storage.objects
    where bucket_id = 'service-invoices') as invoice_images,
  (select count(*) from public.vehicles
     where vin in (
       'IRANE2E0000000101',   -- خودروی تست پوشش template + فاکتور
       'IRANE2E0000000099',   -- خودروی تست E2E قبلی
       'TESTVIN90000000001',  -- تست تابع register_vehicle
       'ANONPROBE00000001'    -- تست دسترسی anon
     )) as leftover_vehicles,
  (select count(*) from auth.users
     where email like 'karnegar.%') as leftover_test_users,
  (select count(*) from public.service_centers
     where name in (
       'تعویض روغنی کارنگار تست',
       'تعمیرگاه مرکز تست'
     )) as leftover_test_centers,
  (select count(*) from public.vehicle_transfer_codes) as leftover_codes;
