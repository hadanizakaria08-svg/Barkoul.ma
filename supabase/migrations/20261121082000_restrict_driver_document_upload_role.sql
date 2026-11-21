-- Only accounts approved as drivers may upload into the private driver-document bucket.
-- A driver can upload before verification so the first document can be reviewed.
DROP POLICY IF EXISTS driver_documents_bucket_insert_guard ON storage.objects;

CREATE POLICY driver_documents_bucket_insert_guard ON storage.objects
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id <> 'driver-documents'
  OR (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'driver'
    )
  )
);
