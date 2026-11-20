# Barkoul Shield X — unified test specification

**Status:** isolated engineering test harness and design specification. This is not a deployed WAF, EDR, IDS, or production enforcement service.

## Objective and fixed constraints
- Integrate the defensive design with Barkoul.ma without changing production database data or weakening RLS.
- Cost ceiling: **0 MAD** unless the owner explicitly approves spending.
- Keep the existing production site and database as rollback points.
- Use synthetic identities and records only in deception environments.
- No production secrets, customer profiles, phone numbers, driver documents, auth tokens, or database dumps in any lab.
- No covert camera access, retaliation, offensive scanning of third parties, or AI-only bans/deletions.

## Defensive architecture — seven layers
1. Identity and privilege: Supabase Auth, optional Passkeys only after hosted Auth configuration, least-privilege admin.
2. Data authorization: RLS, narrow grants, ownership checks, guarded RPCs, private Storage.
3. Application edge: input allow-lists, output encoding, CSP, dependency and secret checks.
4. WAF: Coraza + OWASP CRS at a real ingress; detection-only in staging before any enforcement.
5. Threat intelligence and host telemetry: CrowdSec with a supported bouncer; Wazuh with persistent manager/agents.
6. Behavior and response: Sentinel AI / Isolation Forest as explainable risk signals only; deterministic controls and human review for high-impact actions.
7. Deception, evidence, recovery: Phantom Room, Cyber Cage, Laser Chamber, Phantom Flash, evidence chain, backup/restore drills.

## Named systems and preserved intent
- **Wolf System:** let a hostile session interact with a convincing synthetic success path while it remains away from real data; record its path, then terminate or contain the lab session.
- **Snake System:** guide a capable probe toward a synthetic database/API surface; rotate the decoy identity after the exercise; preserve evidence outside the resettable decoy.
- **Chameleon System:** change the lab's visual camouflage and synthetic surface based on observed behavior; independently show truthful security-state colors (green normal, amber watch, orange elevated, red confirmed incident, blue investigation). Never camouflage the real customer UI.
- **Farbas System:** name reserved; implementation intentionally disabled until the owner confirms the original behavior. Do not infer or fabricate its role.
- **Phantom Room:** fake profiles, cargo, routes, tokens and API hostnames under the reserved `.invalid` domain; rotate a coherent synthetic snapshot every second.
- **Cyber Cage:** isolated sandbox boundary; no route to production Supabase, GitHub secrets, admin endpoints or customer Storage.
- **Laser Chamber:** visual lab map of suspicious paths and tripwires; it is a software visualization, not a physical laser or device-control system.
- **Phantom Flash:** visible theatrical message: «ابتسم! تم التقاط الصورة بنجاح». It must never request camera access or imply a real photo was captured.
- **Chain system:** independent modules, fault containment, clean rebuild from a known-good signed/versioned artifact, health verification before reconnection, and recovery drills. On a detected module fault, isolate only that module, preserve evidence outside it, replace it automatically with its trusted clean counterpart, verify its health/integrity, then reconnect it. The recovery path must not copy executable state or untrusted data from the damaged module. Keep critical identity/data authorization controls available while noncritical modules recover. Record detection, isolation, replacement, verification, and reconnection timestamps. The offline lab models this synchronously; production recovery time is bounded by deployment architecture and must be measured rather than promised as literally instantaneous.
- **Spectrum sensors:** Radar = correlation of request/session events; IR = behavioral-change signal; UV = hidden-pattern/metadata checks; RF = connection metadata and traffic-shape signals. These are software analogies, not physical sensors.
- **Military-inspired resilience:** radar-style early detection, tank-inspired layered defense, submarine-inspired quiet monitoring and signal correlation. No weapons, targeting, or military control.
- **Ethical hacker techniques:** authorized asset inventory, passive observation, controlled staging probes, honeypots, vulnerability validation, incident evidence and remediation. No third-party targeting.

## Chain System — rapid self-healing contract
+- Each module has an independent health check and a trusted, versioned clean replacement artifact.
+- A fault triggers containment of that module only; unrelated modules remain available.
+- Replacement is automatic only from an approved known-good artifact. Never clone the damaged module's runtime, files, secrets, or state into the replacement.
+- Verify artifact identity/integrity and run health checks before reconnecting the replacement.
+- If verification fails, keep the module isolated, retry only from another approved clean artifact, and raise an operator alert; do not reconnect a failed replacement.
+- Store a redacted evidence record outside the module for detection, isolation, replacement, verification, and recovery outcome.
+- Measure recovery time (MTTR). “In the blink of an eye” is the target, not a guarantee; production timing depends on the actual supervisor, hosting, artifact availability, and dependency graph.
+- Test that a failed Phantom Room or Chameleon module cannot take down identity, authorization, or core cargo workflows.
+
+## Lab implementation in this branch
`scripts/shield-x-lab.mjs` is a Node-only, offline simulation:
- creates synthetic Phantom Room records that change each second;
- classifies sample payloads as observations only;
- computes a tamper-evident hash-linked evidence chain;
- redacts secret-like fields;
- summarizes Radar/IR/UV/RF sample scores;
- does not connect to Supabase, network endpoints, camera, browser storage, or real enforcement.

Run:
```sh
node --test scripts/shield-x-lab.test.mjs
```

This local hash chain is **tamper-evident test evidence**, not immutable storage. Production-grade immutability requires separately controlled append-only storage and external key/retention management.

## Deployment truth table
| Capability | State in this test branch |
|---|---|
| Existing Supabase RLS / guarded RPCs | Existing production baseline; re-test role by role |
| Homepage reference design | Included from PR #17; CI must pass |
| Passkeys | Separate PR #16; hosted Supabase Passkeys setting remains a prerequisite |
| Coraza + OWASP CRS | Not deployed; needs an ingress all relevant traffic traverses |
| CrowdSec | Not deployed; needs a supported bouncer |
| Wazuh | Not deployed; needs persistent manager/agents and storage |
| Sentinel AI / Isolation Forest | Not deployed; design only, no autonomous enforcement |
| Phantom Room / Cyber Cage | Offline synthetic test harness only |
| Laser Chamber / Chameleon visual behavior | Design specification; visual UI implementation remains |
| Wolf / Snake | Behavioral design; controlled lab scenario implementation remains |
| Farbas | Disabled pending owner-confirmed specification |

## Release gates
- TypeScript, unit, browser, responsive, accessibility, dependency, secret and static security checks pass.
- Test anonymous, user, owner, driver and admin roles separately, including direct API negative tests.
- Test IDOR, role escalation, forged owner/driver IDs, unauthorized document access, audit-log tampering, repeated commission events, concurrent offer acceptance and session revocation.
- Verify backups and restore into an isolated project before claiming recovery readiness.
- Run controlled security testing only on project-owned staging resources.
- Do not enable blocking until false-positive review, rollback, and operator alerting are proven.
- A passing CI run is not a penetration test or certification.
