-- Reconciles the migration ledger with the exact statement applied to production on 2026-11-25.
-- This file records the already-applied grant; do not re-run it against the live project as a new migration.
GRANT UPDATE (full_name, phone) ON TABLE public.profiles TO authenticated;
