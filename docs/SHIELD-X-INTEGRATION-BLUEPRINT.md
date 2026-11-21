# Barkoul Shield X — zero-cost integration blueprint

Status: engineering blueprint only. This document does not claim that Shield X is deployed or that production traffic is currently protected by Coraza, Wazuh, or CrowdSec.

## Objective

Integrate the defensive capabilities of Barkoul Shield X with Barkoul.ma without weakening the existing Supabase authorization model, exposing customer data, deleting records, or introducing paid dependencies. Preserve the current site and database as the rollback point. Build and test each layer before enabling it in production.

## Existing deployment boundary

Barkoul.ma currently serves its static frontend from GitHub Pages and accesses Supabase directly from the browser. This matters:

- A static GitHub Pages site cannot run a persistent reverse proxy or WAF process.
- Coraza + OWASP CRS cannot inspect requests to the Supabase API merely by being added to the frontend bundle. It must sit on an actual HTTP ingress/API gateway that all protected traffic traverses.
- Wazuh needs persistent manager/agent infrastructure and storage. It is free/open-source software, but not infrastructure-free.
- CrowdSec can make useful decisions only where a supported bouncer/firewall/reverse proxy can enforce them. Browser-side IP blocking is not a security boundary.
- Therefore these products are integration targets, not active protections on the current Pages-to-Supabase path. Do not advertise them as active until traffic is routed through and verified at the enforcement point.

## Seven defensive layers

1. **Identity and privilege** — Supabase Auth, optional passkeys when enabled in the hosted Auth settings, short-lived/revocable sensitive sessions where supported, admin least privilege, no role changes from client-controlled metadata.
2. **Data authorization** — RLS on every exposed table, narrow grants, ownership checks using authenticated identity, guarded RPC for sensitive state transitions, private Storage bucket and ownership-scoped object paths. Never expose service-role/secret keys in browser or repository.
3. **Application edge** — strict input allow-lists, contextual output encoding, CSP and secure response headers, dependency pinning/audit, rate limits at a trusted server-side ingress. Frontend checks are usability only, not authorization.
4. **HTTP WAF** — Coraza with OWASP CRS at a reverse proxy/API gateway in front of the application/API. Initially detection-only in staging; tune false positives; then enforce selected rules after regression tests. Do not claim coverage of Supabase endpoints until the API traffic is actually routed through it.
5. **Threat intelligence and host telemetry** — CrowdSec decisions/bouncer at the enforcement layer; Wazuh agents/manager for host, proxy, and service logs. Keep this optional until a lawful, persistent, zero-cost host is available and operationally monitored.
6. **Behavior analysis and response** — Sentinel AI/Isolation Forest produces explainable risk signals only. It cannot independently delete records, ban a user, or change roles. High-impact actions require deterministic rules, thresholds, evidence, and human review.
7. **Deception, evidence, and recovery** — Phantom Room / Cyber Cage isolated from production data and credentials; synthetic identities, fake cargo, tokens, and UI only; rotating decoys; visible Phantom Flash; append-only/tamper-evident incident chain; backup/restore and rollback drills.

## Phantom Room / Cyber Cage safety boundary

- Use synthetic records only. Never copy real cargo, customer profiles, phone numbers, driver documents, auth tokens, API keys, or production database dumps into the cage.
- No network route from the cage to production Supabase, GitHub secrets, admin endpoints, or customer storage.
- Do not execute attacker-supplied files or code in the browser. Treat every payload as inert text.
- The approved visible decoy line is: **«ابتسم! تم التقاط الصورة بنجاح»**. It is theatrical text only. It must not access the camera, claim an actual photo was taken, or collect biometric data.
- Phantom Flash may display a conspicuous visual response inside the isolated lab; it must not impair ordinary customers or lock real accounts.
- Store only minimal incident evidence. Never log passwords, access/refresh tokens, private documents, or unnecessary personal data.
- Any block/isolation action against a real account or IP requires a trusted enforcement point, bounded duration, audit trail, and safe recovery path. No retaliation or activity against third-party systems.

## Zero-MAD implementation path

### Phase A — safe integration baseline (can be developed in this repository)
- Keep current RLS, grants, private Storage, and guarded RPC as the authoritative controls.
- Add security architecture/configuration and test fixtures without touching production data.
- Build a self-contained Phantom Room simulation with synthetic data, clearly labelled as a lab.
- Add tests for role boundaries, untrusted input rendering, secret scanning, event redaction, decoy isolation, and evidence-chain tamper detection.
- Verify the approved homepage and security lab together in CI before deployment.

### Phase B — real ingress protection (infrastructure prerequisite)
- Select a persistent host that the project controls and can keep online at no charge; if none exists, this phase remains un-deployed rather than pretending Pages is a WAF.
- Put Coraza + OWASP CRS in front of traffic that can be routed through it. Route only after TLS, DNS, health checks, rollback, and Supabase API compatibility are verified.
- Deploy CrowdSec only with a supported bouncer on that ingress/host.
- Deploy Wazuh only when manager/agent storage, updates, alert delivery, and operator response are sustainable.
- Keep detection-only mode first; compare alerts against normal Barkoul workflows before enabling blocking.

### Phase C — release gate
- Automated unit, type, browser, responsive, accessibility, dependency, secret, and static security checks pass.
- Test anonymous, user, owner, driver, and admin access with separate accounts; include direct API negative tests for IDOR, role escalation, forged owner/driver IDs, unauthorized document access, and audit-log tampering.
- Test concurrent offer acceptance, repeated commission events, session revocation, rate-limit behavior, false positives, and incident recovery.
- Test backups and restore to an isolated project before any production recovery claim.
- Run a controlled security test only against project-owned staging resources.
- Review evidence and sign off before enabling production enforcement.

## Release truth table

| Capability | Current state | Release wording |
|---|---|---|
| Supabase RLS/grants and guarded database actions | Existing baseline; must be re-tested role by role | Database controls present; not a penetration-test certification |
| CSP/source security checks | Existing automated checks | Automated checks only |
| Coraza + OWASP CRS | Not deployed on current Pages/Supabase path | Planned until verified at ingress |
| Wazuh | Not deployed | Planned until persistent manager/agents exist |
| CrowdSec | Not deployed | Planned until supported bouncer is active |
| Sentinel AI / Isolation Forest | Design target, not an enforcement authority | Risk signal only until tested |
| Phantom Room / Cyber Cage | Design target; must be isolated and synthetic | Lab only until isolation tests pass |
| Immutable/tamper-evident evidence chain | Design target | Do not call immutable until tamper tests and storage controls pass |

## Non-negotiable constraints

- Spend: 0 MAD unless the user explicitly approves otherwise.
- No production SQL/migrations or storage policy changes as part of this blueprint.
- No deletion of existing data or current stable frontend.
- No secrets in frontend code, Git history, logs, or Phantom Room.
- No AI-only bans, no covert camera access, no retaliation, no claims of total immunity.
- A green CI result is not a penetration test and does not certify compliance.
