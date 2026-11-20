# GitHub Pages deployment

The deploy workflow is intentionally manual. Merging code to `main` does not publish it automatically.

Before the first deployment:
1. Open repository Settings → Pages.
2. Set Build and deployment → Source to **GitHub Actions**.
3. Confirm the GitHub Pages URL is the expected Barkoul.ma repository URL.
4. Open Actions → **Deploy Barkoul.ma to GitHub Pages** → Run workflow.
5. Wait for all checks and deployment to complete, then test the public site on mobile and desktop.

The workflow builds `apps/web/dist`, runs security/type/unit/browser/accessibility checks, and publishes that artifact. It does not deploy the legacy root `index.html`. The old root file remains in the repository as a recovery reference; it is not included in the Pages artifact.

The build uses only the Supabase project URL and publishable browser key. Never add a `service_role` or secret key to the workflow or frontend.

A successful workflow is required before saying the new frontend is live. This workflow is manual to avoid publishing unexpectedly when code is merged.
