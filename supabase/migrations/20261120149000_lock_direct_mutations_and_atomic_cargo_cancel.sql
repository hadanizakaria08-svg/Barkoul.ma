-- Least-privilege API grants and atomic cargo cancellation.
-- This migration is intentionally committed but NOT applied to production by this workflow.
-- Review against the live schema and apply only through the approved release process.

-- Remove direct API mutation paths. Sensitive state changes must go through audited/locked RPCs.
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cargos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.negotiations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.trips FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.driver_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.profile_role_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.commission_charges FROM PUBLIC, anon, authenticated;

-- Table-level REVOKE does not remove column-level grants. Clear those explicitly.
DO $migration$
DECLARE
  v_table text;
  v_column text;
  v_sequence text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'public.profiles',
    'public.cargos',
    'public.negotiations',
    'public.trips',
    'public.driver_documents',
    'public.profile_role_requests'
  ]
  LOOP
    FOR v_column IN
      SELECT a.attname
      FROM pg_attribute a
      WHERE a.attrelid = v_table::regclass
        AND a.attnum > 0
        AND NOT a.attisdropped
    LOOP
      EXECUTE format(
        'REVOKE INSERT (%1$I) ON TABLE %2$s FROM PUBLIC, anon, authenticated',
        v_column, v_table
      );
      EXECUTE format(
        'REVOKE UPDATE (%1$I) ON TABLE %2$s FROM PUBLIC, anon, authenticated',
        v_column, v_table
      );
    END LOOP;
  END LOOP;

  -- Restore only the identity-sequence access needed by client INSERT operations.
  FOREACH v_table IN ARRAY ARRAY[
    'public.cargos',
    'public.negotiations',
    'public.driver_documents',
    'public.profile_role_requests'
  ]
  LOOP
    v_sequence := pg_get_serial_sequence(v_table, 'id');
    IF v_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', v_sequence);
    END IF;
  END LOOP;
END
$migration$;

-- Profiles: users can read according to RLS and edit only their contact fields.
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

-- Public cargo discovery remains read-only. Publishing is limited to the application fields.
GRANT SELECT ON public.cargos TO authenticated;
GRANT SELECT (
  id, title, origin_city, destination_city, goods_type, weight_text,
  truck_type, loading_date, offered_price_mad, notes, status, created_at
) ON public.cargos TO anon;
GRANT INSERT (
  title, origin_city, destination_city, goods_type, weight_text,
  truck_type, loading_date, offered_price_mad, notes, owner_id, status
) ON public.cargos TO authenticated;

-- Rebuild the cargo INSERT rule so direct API calls cannot create already-matched/completed cargo.
DROP POLICY IF EXISTS cargos_secure_insert ON public.cargos;
CREATE POLICY cargos_secure_insert ON public.cargos
FOR INSERT TO authenticated
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND status = 'open'
  AND (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role = 'owner'
    )
  )
);

-- Owners no longer update arbitrary cargo columns or delete records directly.
-- Cancellation is a locked, state-checked RPC below.
DROP POLICY IF EXISTS cargos_secure_update ON public.cargos;
DROP POLICY IF EXISTS cargos_secure_delete ON public.cargos;

CREATE OR REPLACE FUNCTION private.cancel_open_cargo_impl(p_cargo_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_owner_id uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT c.owner_id, c.status
  INTO v_owner_id, v_status
  FROM public.cargos c
  WHERE c.id = p_cargo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cargo not found';
  END IF;
  IF v_owner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the cargo owner can cancel it';
  END IF;
  IF v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Only open cargo can be cancelled';
  END IF;

  UPDATE public.cargos
  SET status = 'cancelled'
  WHERE id = p_cargo_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cargo state changed; retry after refreshing';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.cancel_open_cargo_impl(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.cancel_open_cargo_impl(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_open_cargo(p_cargo_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.cancel_open_cargo_impl(p_cargo_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_open_cargo(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_open_cargo(bigint) TO authenticated;

-- Negotiations: SELECT and constrained INSERT only; no direct state transitions.
GRANT SELECT ON public.negotiations TO authenticated;
GRANT INSERT (cargo_id, proposer_id, proposed_price_mad, message, status)
ON public.negotiations TO authenticated;

-- Trips are read-only to clients. Creation and progress are handled by private RPC implementations.
GRANT SELECT ON public.trips TO authenticated;

-- Driver documents: read own/admin and submit pending records only; reviews are RPC-only.
GRANT SELECT ON public.driver_documents TO authenticated;
GRANT INSERT (driver_id, document_type, storage_path, review_status)
ON public.driver_documents TO authenticated;

-- Role requests: a user may submit a request but cannot change its review fields or delete it.
GRANT SELECT ON public.profile_role_requests TO authenticated;
GRANT INSERT (user_id, requested_role, status)
ON public.profile_role_requests TO authenticated;

-- Administrative records and commission ledger are read-only to API clients.
GRANT SELECT ON public.admin_users, public.admin_audit_log, public.commission_charges
TO authenticated;

-- Trigger-only and RPC-only operations must not be callable as ordinary API functions.
REVOKE ALL ON FUNCTION public.prevent_profile_role_escalation() FROM PUBLIC, anon, authenticated;
