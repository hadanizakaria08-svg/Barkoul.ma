-- Prevent duplicate pending offers by the same driver on the same cargo.
CREATE UNIQUE INDEX IF NOT EXISTS negotiations_one_pending_per_driver_cargo
ON public.negotiations(cargo_id,proposer_id) WHERE status='pending';

-- All document review decisions must be made through an audited RPC.
DROP POLICY IF EXISTS documents_admin_update ON public.driver_documents;
REVOKE UPDATE (review_status) ON public.driver_documents FROM authenticated;

CREATE OR REPLACE FUNCTION private.admin_review_driver_document_impl(p_document_id bigint,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_driver uuid;
BEGIN
 IF NOT (SELECT private.is_admin()) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF p_status NOT IN ('verified','rejected') THEN RAISE EXCEPTION 'Unsupported document review status'; END IF;
 SELECT driver_id INTO v_driver FROM public.driver_documents WHERE id=p_document_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
 UPDATE public.driver_documents SET review_status=p_status WHERE id=p_document_id;
 INSERT INTO public.admin_audit_log(admin_id,action,target_table,target_id)
 VALUES((SELECT auth.uid()),CASE WHEN p_status='verified' THEN 'driver_document_verified' ELSE 'driver_document_rejected' END,'driver_documents',p_document_id::text);
END;
$function$;
REVOKE ALL ON FUNCTION private.admin_review_driver_document_impl(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.admin_review_driver_document_impl(bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_driver_document(p_document_id bigint,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $function$ BEGIN PERFORM private.admin_review_driver_document_impl(p_document_id,p_status); END; $function$;
REVOKE ALL ON FUNCTION public.admin_review_driver_document(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_review_driver_document(bigint,text) TO authenticated;
