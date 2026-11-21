-- Public cargo discovery does not need the owner's Auth UUID.
-- Keep anonymous browsing read-only and expose only fields rendered by the public list.
REVOKE SELECT ON TABLE public.cargos FROM PUBLIC, anon;
REVOKE SELECT (owner_id) ON TABLE public.cargos FROM PUBLIC, anon;

GRANT SELECT (
  id,
  title,
  origin_city,
  destination_city,
  goods_type,
  weight_text,
  truck_type,
  loading_date,
  offered_price_mad,
  notes,
  status,
  created_at
) ON TABLE public.cargos TO anon;
