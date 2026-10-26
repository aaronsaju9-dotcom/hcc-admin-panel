# HCC Website deployment

The repository root is the single active website project. archive/old-website contains the unchanged original source and must not be deployed.

## GitHub

Repository: aaronsaju9-dotcom/hcc-website. Production branch: main. Website checks runs npm test and the dependency audit from the root. Use feature branches and pull requests. The separate security-hardening branch and pull request are preserved for later review.

## Vercel

Keep the existing project and https://hcc-admin-panel.vercel.app. Root Directory: blank (repository root). Build Command: npm run build. Output Directory: public. The root vercel.json defines the same settings and backend rewrites.

The build publishes only the explicit allowlist in scripts/build-public.cjs. Admin files, stored data, credentials, archives, SQL and backend source are excluded from public static output. The Node adapter receives APIs and protected pages.

Retain existing environment variables and deployment protection. Production PUBLIC_ORIGIN is https://hcc-admin-panel.vercel.app. Preview configuration is separate; do not copy production credentials into preview. Test a staged production deployment with its production configuration before promoting that same build, then restore domain auto-assignment.

## Render

Keep service hcc-with-admin-panel and https://hcc-with-admin-panel.onrender.com because the mobile projects use that address. Root Directory: blank (repository root). Build: npm ci. Start: npm start. Health: /health. render.yaml describes the same root layout.

Update the existing service folder setting during rollout and verify its repository connection after the GitHub rename. Do not create a replacement service, reset variables, run schema changes or import local content. Render PUBLIC_ORIGIN and its existing configuration stay unchanged.

## Verification and rollback

Run npm test before release. Confirm index.html is the public homepage; /admin and /admin/index.html require sign-in; archives, source and private data return 404. The tests use temporary local records and fake notification delivery.

After release check /, /health, /api/content, /booking-status, /booking-confirmation, /privacy, /terms, protected /admin, and video byte ranges on both hosts. /health must be ready. Review the browser layout, booking tabs and scroll hero. Do not submit a real booking during deployment checks.

For rollback across the folder migration, first restore host root settings for the older commit (admin-panel on Render; the previous Vercel release supported root and admin-panel). Redeploy the prior production version. Existing Supabase records remain in place.
