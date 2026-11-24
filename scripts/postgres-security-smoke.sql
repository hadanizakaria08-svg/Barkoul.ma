-- Execute only against the ephemeral PostgreSQL service in GitHub Actions.
-- This is an isolated integration fixture, not a Supabase production connection.

\i scripts/postgres-security-bootstrap.sql

\i supabase/migrations/20261120149000_lock_direct_mutations_and_atomic_cargo_cancel.sql
\i supabase/migrations/20261120149500_validate_rpc_arguments.sql
\i supabase/migrations/20261120149700_atomic_negotiation_and_document_binding.sql
\i supabase/migrations/20261121082000_restrict_driver_document_upload_role.sql
\i supabase/migrations/20261121100000_limit_public_cargo_column_visibility.sql

-- Verify anonymous column-level privacy and client mutation boundaries.
DO $test$
BEGIN
  IF has_column_privilege('anon','public.cargos','owner_id','SELECT') THEN
    RAISE EXCEPTION 'anon must not read cargos.owner_id';
  END IF;
  IF NOT has_column_privilege('anon','public.cargos','title','SELECT') THEN
    RAISE EXCEPTION 'anon must retain public cargo listing access';
  END IF;
  IF has_table_privilege('authenticated','public.negotiations','INSERT') THEN
    RAISE EXCEPTION 'authenticated must not insert negotiations directly';
  END IF;
  IF has_table_privilege('authenticated','public.cargos','UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not update cargo state directly';
  END IF;
  IF has_column_privilege('authenticated','public.profiles','role','UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not update profile roles';
  END IF;
  IF NOT has_column_privilege('authenticated','public.profiles','phone','UPDATE') THEN
    RAISE EXCEPTION 'authenticated must be able to update its contact phone';
  END IF;
END
$test$;

-- Cargo publishing is allowed for an approved owner only in the open state.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.cargos(title,origin_city,destination_city,goods_type,truck_type,owner_id,status)
VALUES ('Published through allowed columns','Agadir','Marrakech','General','Large truck','11111111-1111-4111-8111-111111111111','open');
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.cargos(title,origin_city,destination_city,goods_type,truck_type,owner_id,status)
    VALUES ('Invalid matched cargo','Agadir','Marrakech','General','Large truck','11111111-1111-4111-8111-111111111111','matched');
    RAISE EXCEPTION 'direct matched cargo publication unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='direct matched cargo publication unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

-- A verified driver can publish an offer through the RPC, but not through table INSERT.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.negotiations(cargo_id,proposer_id,proposed_price_mad,status)
    VALUES (1,'22222222-2222-4222-8222-222222222222',100,'pending');
    RAISE EXCEPTION 'direct negotiation INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$test$;
SELECT public.create_negotiation(1,125,'first verified offer') AS offer_one \gset
RESET ROLE;

-- A second verified driver may also offer on the same cargo.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.create_negotiation(1,130,'second verified offer') AS offer_two \gset
RESET ROLE;

-- Unverified and ordinary accounts cannot offer; NULL/invalid RPC arguments fail closed.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.create_negotiation(1,90,NULL);
    RAISE EXCEPTION 'ordinary user unexpectedly created an offer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='ordinary user unexpectedly created an offer' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_negotiation(1,0,NULL);
    RAISE EXCEPTION 'zero-price offer unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='zero-price offer unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.respond_to_negotiation(NULL,NULL);
    RAISE EXCEPTION 'NULL negotiation decision unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='NULL negotiation decision unexpectedly succeeded' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.update_trip_progress(NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'NULL trip progress unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='NULL trip progress unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

-- The owner accepts one offer: exactly one trip is created and the competing offer is rejected.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT public.respond_to_negotiation(:offer_one,true) AS accepted_trip \gset
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT status FROM public.cargos WHERE id=1) <> 'matched' THEN
    RAISE EXCEPTION 'accepted cargo was not marked matched';
  END IF;
  IF (SELECT status FROM public.negotiations WHERE cargo_id=1 AND proposer_id='22222222-2222-4222-8222-222222222222') <> 'accepted' THEN
    RAISE EXCEPTION 'accepted offer did not reach accepted state';
  END IF;
  IF (SELECT status FROM public.negotiations WHERE cargo_id=1 AND proposer_id='33333333-3333-4333-8333-333333333333') <> 'rejected' THEN
    RAISE EXCEPTION 'competing offer was not rejected';
  END IF;
  IF (SELECT count(*) FROM public.trips WHERE cargo_id=1 AND status<>'cancelled') <> 1 THEN
    RAISE EXCEPTION 'accepting one offer must create exactly one active trip';
  END IF;
END
$test$;

-- Only the cargo owner can cancel an open cargo through the RPC.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT public.cancel_open_cargo(2);
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT status FROM public.cargos WHERE id=2) <> 'cancelled' THEN
    RAISE EXCEPTION 'owner cancellation did not update cargo state';
  END IF;
