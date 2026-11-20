# Supabase migration history alignment

## Live project

The live Supabase project `ajvpinnumhazuyziphwn` already records the 14 migration versions listed in `supabase/migrations/`. The nine SQL source files previously named with the `2026112014xxxx` prefix were not the versions recorded by production and must not be pushed as pending migrations.

Those nine source files are preserved unchanged in `supabase/migrations_archive/20261120/` for audit and recovery. The active migration files are history markers matching the live migration ledger; they intentionally contain no DDL because those changes have already been applied to production.

## Important limitation

This repository still does not contain a complete, reproducible initial schema for provisioning a brand-new Supabase project. Do not use these marker files as a fresh-project bootstrap. Before creating another environment, obtain a verified schema/data backup, generate and review a complete baseline, then validate it against an isolated project.

## Future migrations

- Create each new migration using the Supabase CLI migration workflow.
- Use a timestamp later than `20261120132724`.
- Never rename an already-applied migration to a different version.
- Never reapply archived SQL files to production.
- Review the SQL and test on an isolated database before applying to production.
- After any migration, verify the remote migration ledger and actual schema.
