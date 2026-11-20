-- Make negotiation submission and acceptance atomic with cargo state changes.
-- Also bind driver-document metadata to an object owned by the same authenticated driver.

-- No client may insert negotiation rows directly. The RPC derives proposer_id from auth.uid().
REVOKE INSERT ON public.negotiations FROM PUBLIC, anon, authenticated;
DO $migration$
DECLARE
  v_column text;
  v_sequence text;
BEGIN
  FOR v_column IN
    SELECT a.attname
    FROM pg_attribute a
    WHERE a.attrelid = 'public.negotiations'::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'REVOKE INSERT (%I) ON TABLE public.negotiations FROM PUBLIC, anon, authenticated',
      v_column
    );
  END LOOP;

  v_sequence := pg_get_serial_sequence('public.negotiations','id');
  IF v_sequence IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated',v_sequence);
  END IF;
END
$migration$;

DROP POLICY IF EXISTS negotiations_insert_self ON public.negotiations;

CREATE OR REPLACE FUNCTION private.create_negotiation_impl(
  p_cargo_id bigint,
  p_proposed_price_mad numeric,
  p_message text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_owner_id uuid;
  v_cargo_status text;
  v_negotiation_id bigint;
  v_message text := NULLIF(btrim(p_message),'');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_cargo_id IS NULL OR p_proposed_price_mad IS NULL OR p_proposed_price_mad <= 0 THEN
    RAISE EXCEPTION 'Cargo ID and a positive offer are required';
  END IF;
  IF v_message IS NOT NULL AND char_length(v_message) > 500 THEN
    RAISE EXCEPTION 'Offer message is too long';
  END IF;

  -- Lock the cargo first. Cancellation and acceptance use the same lock order.
  SELECT c.owner_id,c.status
  INTO v_owner_id,v_cargo_status
  FROM public.cargos c
  WHERE c.id=p_cargo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cargo not found';
  END IF;
  IF v_cargo_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Cargo is no longer open';
  END IF;
  IF v_owner_id IS NULL OR v_owner_id = v_uid THEN
    RAISE EXCEPTION 'You cannot offer on your own cargo';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=v_uid AND p.role='driver'
  ) THEN
    RAISE EXCEPTION 'Verified driver role required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.driver_documents d
    WHERE d.driver_id=v_uid AND d.review_status='verified'
  ) THEN
    RAISE EXCEPTION 'A verified driver document is required';
  END IF;

  INSERT INTO public.negotiations(
    cargo_id,proposer_id,proposed_price_mad,message,status
  )
  VALUES(p_cargo_id,v_uid,p_proposed_price_mad,v_message,'pending')
  RETURNING id INTO v_negotiation_id;

  RETURN v_negotiation_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.create_negotiation_impl(bigint,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_negotiation_impl(bigint,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_negotiation(
  p_cargo_id bigint,
  p_proposed_price_mad numeric,
  p_message text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_cargo_id IS NULL OR p_proposed_price_mad IS NULL OR p_proposed_price_mad <= 0 THEN
    RAISE EXCEPTION 'Cargo ID and a positive offer are required';
  END IF;
  IF p_message IS NOT NULL AND char_length(btrim(p_message)) > 500 THEN
    RAISE EXCEPTION 'Offer message is too long';
  END IF;
  RETURN private.create_negotiation_impl(p_cargo_id,p_proposed_price_mad,p_message);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_negotiation(bigint,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_negotiation(bigint,numeric,text) TO authenticated;

-- Acceptance locks cargo before negotiation, matching cancellation and offer creation.
CREATE OR REPLACE FUNCTION private.respond_to_negotiation_impl(
  p_negotiation_id bigint,
  p_accept boolean
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_cargo record;
  v_offer record;
  v_trip_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_negotiation_id IS NULL OR p_accept IS NULL THEN
    RAISE EXCEPTION 'Negotiation ID and decision are required';
  END IF;

  SELECT c.id,c.owner_id,c.status
  INTO v_cargo
  FROM public.cargos c
  JOIN public.negotiations n ON n.cargo_id=c.id
  WHERE n.id=p_negotiation_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negotiation not found';
  END IF;

  SELECT n.id,n.cargo_id,n.proposer_id,n.proposed_price_mad,n.status
  INTO v_offer
  FROM public.negotiations n
  WHERE n.id=p_negotiation_id
  FOR UPDATE;

  IF NOT FOUND OR v_offer.cargo_id IS DISTINCT FROM v_cargo.id THEN
    RAISE EXCEPTION 'Negotiation not found';
  END IF;
  IF v_cargo.owner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the cargo owner can decide this offer';
  END IF;
  IF v_cargo.status IS DISTINCT FROM 'open' OR v_offer.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This offer is no longer available';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.negotiations
    SET status='rejected'
    WHERE id=p_negotiation_id AND status='pending';
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=v_offer.proposer_id AND p.role='driver'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.driver_documents d
    WHERE d.driver_id=v_offer.proposer_id AND d.review_status='verified'
  ) THEN
    RAISE EXCEPTION 'The driver is no longer verified';
  END IF;

  UPDATE public.negotiations
  SET status='accepted'
  WHERE id=p_negotiation_id AND status='pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer state changed; refresh and retry';
  END IF;

  UPDATE public.negotiations
  SET status='rejected'
  WHERE cargo_id=v_cargo.id AND id<>p_negotiation_id AND status='pending';

  UPDATE public.cargos
  SET status='matched'
  WHERE id=v_cargo.id AND status='open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cargo state changed; refresh and retry';
  END IF;

  INSERT INTO public.trips(cargo_id,owner_id,driver_id,agreed_price_mad,status)
  VALUES(v_cargo.id,v_cargo.owner_id,v_offer.proposer_id,v_offer.proposed_price_mad,'agreed')
  RETURNING id INTO v_trip_id;

  RETURN v_trip_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.respond_to_negotiation_impl(bigint,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.respond_to_negotiation_impl(bigint,boolean) TO authenticated;

-- The metadata row must point to an object in the same driver's private folder.
DROP POLICY IF EXISTS documents_insert_owner ON public.driver_documents;
CREATE POLICY documents_insert_owner ON public.driver_documents
FOR INSERT TO authenticated
WITH CHECK (
  driver_id=(SELECT auth.uid())
  AND review_status='pending'
  AND char_length(btrim(document_type)) BETWEEN 1 AND 60
  AND storage_path LIKE ((SELECT auth.uid())::text || '/%')
  AND EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id='driver-documents'
      AND o.name=driver_documents.storage_path
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id=(SELECT auth.uid()) AND p.role='driver'
  )
);

-- A verified document cannot be deleted by its owner while it authorizes driver offers.
DROP POLICY IF EXISTS driver_documents_private_delete_own ON storage.objects;
CREATE POLICY driver_documents_private_delete_own ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id='driver-documents'
  AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
  AND NOT EXISTS (
    SELECT 1
    FROM public.driver_documents d
    WHERE d.storage_path=storage.objects.name
      AND d.review_status='verified'
  )
);

REVOKE ALL ON FUNCTION public.create_negotiation(bigint,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_negotiation(bigint,numeric,text) TO authenticated;
