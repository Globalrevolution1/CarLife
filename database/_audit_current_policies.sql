-- =============================================================
-- KARNEGAR — CURRENT POLICY AUDIT
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================

-- 1. ALL POLICIES
select
  tablename,
  policyname,
  cmd,
  roles,
  qual as using_expr,
  with_check as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 2. GRANTS (critical for 2026-10-30 Supabase change)
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;

-- 3. RLS STATUS PER TABLE
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;
