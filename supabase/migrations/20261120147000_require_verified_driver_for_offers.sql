-- A driver must have at least one verified identity/licence document before making offers.
DROP POLICY IF EXISTS negotiations_insert_self ON public.negotiations;
CREATE POLICY negotiations_insert_self ON public.negotiations
FOR INSERT TO authenticated
WITH CHECK (
 proposer_id=(SELECT auth.uid()) AND status='pending'
 AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='driver')
 AND EXISTS (SELECT 1 FROM public.driver_documents d WHERE d.driver_id=(SELECT auth.uid()) AND d.review_status='verified')
 AND EXISTS (SELECT 1 FROM public.cargos c
   WHERE c.id=negotiations.cargo_id AND c.status='open' AND c.owner_id<>(SELECT auth.uid()))
);