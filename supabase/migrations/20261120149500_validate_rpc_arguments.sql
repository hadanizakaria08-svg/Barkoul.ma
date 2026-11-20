-- Reject NULL/unknown arguments at every public RPC boundary.
-- This is additive hardening; no production migration is executed by this workflow.

CREATE OR REPLACE FUNCTION public.respond_to_negotiation(
  p_negotiation_id bigint,
  p_accept boolean
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_negotiation_id IS NULL OR p_accept IS NULL THEN
    RAISE EXCEPTION 'Negotiation ID and decision are required';
  END IF;
  RETURN private.respond_to_negotiation_impl(p_negotiation_id, p_accept);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_trip_progress(
  p_trip_id bigint,
  p_status text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_trip_id IS NULL OR p_status IS NULL
     OR p_status NOT IN ('loading','in_transit','delivered','cancelled') THEN
    RAISE EXCEPTION 'Trip ID and a supported status are required';
  END IF;
  PERFORM private.update_trip_progress_impl(p_trip_id,p_status,p_latitude,p_longitude);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_role(
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_role IS NULL
     OR p_role NOT IN ('user','driver','owner') THEN
    RAISE EXCEPTION 'User ID and a supported role are required';
  END IF;
  PERFORM private.admin_set_profile_role_impl(p_user_id,p_role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_role_request(
  p_request_id bigint,
  p_approve boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_request_id IS NULL OR p_approve IS NULL THEN
    RAISE EXCEPTION 'Request ID and review decision are required';
  END IF;
  PERFORM private.admin_review_role_request_impl(p_request_id,p_approve);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_driver_document(
  p_document_id bigint,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_document_id IS NULL OR p_status IS NULL
     OR p_status NOT IN ('verified','rejected') THEN
    RAISE EXCEPTION 'Document ID and supported review status are required';
  END IF;
  PERFORM private.admin_review_driver_document_impl(p_document_id,p_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_record_commission_payment(
  p_charge_id bigint,
  p_method text,
  p_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_charge_id IS NULL OR p_method IS NULL
     OR p_method NOT IN ('cash','electronic') THEN
    RAISE EXCEPTION 'Charge ID and supported payment method are required';
  END IF;
  IF p_method = 'electronic' AND NULLIF(btrim(p_reference),'') IS NULL THEN
    RAISE EXCEPTION 'Electronic payment requires a verified reference';
  END IF;
  PERFORM private.admin_record_commission_payment_impl(p_charge_id,p_method,p_reference);
END;
$function$;

REVOKE ALL ON FUNCTION public.respond_to_negotiation(bigint,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_trip_progress(bigint,text,double precision,double precision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_profile_role(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_role_request(bigint,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_driver_document(bigint,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_record_commission_payment(bigint,text,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.respond_to_negotiation(bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_progress(bigint,text,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_role_request(bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_driver_document(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_commission_payment(bigint,text,text) TO authenticated;
