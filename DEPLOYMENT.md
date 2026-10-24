# Approved HCC redesign release

This release replaces only the public website presentation and adds Vercel-compatible packaging. It starts from production main commit a3d8a22c7b756551a4c1f8cd0c478a4482b780cf. The separate security-hardening pull request is not included.

## Preserved services

- Existing Render deployment and its environment variables remain unchanged. The same admin, content, booking, status, confirmation and legal routes remain available.
- No database schema change, content import, valid booking submission or credential rotation is part of this release.
- Vercel needs the existing production backend environment variables and its own matching PUBLIC_ORIGIN. A successful static homepage alone does not verify backend readiness: /health must be ready before promoting production.

## Vercel packaging

Both repository-root and admin-panel-root projects have matching Vercel configurations. Run npm run build in the chosen project root. Only its generated public/ directory is published as static content; source files, the admin shell, credentials and stored data are excluded. API and protected pages use the Node adapter.

The hero video is served as a static asset on Vercel and supports range responses on Render. The pitch section contains no video or photo. Its former media block is archived in design-archive/pitch-media.html with the trimmed video and poster retained in admin-panel/assets/. Archived pitch media is excluded from the public build.

## Checks

- Root npm test: JavaScript checks, existing backend security regression suite, static build and release integration checks.
- Release checks cover protected admin/data routes, the Vercel adapter, empty-form validation, MP4 ranges/HEAD, public output allowlist and the text-only pitch.
- The GitHub workflow runs these checks on pull requests and main.

## Rollout and rollback

1. Confirm the existing Vercel project/team, production branch, domains and backend variable configuration.
2. Review the GitHub preview deployment, verify published content and /health, then publish the approved commit to main.
3. Check the production homepage, hero media, content API, legal/status pages and admin login redirect. Render may also auto-deploy main after checks pass.
4. To undo the UI release, revert its merge commit on main and let the connected hosts redeploy. Existing production records remain in the same storage.
