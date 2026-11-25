# Barkoul Shield X — pre-merge defensive lab

**Status:** isolated offline engineering module. It is not a deployed WAF, IDS, EDR, reverse proxy, or production protection service.

## Scope in this change
- Inspect only caller-supplied synthetic request fixtures.
- Detect a small set of SQL injection, XSS, path traversal, and command-injection indicators.
- Return metadata and a route fingerprint; never return or retain the raw request body.
- Redact sensitive evidence keys and maintain a SHA-256 hash-linked in-memory ledger.
- Keep every decision at `observe-only`; there is no blocking, banning, scanning, network call, Supabase access, or camera access.

## Run locally
```sh
node --test shield-x/inspection-engine.test.mjs
```

## Security limitations
- These are small project-owned regression rules, **not OWASP CRS signatures** and not a substitute for Coraza.
- The hash-linked ledger detects accidental or partial changes when independently checked; it is not immutable against an attacker able to rewrite the entire ledger and recompute hashes. Production evidence needs external append-only storage and separately managed signing keys.
- No production ingress exists in this repository's GitHub Pages hosting path. GitHub Pages is static and cannot run a persistent reverse proxy. Do not claim this module protects live Barkoul.ma traffic.
- No customer data, production credentials, or real requests belong in these tests.
- No automatic enforcement is permitted. Any later staging enforcement requires a real ingress, false-positive review, operator alerts, and tested rollback.

## Merge gate
The root `npm test` suite includes this lab. CI must pass on the isolated branch. This PR is code and test preparation only; production deployment is a separate, reviewed project.