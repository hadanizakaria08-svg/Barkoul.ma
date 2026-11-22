# Supabase migration history alignment

## Live project

The live Supabase project `ajvpinnumhazuyziphwn` reports these 21 applied migration versions (verified 2026-11-22):

```text
20261120130125
20261120130133
20261120130147
20261120130201
20261120130457
20261120130519
20261120130727
20261120130953
20261120131150
20261120131313
20261120131935
20261120132125
20261120132519
20261120132724
20261120135414
20261120140715
20261120141216
20261120141413
20261120141749
20261120142045
20261122111549
```

The active `supabase/migrations/` directory is aligned to those exact version identifiers. Three SQL source files had version prefixes that did not match the live ledger; they have been renamed to their verified production versions without changing their SQL contents. The already-applied `20261120142045` migration is represented by a history marker because its production change is already present and its source is not in this repository snapshot.

No migration was applied to Supabase as part of this repository correction. Do not run a database push just to test this change.

## Important limitation

This repository does not contain a complete, reproducible initial schema for provisioning a brand-new Supabase project. The history directory represents changes already applied to the existing production project; it is not a clean bootstrap. Before creating another environment, obtain a verified schema/data backup, generate and review a complete baseline, then validate it against an isolated project.

## Future migrations

- Create each new migration using the current Supabase CLI workflow.
- Use a timestamp later than `20261120142045`.
- Never rename an already-applied migration to a different version.
- Never replay archived SQL files against production.
- Review SQL and test on an isolated database before applying to production.
- After any migration, verify both the remote migration ledger and actual schema.
