-- A cancelled trip reopens its cargo for a new driver offer.
-- Keep one active trip per cargo while preserving cancelled trip history.
DO $check$
BEGIN
  IF EXISTS (
    SELECT cargo_id
    FROM public.trips
    WHERE status <> 'cancelled'
    GROUP BY cargo_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create active-trip uniqueness index: duplicate active trips exist';
  END IF;
END
$check$;

ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_cargo_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS trips_one_active_per_cargo_idx
  ON public.trips(cargo_id)
  WHERE status <> 'cancelled';
