-- =============================================================
-- KARNEGAR — DETAILED POLICY AUDIT (run this)
-- =============================================================
select
  tablename,
  policyname,
  cmd,
  roles,
  qual as using_expr,
  with_check as check_expr
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;
