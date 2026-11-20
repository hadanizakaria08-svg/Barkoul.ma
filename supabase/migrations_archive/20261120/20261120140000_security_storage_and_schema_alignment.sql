-- Barkoul.ma production hardening migration
-- Applies to the existing public schema. No application data is deleted.
-- Reviewed against the live project on 2026-11-20.

CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS driver_documents_driver_id_idx ON public.driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS negotiations_proposer_id_idx ON public.negotiations(proposer_id);
CREATE INDEX IF NOT EXISTS trips_driver_id_idx ON public.trips(driver_id);
CREATE INDEX IF NOT EXISTS trips_owner_id_idx ON public.trips(owner_id);

-- Private admin predicate: never expose a SECURITY DEFINER admin RPC through public.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
  );
$function$;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- Replace every policy that depended on public.is_admin().
DROP POLICY IF EXISTS cargos_secure_read ON public.cargos;
DROP POLICY IF EXISTS cargos_authenticated_read ON public.cargos;
DROP POLICY IF EXISTS cargos_public_open_read ON public.cargos;
DROP POLICY IF EXISTS cargos_secure_insert ON public.cargos;
DROP POLICY IF EXISTS cargos_secure_update ON public.cargos;
DROP POLICY IF EXISTS cargos_secure_delete ON public.cargos;

CREATE POLICY cargos_public_open_read ON public.cargos
  FOR SELECT TO anon USING (status = 'open');
CREATE POLICY cargos_authenticated_read ON public.cargos
  FOR SELECT TO authenticated
  USING (status = 'open' OR owner_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));
CREATE POLICY cargos_secure_insert ON public.cargos
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));
CREATE POLICY cargos_secure_update ON public.cargos
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT private.is_admin()))
  WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));
CREATE POLICY cargos_secure_delete ON public.cargos
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

DROP POLICY IF EXISTS profiles_read_own ON public.profiles;
CREATE POLICY profiles_read_own ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

DROP POLICY IF EXISTS admin_audit_log_admin_read ON public.admin_audit_log;
CREATE POLICY admin_audit_log_admin_read ON public.admin_audit_log
  FOR SELECT TO authenticated USING ((SELECT private.is_admin()));
DROP POLICY IF EXISTS admin_users_admin_read ON public.admin_users;
CREATE POLICY admin_users_admin_read ON public.admin_users
  FOR SELECT TO authenticated USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS documents_read_owner_or_admin ON public.driver_documents;
CREATE POLICY documents_read_owner_or_admin ON public.driver_documents
  FOR SELECT TO authenticated
  USING (driver_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));
DROP POLICY IF EXISTS documents_admin_update ON public.driver_documents;
CREATE POLICY documents_admin_update ON public.driver_documents
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));
GRANT UPDATE (review_status) ON public.driver_documents TO authenticated;

-- Align child foreign keys with cargos.id (BIGINT). Current child tables are empty.
DROP POLICY IF EXISTS negotiations_insert_self ON public.negotiations;
DROP POLICY IF EXISTS negotiations_read_parties ON public.negotiations;
ALTER TABLE public.negotiations DROP CONSTRAINT IF EXISTS negotiations_cargo_id_fkey;
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_cargo_id_fkey;
ALTER TABLE public.negotiations ALTER COLUMN cargo_id TYPE bigint USING cargo_id::bigint;
ALTER TABLE public.trips ALTER COLUMN cargo_id TYPE bigint USING cargo_id::bigint;
ALTER TABLE public.negotiations ADD CONSTRAINT negotiations_cargo_id_fkey
  FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE CASCADE;
ALTER TABLE public.trips ADD CONSTRAINT trips_cargo_id_fkey
  FOREIGN KEY (cargo_id) REFERENCES public.cargos(id);
CREATE POLICY negotiations_insert_self ON public.negotiations
  FOR INSERT TO authenticated
  WITH CHECK (
    proposer_id = (SELECT auth.uid()) AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.cargos c
      WHERE c.id = negotiations.cargo_id AND c.status = 'open'
        AND c.owner_id <> (SELECT auth.uid())
    )
  );
CREATE POLICY negotiations_read_parties ON public.negotiations
  FOR SELECT TO authenticated
  USING (
    proposer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.cargos c
      WHERE c.id = negotiations.cargo_id AND c.owner_id = (SELECT auth.uid())
    )
  );

-- Keep profile role escalation protection and remove the exposed legacy function.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND (SELECT auth.uid()) IS NOT NULL
     AND (SELECT auth.jwt() ->> 'role') = 'authenticated'
     AND NOT (SELECT private.is_admin())
  THEN
    RAISE EXCEPTION 'You are not allowed to change your account role';
  END IF;
  RETURN NEW;
END;
$function$;
DROP FUNCTION IF EXISTS public.is_admin();

-- Create a least-privilege profile for each new Auth user.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles(id, full_name, role)
  VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Private bucket for driver identity documents; no public object access.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('driver-documents', 'driver-documents', false, 10485760,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS driver_documents_private_read ON storage.objects;
CREATE POLICY driver_documents_private_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
         OR (SELECT private.is_admin()))
  );
DROP POLICY IF EXISTS driver_documents_private_upload ON storage.objects;
CREATE POLICY driver_documents_private_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
DROP POLICY IF EXISTS driver_documents_private_delete_own ON storage.objects;
CREATE POLICY driver_documents_private_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
