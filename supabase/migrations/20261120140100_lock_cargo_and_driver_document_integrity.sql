-- Protect cargo lifecycle transitions and preserve verified driver evidence.
-- Direct client updates to cargos are no longer allowed; cancellation is an owner/admin RPC.

REVOKE UPDATE ON TABLE public.cargos FROM PUBLIC, authenticated;
REVOKE UPDATE (id, title, origin_city, destination_city, goods_type, weight_text,
  truck_type, loading_date, offered_price_mad, notes, status, created_at, owner_id)
  ON TABLE public.cargos FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION private.cancel_open_cargo_impl(p_cargo_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.cargos
  SET status = 'cancelled'
  WHERE id = p_cargo_id
    AND status = 'open'
    AND (owner_id = v_uid OR (SELECT private.is_admin()));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cargo unavailable';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.cancel_open_cargo_impl(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cancel_open_cargo_impl(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_open_cargo(p_cargo_id bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.cancel_open_cargo_impl(p_cargo_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_open_cargo(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_open_cargo(bigint) TO authenticated;

-- A driver may only register a document row for an object actually uploaded
-- into that driver's own private folder.
DROP POLICY IF EXISTS documents_insert_owner ON public.driver_documents;
CREATE POLICY documents_insert_owner ON public.driver_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id = (SELECT auth.uid())
    AND review_status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'driver'
    )
    AND (storage.foldername(storage_path))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'driver-documents'
        AND o.name = storage_path
    )
  );

-- Keep orphan/pending/rejected uploads removable, but prevent a driver from
-- deleting the underlying object after an administrator verifies it.
DROP POLICY IF EXISTS driver_documents_private_delete_own ON storage.objects;
CREATE POLICY driver_documents_private_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1 FROM public.driver_documents d
      WHERE d.storage_path = storage.objects.name
        AND d.driver_id = (SELECT auth.uid())
        AND d.review_status = 'verified'
    )
  );
-- Reduce client writes to the exact columns used by the application.
-- IDs, timestamps, reviewer fields, and lifecycle-controlled records remain database-owned.
REVOKE INSERT ON TABLE public.cargos FROM PUBLIC, authenticated;
REVOKE INSERT (id, title, origin_city, destination_city, goods_type, weight_text,
  truck_type, loading_date, offered_price_mad, notes, status, created_at, owner_id)
  ON TABLE public.cargos FROM PUBLIC, authenticated;
GRANT INSERT (title, origin_city, destination_city, goods_type, weight_text,
  truck_type, loading_date, offered_price_mad, notes, status, owner_id)
  ON TABLE public.cargos TO authenticated;
REVOKE DELETE ON TABLE public.cargos FROM PUBLIC, authenticated;
DROP POLICY IF EXISTS cargos_secure_delete ON public.cargos;

REVOKE INSERT ON TABLE public.driver_documents FROM PUBLIC, authenticated;
REVOKE INSERT (id, driver_id, document_type, storage_path, review_status, uploaded_at)
  ON TABLE public.driver_documents FROM PUBLIC, authenticated;
GRANT INSERT (driver_id, document_type, storage_path, review_status)
  ON TABLE public.driver_documents TO authenticated;

REVOKE INSERT ON TABLE public.negotiations FROM PUBLIC, authenticated;
REVOKE INSERT (id, cargo_id, proposer_id, proposed_price_mad, message, status, created_at)
  ON TABLE public.negotiations FROM PUBLIC, authenticated;
GRANT INSERT (cargo_id, proposer_id, proposed_price_mad, message, status)
  ON TABLE public.negotiations TO authenticated;

REVOKE INSERT ON TABLE public.profile_role_requests FROM PUBLIC, authenticated;
REVOKE INSERT (id, user_id, requested_role, status, created_at, reviewed_at, reviewed_by)
  ON TABLE public.profile_role_requests FROM PUBLIC, authenticated;
GRANT INSERT (user_id, requested_role, status)
  ON TABLE public.profile_role_requests TO authenticated;

-- Profile rows are created only by the Auth user-created trigger.
REVOKE INSERT ON TABLE public.profiles FROM PUBLIC, authenticated;
REVOKE INSERT (id, full_name, phone, role, created_at)
  ON TABLE public.profiles FROM PUBLIC, authenticated;

-- New cargo records always begin open, including those inserted by admins.
DROP POLICY IF EXISTS cargos_secure_insert ON public.cargos;
CREATE POLICY cargos_secure_insert ON public.cargos
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'open'
    AND (
      (owner_id = (SELECT auth.uid()) AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.role = 'owner'
      ))
      OR (SELECT private.is_admin())
    )
  );

-- Backfill active Auth accounts created before the profile trigger existed.
-- Preserve the owner role only where an existing cargo row already proves ownership;
-- all other recovered accounts receive the least-privilege user role.
INSERT INTO public.profiles (id, full_name, role)
SELECT u.id,
       NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
       CASE WHEN EXISTS (
         SELECT 1 FROM public.cargos c WHERE c.owner_id = u.id
       ) THEN 'owner' ELSE 'user' END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL AND u.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;