END
$test$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.cancel_open_cargo(3);
    RAISE EXCEPTION 'non-owner unexpectedly cancelled cargo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='non-owner unexpectedly cancelled cargo' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

-- Driver document metadata is bound to the driver's own object; restrictive policies
-- override a deliberately broad legacy policy created by the bootstrap fixture.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $test$
DECLARE own_count integer; foreign_count integer;
BEGIN
  SELECT count(*) INTO own_count FROM storage.objects
  WHERE bucket_id='driver-documents'
    AND name LIKE '22222222-2222-4222-8222-222222222222/%';
  SELECT count(*) INTO foreign_count FROM storage.objects
  WHERE bucket_id='driver-documents'
    AND name LIKE '33333333-3333-4333-8333-333333333333/%';
  IF own_count < 2 OR foreign_count <> 0 THEN
    RAISE EXCEPTION 'driver storage SELECT isolation failed (own %, foreign %)',own_count,foreign_count;
  END IF;
END
$test$;
INSERT INTO storage.objects(bucket_id,name,owner_id)
VALUES ('driver-documents','22222222-2222-4222-8222-222222222222/new.pdf','22222222-2222-4222-8222-222222222222');
INSERT INTO public.driver_documents(driver_id,document_type,storage_path,review_status)
VALUES ('22222222-2222-4222-8222-222222222222','New licence','22222222-2222-4222-8222-222222222222/new.pdf','pending');
DO $test$
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner_id)
    VALUES ('driver-documents','33333333-3333-4333-8333-333333333333/forged.pdf','22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'cross-user document upload unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='cross-user document upload unexpectedly succeeded' THEN RAISE; END IF;
  END;
  DELETE FROM storage.objects
  WHERE bucket_id='driver-documents'
    AND name='22222222-2222-4222-8222-222222222222/verified.pdf';
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id='driver-documents'
      AND name='22222222-2222-4222-8222-222222222222/verified.pdf'
  ) THEN
    RAISE EXCEPTION 'RLS allowed deletion of a referenced driver document';
  END IF;
END
$test$;
RESET ROLE;

-- An ordinary user cannot upload even into their own folder; administrators can read all.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner_id)
    VALUES ('driver-documents','44444444-4444-4444-8444-444444444444/not-a-driver.pdf','44444444-4444-4444-8444-444444444444');
    RAISE EXCEPTION 'non-driver upload unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='non-driver upload unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
DO $test$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM storage.objects WHERE bucket_id='driver-documents';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'anonymous role can read private driver documents';
  END IF;
END
$test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
DO $test$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM storage.objects WHERE bucket_id='driver-documents';
  IF visible_count < 3 THEN
    RAISE EXCEPTION 'administrator cannot read all private driver documents';
  END IF;
END
$test$;
RESET ROLE;

-- A document can be reviewed once from pending; repeated decisions are rejected and audited.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
SELECT public.admin_review_driver_document(3,'verified');
DO $test$
BEGIN
  IF (SELECT review_status FROM public.driver_documents WHERE id=3) <> 'verified' THEN
    RAISE EXCEPTION 'administrator document review did not persist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_audit_log
    WHERE action='driver_document_verified' AND target_id='3'
  ) THEN
    RAISE EXCEPTION 'document review was not written to the audit log';
  END IF;
  BEGIN
    PERFORM public.admin_review_driver_document(3,'rejected');
    RAISE EXCEPTION 'a reviewed document was reviewed a second time';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='a reviewed document was reviewed a second time' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

-- Complete a real trip lifecycle and verify the commission ledger is created exactly once.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT public.update_trip_progress(:accepted_trip,'loading',NULL,NULL);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT public.update_trip_progress(:accepted_trip,'in_transit',NULL,NULL);
SELECT public.update_trip_progress(:accepted_trip,'delivered',NULL,NULL);
RESET ROLE;

DO $test$
BEGIN
  IF (SELECT status FROM public.trips WHERE id=(SELECT id FROM public.trips WHERE cargo_id=1)) <> 'delivered' THEN
    RAISE EXCEPTION 'trip did not reach delivered state';
  END IF;
  IF (SELECT count(*) FROM public.commission_charges WHERE trip_id=(SELECT id FROM public.trips WHERE cargo_id=1)) <> 2 THEN
    RAISE EXCEPTION 'delivery must create exactly two commission charges';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commission_charges
    WHERE trip_id=(SELECT id FROM public.trips WHERE cargo_id=1) AND payer_id='11111111-1111-4111-8111-111111111111'
      AND payer_role='owner' AND amount_mad=10 AND status='due'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.commission_charges
    WHERE trip_id=(SELECT id FROM public.trips WHERE cargo_id=1) AND payer_id='22222222-2222-4222-8222-222222222222'
      AND payer_role='driver' AND amount_mad=20 AND status='due'
  ) THEN
    RAISE EXCEPTION 'commission amounts or payers do not match the business rules';
  END IF;
