# Barkoul.ma — Quality and security test baseline

This is an engineering test baseline, not a certification or penetration-test report.

## Standards mapped into the test plan

- **OWASP ASVS 5.0, Level 1 target:** authentication/session handling, access control, input validation, error handling, secure configuration, and dependency hygiene. Database authorization must be tested against the live Supabase policies before release.
- **OWASP Top 10 (2025) awareness:** access control, security misconfiguration, software supply-chain failures, injection, authentication failures, and logging/monitoring are tracked as release risks.
- **WCAG 2.2 AA:** automated axe-core checks on the initial screen, semantic landmarks, accessible labels, keyboard-operable controls, and responsive viewport smoke tests. Automated checks do not replace manual assistive-technology testing.
- **ISO/IEC 25010 quality characteristics:** functional suitability, reliability, usability/accessibility, performance, compatibility, security, maintainability, and safety are tracked through unit, browser, build, and release tests.

## Automated gates

1. TypeScript strict typecheck.
2. Domain unit tests using Vitest.
3. Production Vite build.
4. Chromium browser acceptance tests using Playwright.
5. axe-core WCAG 2.2 AA automated scan of the initial screen.
6. RTL metadata, primary navigation, anonymous publishing restrictions, labelled controls, and 360px horizontal-overflow smoke tests.
7. Full production dependency audit: any advisory in a production dependency fails CI.
8. Full dependency audit: every advisory fails CI except the single documented, time-limited upstream picomatch exception below.
9. A lockfile boundary test confirms every picomatch copy is development-only and build/test tools are not runtime dependencies.
10. CI installs from the committed lockfile with `npm ci`; it does not silently resolve a new dependency tree.

## Temporary upstream dependency exception — not a fix

- **Advisory:** GHSA-fc5q-39xc-vjpf / CVE-2026-112366, ReDoS in picomatch repeated extglob parsing.
- **Upstream status checked 2026-11-18:** GitHub's advisory lists affected versions through 4.0.7 and no patched version. Candidate upstream fixes are still unmerged and one has known behavioral edge cases. We do not pull an unreviewed fork or invent a patched version number.
- **Current exposure:** picomatch is pulled only by development/build tooling. The lockfile gate fails if any picomatch copy becomes a production dependency. Production dependency audit must remain completely clean.
- **Mitigation:** do not accept user-controlled glob patterns in app/runtime code; keep glob matching limited to trusted build configuration. The exception permits only this exact advisory and its transitive dependency chain; every unrelated advisory fails CI.
- **Expiry:** 2026-12-01 23:59 UTC. At expiry CI fails until the upstream advisory is re-triaged and a real fix or an explicitly renewed risk decision is recorded.
- **Residual risk:** development/build tooling remains affected according to the published advisory. This is a controlled temporary exception, not a claim that the dependency is patched.

## Known exclusions — not yet passed

- No live Supabase integration test or role-by-role RLS negative test has been run.
- No authenticated end-to-end workflow, cargo negotiation, trip lifecycle, payment, commission, document upload, or admin journey is implemented and covered end to end.
- No manual WCAG keyboard/screen-reader audit, mobile-device matrix, iOS/macOS build, Android APK device test, or Windows desktop build test has been completed.
- No external penetration test, DAST against a deployed environment, load test, backup-restore drill, or independent ISO/OWASP certification has been performed.

A green CI run means only that the configured automated checks passed for that commit. It is not a claim of production readiness or standards certification.
