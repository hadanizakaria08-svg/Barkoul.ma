# Barkoul.ma — Quality and security test baseline

This is an engineering test baseline, not a certification or penetration-test report.

## Standards mapped into the test plan

- **OWASP ASVS 5.0, Level 1 target:** authentication/session handling, access control, input validation, error handling, secure configuration, and dependency hygiene. Database authorization must be tested against the live Supabase policies before release.
- **OWASP Top 10 (2025) awareness:** access control, security misconfiguration, software supply-chain failures, injection, authentication failures, and logging/monitoring are tracked as release risks.
- **WCAG 2.2 AA:** automated axe-core checks on the initial screen, semantic landmarks, accessible labels, keyboard-operable controls, and responsive viewport smoke tests. Automated checks do not replace manual assistive-technology testing.
- **ISO/IEC 25010 quality characteristics:** functional suitability, reliability, usability/accessibility, performance, compatibility, security, maintainability, and safety are tracked through unit, browser, build, and release tests.

## Automated gates

1. TypeScript strict typecheck.
2. Domain unit tests using Node's built-in test runner through tsx.
3. Production browser bundle generated with esbuild.
4. Lightweight Node development server used for local browser tests.
5. Chromium browser acceptance tests using Playwright.
6. axe-core WCAG 2.2 AA automated scan of the initial screen.
7. RTL metadata, primary navigation, anonymous publishing restrictions, labelled controls, and 360px horizontal-overflow smoke tests.
8. Full `npm audit` across production and development dependencies; any advisory fails CI.
9. A dependency-boundary check ensures picomatch, Vite, Vitest and Workbox are absent from the resolved dependency tree.
10. CI installs from the generated lockfile using `npm ci`.
11. PWA manifest and a small same-origin service worker are maintained directly. The service worker caches only the app shell and same-origin static assets; Supabase API traffic is never cached.

## Dependency-remediation decision

The published upstream advisory **GHSA-fc5q-39xc-vjpf / CVE-2026-112366** affected picomatch through version 4.0.7 and had no patched release at the time of remediation. Rather than pin an unpatched version or import an unreviewed third-party fork, the project removed the build/test dependency chain that introduced picomatch: Vite, Vitest, vite-plugin-pwa, Workbox and picomatch itself. The replacement uses esbuild, Node's built-in test runner, tsx and a minimal Node development server.

CI must confirm these package names are absent and that a full dependency audit reports zero vulnerabilities. This removes the vulnerable package from Barkoul.ma's resolved dependency tree; it does not claim that the upstream picomatch project has been fixed.

## Known exclusions — not yet passed

- No live Supabase integration test or role-by-role RLS negative test has been run.
- No authenticated end-to-end workflow, cargo negotiation, trip lifecycle, payment, commission, document upload, or admin journey is implemented and covered end to end.
- No manual WCAG keyboard/screen-reader audit, mobile-device matrix, iOS/macOS build, Android APK device test, or Windows desktop build test has been completed.
- No external penetration test, DAST against a deployed environment, load test, backup-restore drill, or independent ISO/OWASP certification has been performed.

A green CI run means only that the configured automated checks passed for that commit. It is not a claim of production readiness or standards certification.
