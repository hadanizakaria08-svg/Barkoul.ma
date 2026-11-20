-- Evaluate verified-document deletion eligibility with a SECURITY DEFINER helper.
-- The storage.objects DELETE policy otherwise cannot reliably inspect the protected
-- public.driver_documents row through the nested RLS policy context.
CREATE OR REPLACE FUNCTION private.can_delete_driver_document_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    p_name IS NOT NULL
    AND (storage.foldername(p_name))[1] = (SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.driver_documents d
      WHERE d.storage_path = p_name
        AND d.driver_id = (SELECT auth.uid())
        AND d.review_status = 'verified'
    );
$function$;

REVOKE ALL ON FUNCTION private.can_delete_driver_document_object(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_delete_driver_document_object(text)
  TO authenticated;

DROP POLICY IF EXISTS driver_documents_private_delete_own ON storage.objects;
CREATE POLICY driver_documents_private_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND private.can_delete_driver_document_object(name)
  );
