-- Keep driver offer states consistent when an owner/admin cancels an open cargo.
CREATE OR REPLACE FUNCTION private.close_pending_negotiations_on_cargo_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
 IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
   UPDATE public.negotiations SET status='rejected'
   WHERE cargo_id=NEW.id AND status='pending';
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.close_pending_negotiations_on_cargo_cancel() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS close_pending_negotiations_on_cargo_cancel ON public.cargos;
CREATE TRIGGER close_pending_negotiations_on_cargo_cancel
AFTER UPDATE OF status ON public.cargos
FOR EACH ROW EXECUTE FUNCTION private.close_pending_negotiations_on_cargo_cancel();
