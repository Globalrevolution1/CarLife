-- =============================================================
-- QUICK CHECK — یک query، همهٔ ابهام‌های بحرانی
-- =============================================================
-- این را در SQL Editor جدید paste و Run کن.
-- فقط SELECT است. هیچ تغییری نمی‌دهد.
--
-- خروجی یک سطر JSON است که می‌گوید:
--   - چه جدول‌هایی واقعاً وجود دارند
--   - چه ستون‌هایی هست (به‌خصوص current_mileage)
--   - دقیقاً چه RLS policy هایی وجود دارد  ← مهم‌ترین
--   - محدودیت‌های CHECK / FK / UNIQUE
--   - grant ها به anon و authenticated
-- =============================================================

select jsonb_build_object(

  'tables', (
    select jsonb_agg(t.n order by t.n)
    from (
      select c.relname as n
      from pg_class c
      join pg_namespace nsp on nsp.oid = c.relnamespace
      where nsp.nspname = 'public'
        and c.relkind = 'r'
    ) t
  ),

  'columns', (
    select jsonb_object_agg(
      co.table_name || '.' || co.column_name,
      co.data_type
        || case when co.is_nullable = 'NO' then ' NOT NULL' else '' end
        || case when co.column_default is not null
               then ' default=' || co.column_default else '' end
    )
    from information_schema.columns co
    where co.table_schema = 'public'
  ),

  'policies', (
    select jsonb_agg(
      jsonb_build_object(
        'table',  p.tablename,
        'name',   p.policyname,
        'cmd',    p.cmd,
        'roles',  p.roles,
        'using',  p.qual,
        'check',  p.with_check
      )
      order by p.tablename, p.policyname
    )
    from pg_policies p
    where p.schemaname = 'public'
  ),

  'constraints', (
    select jsonb_agg(
      jsonb_build_object(
        'table', con.conrelid::regclass::text,
        'name',  con.conname,
        'def',   pg_get_constraintdef(con.oid)
      )
      order by con.conrelid::regclass::text, con.conname
    )
    from pg_constraint con
    where con.connamespace = 'public'::regnamespace
      and con.contype in ('c', 'f', 'u', 'p')
  ),

  'grants', (
    select jsonb_agg(
      jsonb_build_object(
        'table', g.table_name,
        'role',  g.grantee,
        'privs', g.privilege_type
      )
      order by g.table_name, g.grantee, g.privilege_type
    )
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee in ('anon', 'authenticated', 'service_role')
  )

) as reality;