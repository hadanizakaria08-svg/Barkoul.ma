-- Keep RPC entry points SECURITY INVOKER in the exposed API schema.
-- Move the privileged implementations into the non-exposed private schema.
ALTER FUNCTION public.respond_to_negotiation(bigint,boolean) SET SCHEMA private;
ALTER FUNCTION private.respond_to_negotiation(bigint,boolean) RENAME TO respond_to_negotiation_impl;
ALTER FUNCTION public.update_trip_progress(bigint,text,double precision,double precision) SET SCHEMA private;
ALTER FUNCTION private.update_trip_progress(bigint,text,double precision,double precision) RENAME TO update_trip_progress_impl;
ALTER FUNCTION public.admin_set_profile_role(uuid,text) SET SCHEMA private;
ALTER FUNCTION private.admin_set_profile_role(uuid,text) RENAME TO admin_set_profile_role_impl;
ALTER FUNCTION public.admin_review_role_request(bigint,boolean) SET SCHEMA private;
ALTER FUNCTION private.admin_review_role_request(bigint,boolean) RENAME TO admin_review_role_request_impl;

REVOKE ALL ON FUNCTION private.respond_to_negotiation_impl(bigint,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.update_trip_progress_impl(bigint,text,double precision,double precision) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.admin_set_profile_role_impl(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION private.admin_review_role_request_impl(bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.respond_to_negotiation_impl(bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_trip_progress_impl(bigint,text,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_set_profile_role_impl(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_review_role_request_impl(bigint,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_negotiation(p_negotiation_id bigint,p_accept boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $function$ BEGIN RETURN private.respond_to_negotiation_impl(p_negotiation_id,p_accept); END; $function$;

CREATE OR REPLACE FUNCTION public.update_trip_progress(
 p_trip_id bigint,p_status text,p_latitude double precision DEFAULT NULL,p_longitude double precision DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $function$ BEGIN PERFORM private.update_trip_progress_impl(p_trip_id,p_status,p_latitude,p_longitude); END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_role(p_user_id uuid,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $function$ BEGIN PERFORM private.admin_set_profile_role_impl(p_user_id,p_role); END; $function$;

CREATE OR REPLACE FUNCTION public.admin_review_role_request(p_request_id bigint,p_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $function$ BEGIN PERFORM private.admin_review_role_request_impl(p_request_id,p_approve); END; $function$;

REVOKE ALL ON FUNCTION public.respond_to_negotiation(bigint,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_trip_progress(bigint,text,double precision,double precision) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_profile_role(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_review_role_request(bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.respond_to_negotiation(bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_progress(bigint,text,double precision,double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_role_request(bigint,boolean) TO authenticated;
