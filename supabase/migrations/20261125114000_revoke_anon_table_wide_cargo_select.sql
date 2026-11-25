-- Keep public browsing limited to the cargo fields used by the guest interface.
-- Remove the table-wide SELECT grant and the unnecessary owner UUID exposure.
REVOKE SELECT ON TABLE public.cargos FROM anon;
REVOKE SELECT (owner_id) ON TABLE public.cargos FROM anon;
