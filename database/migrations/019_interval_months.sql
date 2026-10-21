-- =============================================================
-- 019_interval_months.sql
--
-- چرا:
--   سلامت خودرو فقط بر مبنای کیلومتر سنجیده می‌شد. خودرویی که
--   سالی ۵,۰۰۰ کیلومتر می‌رود هرگز به آستانهٔ کیلومتری نمی‌رسید
--   و همیشه «سالم» نشان داده می‌شد، در حالی که روغن موتور باید
--   هر ۶ ماه عوض شود حتی اگر خودرو بی‌حرکت مانده باشد.
--
--   قاعدهٔ موتور سلامت: «هر کدام زودتر برسد» — کیلومتر یا ماه.
--
-- ستون تازه است؛ ردیف‌هایی که ماه نداشته باشند فقط بر مبنای
-- کیلومتر سنجیده می‌شوند، پس رفتار قبلی حفظ می‌شود.
--
-- مقادیر عمداً کمی زودتر از کاتالوگ کارخانه‌اند:
--   تعویض زودتر ضرری ندارد، تأخیر ضرر دارد.
--
-- روی دیتابیس زنده اجرا شده (۲۰۲۶-۱۰-۲۱).
-- =============================================================

alter table public.service_templates
  add column if not exists interval_months smallint;


-- -------------------------------------------------------------
-- نگاشت نام سرویس ← ماه
--
-- هم نام‌های استاندارد کاتالوگ (migration 017) و هم نام‌های
-- قدیمیِ باقی‌مانده از migration 011 پوشش داده می‌شوند تا ردیف
-- اختصاصی خودروها هم مبناِ زمان بگیرند.
--
-- این جدول unique constraint ندارد، پس update بر اساس نام روی
-- همهٔ ردیف‌های همان نام اعمال می‌شود (رفتارِ خواسته‌شده).
-- -------------------------------------------------------------

update public.service_templates t
   set interval_months = v.months
  from (
    values
      ('تعویض روغن موتور',   smallint '6'),
      ('تعویض روغن',         smallint '6'),
      ('فیلتر روغن',         smallint '6'),
      ('فیلتر هوا',          smallint '12'),
      ('تعویض فیلتر هوا',    smallint '12'),
      ('فیلتر کابین',        smallint '12'),
      ('روغن گیربکس',        smallint '24'),
      ('تعویض روغن گیربکس',  smallint '24'),
      ('روغن ترمز',          smallint '24'),
      ('ضد یخ',              smallint '24'),
      ('شمع',                smallint '30'),
      ('فیلتر بنزین',        smallint '24'),
      ('لنت ترمز جلو',       smallint '24'),
      ('لنت ترمز عقب',       smallint '24'),
      ('باتری',              smallint '36'),
      ('تسمه تایم',          smallint '60'),
      ('تعویض لاستیک',       smallint '60')
  ) as v(service_name, months)
 where t.service_name = v.service_name
   and t.interval_months is null;


-- -------------------------------------------------------------
-- قید: یا خالی، یا مثبت
-- -------------------------------------------------------------
-- اجرای چندبارهٔ فایل باید بی‌خطر باشد
alter table public.service_templates
  drop constraint if exists service_templates_interval_months_positive;

alter table public.service_templates
  add constraint service_templates_interval_months_positive
  check (interval_months is null or interval_months > 0);


-- -------------------------------------------------------------
-- راستی‌آزمایی انتظار
--
-- select
--   count(*)                                                    as total,
--   count(interval_months)                                      as with_months,
--   count(*) filter (where interval_months is null)             as without_months,
--   count(distinct service_name)                               as distinct_services
--   from public.service_templates;
--
-- و برای هر سرویس:
--
-- select service_name, min(interval_km), max(interval_km), min(interval_months)
--   from public.service_templates
--  group by service_name
--  order by min(interval_months), service_name;
-- -------------------------------------------------------------
