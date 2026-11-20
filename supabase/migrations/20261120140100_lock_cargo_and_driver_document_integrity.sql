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
