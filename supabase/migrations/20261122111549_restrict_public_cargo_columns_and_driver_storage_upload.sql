-- Restrict public cargo reads to non-identifying columns and driver document uploads
-- to accounts whose profile role has been activated by an administrator.

REVOKE SELECT ON TABLE public.cargos FROM anon;
GRANT SELECT (id,title,origin_city,destination_city,goods_type,weight_text,
  truck_type,loading_date,offered_price_mad,notes,status,created_at)
  ON TABLE public.cargos TO anon;

DROP POLICY IF EXISTS driver_documents_private_upload ON storage.objects;
CREATE POLICY driver_documents_private_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'driver'
    )
  );
