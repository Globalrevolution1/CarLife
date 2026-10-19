-- =============================================================
-- KARNEGAR / SCHEMA INTROSPECTION  (READ ONLY - SAFE TO RUN)
-- =============================================================
-- هدف:
--   گرفتن وضعیت واقعی دیتابیس Supabase و مقایسه با
--   database/migrations/*.sql و با KARNEGAR_MASTER_CONTEXT.md
--
-- این اسکریپت هیچ چیزی را تغییر نمی‌دهد.
-- فقط SELECT می‌زند.
--
-- روش اجرا:
--   Supabase Dashboard → SQL Editor → New query
--   کل محتوای این فایل را paste کن → Run
--   خروجی را کپی کن و در فایل زیر ذخیره کن:
--       D:\Project\CarLife\database\_actual_schema_dump.txt
--
-- هدف نهایی:
--   بعد از این dump، دیگر هیچ تغییری در داشبورد انجام نمی‌دهیم.
--   هر تغییر بعدی فقط از طریق migration نسخه‌بندی‌شده خواهد بود.
-- =============================================================


-- -------------------------------------------------------------
-- 1. جداول موجود + تعداد ردیف
-- -------------------------------------------------------------

select
  c.relname                                        as table_name,
  c.reltuples::bigint                              as approx_rows,
  obj_description(c.oid)                          as comment,
  (c.relrowsecurity)                               as rls_enabled,
  (c.relforcerowsecurity)                          as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;


-- -------------------------------------------------------------
-- 2. تمام ستون‌ها با نوع دقیق و nullable بودن
--    (برای مقایسه با migrations)
-- -------------------------------------------------------------

select
  table_name,
  ordinal_position                                  as pos,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default,
  character_maximum_length
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;


-- -------------------------------------------------------------
-- 3. محدودیت‌ها: PRIMARY KEY / UNIQUE / CHECK / FOREIGN KEY
--    (تناقض verification_status را اینجا می‌بینیم)
-- -------------------------------------------------------------

select
  conrelid::regclass                               as table_name,
  conname                                           as constraint_name,
  contype                                           as type,
  pg_get_constraintdef(oid)                        as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, contype, conname;


-- -------------------------------------------------------------
-- 4. تمام RLS Policy ها  ←  مهم‌ترین بخش
--    (policy هایی که دستی در داشبورد ساخته شده‌اند اینجا می‌آیند)
-- -------------------------------------------------------------

select
  schemaname                                        as schema,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual                                             as using_expr,
  with_check                                        as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- -------------------------------------------------------------
-- 5. GRANT های جداول  (برای بررسی مهلت 2026-10-30 که در
--    changelog رسمی Supabase اعلام شده)
-- -------------------------------------------------------------

select
  table_name,
  grantee,
  string_agg(
    privilege_type,
    ', ' order by privilege_type
  )                                                 as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;


-- -------------------------------------------------------------
-- 6. Index ها  (برای بررسی کارایی policy ها)
-- -------------------------------------------------------------

select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;


-- -------------------------------------------------------------
-- 7. Trigger ها
-- -------------------------------------------------------------

select
  event_object_table                               as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;


-- -------------------------------------------------------------
-- 8. Default ACL ها
--    (Supabase در 2026-05-30 پیش‌فرض را عوض کرد؛ برای پروژه‌های
--     قدیمی از 2026-10-30 اعمال می‌شود)
-- -------------------------------------------------------------

select
  pg_get_userbyid(defaclrole)                       as owner,
  defaclnamespace::regnamespace                     as schema,
  case defaclobjtype
    when 'r' then 'table'
    when 'S' then 'sequence'
    when 'f' then 'function'
    when 'T' then 'type'
    else defaclobjtype::text
  end                                               as object_type,
  defaclacl
from pg_default_acl;


-- -------------------------------------------------------------
-- 9. داده‌های موجود (شمارش فقط، بدون افشای اطلاعات شخصی)
--    برای اینکه بدانیم backfill / migration چه حجمی دارد
-- -------------------------------------------------------------

select 'vehicles'            as table_name, count(*) as rows from public.vehicles
union all
select 'vehicle_ownerships',  count(*) from public.vehicle_ownerships
union all
select 'services',           count(*) from public.services
union all
select 'service_items',      count(*) from public.service_items
union all
select 'vehicle_services',   count(*) from public.vehicle_services
union all
select 'service_templates',  count(*) from public.service_templates
union all
select 'service_centers',    count(*) from public.service_centers
union all
select 'profiles',           count(*) from public.profiles;


-- -------------------------------------------------------------
-- 10. وضعیت verification_status واقعی
-- -------------------------------------------------------------

select
  verification_status,
  count(*)                                         as rows
from public.services
group by verification_status
order by verification_status;


-- -------------------------------------------------------------
-- 11. آیا مالکیت منقضی‌شده (end_date is not null) وجود دارد؟
--     این برای تصمیم امنیتی درباره RLS خودرو حیاتی است.
-- -------------------------------------------------------------

select
  case
    when end_date is null then 'current_owner'
    else 'former_owner'
  end                                               as ownership_state,
  count(*)                                         as rows
from public.vehicle_ownerships
group by 1
order by 1;


-- -------------------------------------------------------------
-- 12. نسخه Postgres و افزونه‌های مهم
--     (Postgres 14 در 2026-07-01 پایان پشتیبانی داشت)
-- -------------------------------------------------------------

select version()                                      as postgres_version;

select
  extname,
  extversion
from pg_extension
where extname in ('ltree', 'btree_gist', 'pgcrypto', 'plpgsql_check')
order by extname;


-- -------------------------------------------------------------
-- 13. خطاهای RLS که Advisors پیدا می‌کند
--     (0013 rls_disabled / 0008 rls_enabled_no_policy /
--      0006 multiple_permissive_policies)
-- -------------------------------------------------------------

select
  c.relname                                         as table_name,
  case
    when not c.relrowsecurity then 'RLS DISABLED - PUBLICLY ACCESSIBLE'
    when not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
    ) then 'RLS ENABLED BUT NO POLICY (deny all)'
    else 'has policies'
  end                                               as rls_state
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by
  case
    when not c.relrowsecurity then 0
    when not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
    ) then 1
    else 2
  end,
  c.relname;