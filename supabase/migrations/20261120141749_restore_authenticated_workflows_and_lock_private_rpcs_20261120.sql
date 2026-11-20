-- Restore the exact authenticated Data API write paths required by the legacy UI.
-- RLS remains the row-level gate; role/status checks stay in the policies.
GRANT INSERT ON TABLE
  public.cargos,
  public.driver_documents,
  public.negotiations,
  public.profile_role_requests
TO authenticated;

GRANT UPDATE (full_name, phone) ON TABLE public.profiles TO authenticated;
REVOKE INSERT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- Cargo lifecycle changes are performed only through validated RPCs.
REVOKE UPDATE ON TABLE public.cargos FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS cargos_secure_update ON public.cargos;

-- Only one unresolved role request may exist for a user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS profile_role_requests_one_pending_per_user
  ON public.profile_role_requests(user_id)
  WHERE status = 'pending';

-- Keep implementation helpers in the non-exposed private schema.
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_delete_driver_document_object(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.cancel_open_cargo_impl(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION private.respond_to_negotiation_impl(bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_trip_progress_impl(bigint, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_trip_contact_impl(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_review_driver_document_impl(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_review_role_request_impl(bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_record_commission_payment_impl(bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.admin_set_profile_role_impl(uuid, text) TO authenticated;

-- Public wrappers are SECURITY INVOKER and only authenticated users can call them.
REVOKE EXECUTE ON FUNCTION public.cancel_open_cargo(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_to_negotiation(bigint, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_trip_progress(bigint, text, double precision, double precision) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_trip_contact(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_driver_document(bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_role_request(bigint, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_record_commission_payment(bigint, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cancel_open_cargo(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_negotiation(bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trip_progress(bigint, text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_contact(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_driver_document(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_role_request(bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_commission_payment(bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, text) TO authenticated;