END
$test$;

-- Each party can read only its own charge; an unrelated account sees neither.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.commission_charges) <> 1
     OR EXISTS (SELECT 1 FROM public.commission_charges WHERE payer_role='driver') THEN
    RAISE EXCEPTION 'cargo owner commission visibility is not isolated';
  END IF;
END
$test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.commission_charges) <> 1
     OR EXISTS (SELECT 1 FROM public.commission_charges WHERE payer_role='owner') THEN
    RAISE EXCEPTION 'driver commission visibility is not isolated';
  END IF;
END
$test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.commission_charges) <> 0 THEN
    RAISE EXCEPTION 'unrelated account can read commission charges';
  END IF;
  BEGIN
    PERFORM public.admin_record_commission_payment(
      (SELECT id FROM public.commission_charges WHERE payer_role='owner' LIMIT 1),
      'cash',NULL
    );
    RAISE EXCEPTION 'ordinary user unexpectedly recorded commission payment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='ordinary user unexpectedly recorded commission payment' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

-- An administrator can record a verified cash/electronic payment once, with an audit event.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
DO $test$
DECLARE owner_charge bigint; driver_charge bigint;
BEGIN
  SELECT id INTO owner_charge FROM public.commission_charges
  WHERE trip_id=(SELECT id FROM public.trips WHERE cargo_id=1) AND payer_role='owner';
  SELECT id INTO driver_charge FROM public.commission_charges
  WHERE trip_id=(SELECT id FROM public.trips WHERE cargo_id=1) AND payer_role='driver';

  BEGIN
    PERFORM public.admin_record_commission_payment(driver_charge,'electronic',NULL);
    RAISE EXCEPTION 'electronic payment without a reference unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='electronic payment without a reference unexpectedly succeeded' THEN RAISE; END IF;
  END;

  PERFORM public.admin_record_commission_payment(owner_charge,'cash',NULL);
  PERFORM public.admin_record_commission_payment(driver_charge,'electronic','BANK-TEST-123');

  IF NOT EXISTS (
    SELECT 1 FROM public.commission_charges
    WHERE id=owner_charge AND status='paid' AND payment_method='cash'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.commission_charges
    WHERE id=driver_charge AND status='paid'
      AND payment_method='electronic' AND payment_reference='BANK-TEST-123'
  ) THEN
    RAISE EXCEPTION 'commission payment details were not persisted';
  END IF;
  IF (SELECT count(*) FROM public.admin_audit_log
      WHERE action='commission_payment_recorded'
        AND target_table='commission_charges') < 2 THEN
    RAISE EXCEPTION 'commission payment audit entries are missing';
  END IF;

  BEGIN
    PERFORM public.admin_record_commission_payment(owner_charge,'cash',NULL);
    RAISE EXCEPTION 'a commission charge was paid twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='a commission charge was paid twice' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

-- Role activation is a single audited admin action; users cannot self-approve or resubmit.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
INSERT INTO public.profile_role_requests(user_id,requested_role,status)
VALUES ('44444444-4444-4444-8444-444444444444','driver','pending')
RETURNING id AS role_request_id \gset
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.profile_role_requests(user_id,requested_role,status)
    VALUES ('44444444-4444-4444-8444-444444444444','owner','pending');
    RAISE EXCEPTION 'duplicate pending role request unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
SELECT public.admin_review_role_request(:role_request_id,true);
RESET ROLE;

DO $test$
BEGIN
  IF (SELECT role FROM public.profiles
      WHERE id='44444444-4444-4444-8444-444444444444') <> 'driver' THEN
    RAISE EXCEPTION 'approved role request did not activate the requested role';
  END IF;
  IF (SELECT status FROM public.profile_role_requests WHERE id=(SELECT max(id) FROM public.profile_role_requests WHERE user_id='44444444-4444-4444-8444-444444444444')) <> 'approved' THEN
    RAISE EXCEPTION 'role request was not marked approved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_audit_log
    WHERE action='role_request_approved' AND target_id=(SELECT max(id)::text FROM public.profile_role_requests WHERE user_id='44444444-4444-4444-8444-444444444444')
  ) THEN
    RAISE EXCEPTION 'role request approval was not audited';
  END IF;
END
$test$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.profile_role_requests(user_id,requested_role,status)
    VALUES ('44444444-4444-4444-8444-444444444444','owner','pending');
    RAISE EXCEPTION 'activated driver unexpectedly requested a second role';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='activated driver unexpectedly requested a second role' THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;

\echo 'PostgreSQL security integration smoke tests passed.'
