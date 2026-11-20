-- Barkoul.ma read-only security inventory for Supabase SQL Editor.
-- Every statement below is SELECT-only. This file does not alter schema, data, grants, or policies.
-- Run each query separately and share the result tables (redact personal data if any appears).

-- 1) Tables, owners, and RLS flags.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS table_owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname IN ('public', 'storage')
ORDER BY n.nspname, c.relname;

-- 2) Columns, types, nullability, and defaults.
SELECT
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema IN ('public', 'storage')
ORDER BY table_schema, table_name, ordinal_position;

-- 3) Primary keys, foreign keys, unique/check constraints, and definitions.
SELECT
  ns.nspname AS schema_name,
  tbl.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class tbl ON tbl.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
WHERE ns.nspname IN ('public', 'storage')
ORDER BY ns.nspname, tbl.relname, con.contype, con.conname;

-- 4) RLS policies, including command, roles, USING, and WITH CHECK.
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

-- 5) Table and sequence grants.
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema IN ('public', 'storage')
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT
  sequence_schema,
  sequence_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.role_usage_grants
WHERE object_type = 'SEQUENCE'
  AND object_schema IN ('public', 'storage')
ORDER BY object_schema, object_name, grantee, privilege_type;

-- 6) Functions: owner, SECURITY DEFINER, configured search_path, and execute grants.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  p.proacl AS function_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'storage')
ORDER BY n.nspname, p.proname, arguments;

-- 7) Triggers and their attached functions.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid, true) AS trigger_definition,
  pn.nspname AS function_schema,
  p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND n.nspname IN ('public', 'storage')
ORDER BY n.nspname, c.relname, t.tgname;

-- 8) Storage buckets and their public/file restrictions (metadata only).
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
ORDER BY name;
