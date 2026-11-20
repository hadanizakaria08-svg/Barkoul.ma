-- Secure workflows for negotiation acceptance, trip progress, and role activation.
-- Direct authenticated UPDATE/INSERT grants on negotiations/trips remain closed.

DROP POLICY IF EXISTS cargos_secure_insert ON public.cargos;
CREATE POLICY cargos_secure_insert ON public.cargos
FOR INSERT TO authenticated
WITH CHECK (
  (owner_id=(SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='owner'
  ))
  OR (SELECT private.is_admin())
);

DROP POLICY IF EXISTS documents_insert_owner ON public.driver_documents;
CREATE POLICY documents_insert_owner ON public.driver_documents
FOR INSERT TO authenticated
WITH CHECK (
  driver_id=(SELECT auth.uid()) AND review_status='pending'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='driver')
);

DROP POLICY IF EXISTS negotiations_insert_self ON public.negotiations;
CREATE POLICY negotiations_insert_self ON public.negotiations
FOR INSERT TO authenticated
WITH CHECK (
  proposer_id=(SELECT auth.uid()) AND status='pending'
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='driver')
  AND EXISTS (SELECT 1 FROM public.cargos c
    WHERE c.id=negotiations.cargo_id AND c.status='open' AND c.owner_id<>(SELECT auth.uid()))
);

CREATE OR REPLACE FUNCTION public.respond_to_negotiation(p_negotiation_id bigint,p_accept boolean)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_offer record; v_trip_id bigint;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT n.id,n.cargo_id,n.proposer_id,n.proposed_price_mad,n.status,
         c.owner_id AS cargo_owner_id,c.status AS cargo_status
  INTO v_offer
  FROM public.negotiations n JOIN public.cargos c ON c.id=n.cargo_id
  WHERE n.id=p_negotiation_id FOR UPDATE OF n,c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negotiation not found'; END IF;
  IF v_offer.cargo_owner_id<>(SELECT auth.uid()) THEN RAISE EXCEPTION 'Only the cargo owner can decide this offer'; END IF;
  IF v_offer.status<>'pending' OR v_offer.cargo_status<>'open' THEN RAISE EXCEPTION 'This offer is no longer available'; END IF;
  IF NOT p_accept THEN
    UPDATE public.negotiations SET status='rejected' WHERE id=p_negotiation_id;
    RETURN NULL;
  END IF;
  UPDATE public.negotiations SET status='accepted' WHERE id=p_negotiation_id;
  UPDATE public.negotiations SET status='rejected'
    WHERE cargo_id=v_offer.cargo_id AND id<>p_negotiation_id AND status='pending';
  UPDATE public.cargos SET status='matched' WHERE id=v_offer.cargo_id;
  INSERT INTO public.trips(cargo_id,owner_id,driver_id,agreed_price_mad,status)
  VALUES(v_offer.cargo_id,v_offer.cargo_owner_id,v_offer.proposer_id,v_offer.proposed_price_mad,'agreed')
  RETURNING id INTO v_trip_id;
  RETURN v_trip_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.respond_to_negotiation(bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.respond_to_negotiation(bigint,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_trip_progress(
  p_trip_id bigint,p_status text,p_latitude double precision DEFAULT NULL,p_longitude double precision DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_trip public.trips%ROWTYPE; v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id=p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trip not found'; END IF;
  IF v_uid<>v_trip.owner_id AND v_uid<>v_trip.driver_id THEN RAISE EXCEPTION 'Not a participant in this trip'; END IF;
  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN RAISE EXCEPTION 'Both GPS coordinates must be supplied together'; END IF;
  IF p_latitude IS NOT NULL THEN
    IF v_uid<>v_trip.driver_id THEN RAISE EXCEPTION 'Only the assigned driver can update GPS'; END IF;
    IF p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Invalid GPS coordinates'; END IF;
  END IF;
  IF p_status='cancelled' AND v_trip.status IN ('agreed','loading') THEN
    UPDATE public.trips SET status='cancelled',
      last_latitude=COALESCE(p_latitude,last_latitude),last_longitude=COALESCE(p_longitude,last_longitude),
      location_updated_at=CASE WHEN p_latitude IS NOT NULL THEN now() ELSE location_updated_at END
    WHERE id=p_trip_id;
    UPDATE public.cargos SET status='open' WHERE id=v_trip.cargo_id AND status='matched';
    RETURN;
  END IF;
  IF NOT (
    (v_trip.status='agreed' AND p_status='loading')
    OR (v_trip.status='loading' AND p_status='in_transit' AND v_uid=v_trip.driver_id)
    OR (v_trip.status='in_transit' AND p_status='delivered' AND v_uid=v_trip.driver_id)
  ) THEN RAISE EXCEPTION 'Invalid trip status transition'; END IF;
  UPDATE public.trips SET status=p_status,
    last_latitude=COALESCE(p_latitude,last_latitude),last_longitude=COALESCE(p_longitude,last_longitude),
    location_updated_at=CASE WHEN p_latitude IS NOT NULL THEN now() ELSE location_updated_at END
  WHERE id=p_trip_id;
  IF p_status='delivered' THEN
    UPDATE public.cargos SET status='completed' WHERE id=v_trip.cargo_id AND status='matched';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_trip_progress(bigint,text,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_trip_progress(bigint,text,double precision,double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_profile_role(p_user_id uuid,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_old_role text;
BEGIN
  IF NOT (SELECT private.is_admin()) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_role NOT IN ('user','driver','owner') THEN RAISE EXCEPTION 'Unsupported target role'; END IF;
  SELECT role INTO v_old_role FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_old_role=p_role THEN RETURN; END IF;
  UPDATE public.profiles SET role=p_role WHERE id=p_user_id;
  INSERT INTO public.admin_audit_log(admin_id,action,target_table,target_id)
  VALUES((SELECT auth.uid()),'profile_role_changed','profiles',p_user_id::text);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_set_profile_role(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(uuid,text) TO authenticated;
