-- Anonymous users may browse only the fields rendered by the guest cargo list.
-- Keep the table-wide SELECT privilege revoked and never expose owner_id to anon.
GRANT SELECT (id, title, origin_city, destination_city, goods_type, weight_text, truck_type, loading_date, offered_price_mad, notes, status, created_at)
ON TABLE public.cargos TO anon;
