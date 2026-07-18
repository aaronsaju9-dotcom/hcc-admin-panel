# HCC complete project handover prompt

Copy everything in this file into a new Codex/AI task when handing over the HCC
website and mobile app. This is the canonical handover as of **18 July 2026**.

---

You are taking over the production-readiness and publishing work for the
Hamriyah Cricket Centre (HCC) website, admin panel, booking backend, and mobile
app. Work directly from the existing projects and preserve completed work.

## 1. User preferences and decisions

- The user wants clear, simple, step-by-step instructions and wants the agent to
  perform every safe technical action it can.
- Do not use GPT Sites or create a new generated website.
- Client approval of the website/app design is complete.
- Use the existing Render service and existing Supabase project. **Do not create
  a new Render service or a new Supabase project.**
- A custom domain is postponed. Continue using the current Render URL.
- Render Starter upgrade is the immediate website task. The user must enter and
  approve payment themselves.
- Store publishing will use personal developer accounts for now. The user is
  comfortable with their personal legal name appearing as the seller/developer.
- A D-U-N-S number is therefore not currently needed. If the accounts are later
  converted to HCC organization accounts, both Apple and Google will require
  HCC's D-U-N-S number and legal-entity verification.
- The test phone is an **iPhone XR running iOS 18.7.9**.
- Do not downgrade the final app merely to make Expo Go work. Expo SDK 57 targets
  iOS 16.4+, so the final TestFlight/App Store build should support this phone.
  The earlier physical-phone problem was Expo Go availability/compatibility
  during the SDK 57 transition. Use a real TestFlight/development build for the
  final iPhone test.

## 2. Workspace and canonical repositories

Workspace root:

`/Users/aaronsaju9gmail.com/Documents/HCC website`

There are exactly two canonical release projects:

1. Website, admin panel and booking API:
   `/Users/aaronsaju9gmail.com/Documents/HCC website/admin-panel`
2. Expo iOS/Android app:
   `/Users/aaronsaju9gmail.com/Documents/HCC website/hcc-mobile-app`

The workspace root is the website Git repository:

- GitHub: `https://github.com/aaronsaju9-dotcom/hcc-admin-panel`
- Branch: `main`
- Latest website commit: `add3e93 Allow Google to crawl the public website`

The mobile folder is a separate nested Git repository:

- GitHub: `https://github.com/aaronsaju9-dotcom/hcc-mobile-app`
- Branch: `main`
- Latest mobile commit: `b428a1d Update Expo release patch`

Both repositories were clean and synchronized with `origin/main` at handover.
Always run Git commands from the correct repository. The root `.gitignore`
intentionally ignores the nested mobile repository.

Previously deleted duplicate/experimental folders and exports:

- `hcc-admin-sites`
- `hcc-app-admin-backend`
- `hcc-mobile-app-expo-go`
- `outputs`
- duplicate root `index.html`, `logo.png`, `hero-bg-cricket.png`, and
  `hero-cricket.mp4`

Do not recreate or deploy those copies. About 1.4 GB of redundant files was
removed. `node_modules`, Expo caches, coverage, and build output are generated
locally and are ignored by Git.

## 3. Live website and external services

Current production origin:

`https://hcc-with-admin-panel.onrender.com`

Temporary client-friendly redirect:

`https://tinyurl.com/hccsharjah`

Important Render details:

- Existing service ID: `srv-d8ta6ou7r5hc73eoott0`
- The Render dashboard display name was changed to `hcc-sharjah`.
- The public Render subdomain did **not** change. Render does not rename an
  existing `onrender.com` subdomain.
- `https://hcc-sharjah.onrender.com` is not the application URL.
- `render.yaml` still uses the original service name
  `hcc-with-admin-panel`; that is acceptable.
- The existing service was on Render Free at the last check. Upgrade this same
  service to Starter; do not create another service.

Production health endpoint:

`https://hcc-with-admin-panel.onrender.com/health`

The last verified health response was ready with:

- `ok: true`
- `ready: true`
- no `readinessIssues`
- content storage: Supabase
- booking storage: Supabase
- booking retention: disabled (`0` days)
- image storage: Cloudinary
- authentication: Supabase Auth
- local admin: disabled
- forms: configured

External services already in use:

- Render: Node website/backend hosting
- Supabase: content, bookings, audit data, and admin authentication
- Cloudinary: uploaded content images
- Formspree: staff booking notifications
- GitHub: source control and CI
- Google Search Console: URL-prefix property for the Render origin
- TinyURL: temporary short client link

Never expose or copy actual credentials into source, chat, logs, screenshots, or
the mobile app. Secret values remain in provider dashboards.

## 4. Google Search Console state

- The Render URL-prefix property was verified automatically using the existing
  `google-site-verification` meta tag in `admin-panel/site.html`.
- `/sitemap.xml` was submitted successfully.
- Google previously reported the URL as blocked by `robots.txt`.
- Source code now serves a crawlable `robots.txt` for public pages while
  disallowing admin/login/reset/API routes.
- The remaining problem is Render Free sleeping behavior: Render can intercept
  `/robots.txt` for a sleeping free service and return a disallow-all response
  without waking the app. Google caches robots responses.
- Reliable crawling requires upgrading the existing service to Render Starter.
  A custom domain is not required for this.

After Starter is active:

1. Verify `/health` returns HTTP 200 and `ready: true`.
2. Verify `/robots.txt` shows `Allow: /` and does not show a global
   `Disallow: /`.
3. Confirm the service remains awake.
4. In Search Console, inspect the production homepage URL.
5. Run **Test Live URL**.
6. Request indexing if the live test succeeds.
7. Recheck the submitted sitemap.
8. Allow roughly one day or more for Google's cached robots response to update.

## 5. Website/backend file map

All paths below are relative to
`/Users/aaronsaju9gmail.com/Documents/HCC website`.

### Root release and deployment files

- `.gitignore` — ignores macOS files, runtime fallback records, nested mobile
  repo, and deleted experimental copies.
- `PUBLISHING_CHECKLIST.md` — complete website/app/store publishing checklist.
- `HCC_COMPLETE_HANDOVER_PROMPT.md` — this handover prompt.
- `render.yaml` — Render Blueprint: Node runtime, `admin-panel` root, build/start
  commands, health check, safe defaults, and names of required secret variables.
- `push-admin.sh` — older helper for publishing website changes; inspect before
  using and prefer normal Git commands when possible.

### Website/admin/backend files

- `admin-panel/server.js` — main Node HTTP server, routes, authentication,
  sessions, Supabase access, Cloudinary upload/delete, Formspree proxy, booking
  persistence/status/admin management, security headers, rate limiting, health,
  SEO routes, public legal/status pages, and static-file allowlist.
- `admin-panel/site.html` — public website UI, booking forms, confirmation page
  behavior, validation, CMS content rendering, privacy/terms content, SEO meta
  tags and Google verification tag.
- `admin-panel/index.html` — admin panel HTML shell.
- `admin-panel/admin.js` — admin login/session interactions, CMS editing,
  bookings workflow, upload/delete, backups, audit log, and password actions.
- `admin-panel/admin.css` — admin panel styling.
- `admin-panel/security-check.js` — automated security/route/readiness checks.
- `admin-panel/supabase-schema.sql` — canonical production database schema for
  `hcc_site_content`, `hcc_admin_audit`, and `hcc_bookings`.
- `admin-panel/package.json` — Node package metadata and `check`,
  `test:security`, `start` scripts; requires Node 24.
- `admin-panel/package-lock.json` — locked website dependency tree.
- `admin-panel/.env.example` — environment-variable template with no secrets.
- `admin-panel/.gitignore` — website-local ignored files.
- `admin-panel/README.md` — architecture, local run, providers, authentication,
  deployment, backup, security and key-rotation documentation.
- `admin-panel/data/content.json` — tracked local development content fallback.
- `admin-panel/data/audit.json` — ignored local runtime audit fallback; not the
  production Supabase record.
- `admin-panel/data/bookings.json` — ignored local runtime booking fallback; not
  the production Supabase record.
- `admin-panel/logo.webp` — optimized public HCC logo.
- `admin-panel/hero-bg-cricket.webp` — optimized public hero background.
- `admin-panel/hero-cricket.mp4` — public hero video.
- `admin-panel/gallery-local-1.webp` — local public gallery fallback.
- `admin-panel/gallery-local-2.webp` — local public gallery fallback.

### Important public and API routes

- `/` — public website
- `/admin` — protected admin panel
- `/login` — admin login
- `/reset-request` — Supabase password-reset request
- `/reset-password` — password-reset landing page
- `/booking-status` — public customer booking-status page
- `/privacy` — public Privacy Policy
- `/terms` — public Terms of Use
- `/health` — public readiness endpoint
- `/robots.txt` — public crawler policy
- `/sitemap.xml` — public sitemap
- `GET /api/content` — published website/app content
- `POST /api/form-submit` — validated booking/tournament request
- `POST /api/booking-status` — safe public status lookup using reference + email
- `GET/PATCH/DELETE /api/bookings...` — protected booking administration
- `POST /api/content` — protected CMS save
- `POST /api/upload` — protected Cloudinary upload
- `POST /api/cloudinary/delete` — protected Cloudinary cleanup
- `/api/session`, `/api/audit`, and password endpoints — protected admin APIs

### Render environment variables

Use `render.yaml` and `admin-panel/.env.example` as the source of truth. Required
production names include:

- `NODE_ENV=production`
- `TRUST_PROXY=true`
- `PUBLIC_ORIGIN=https://hcc-with-admin-panel.onrender.com` until a custom
  domain is connected
- `SESSION_SECRET`
- `ADMIN_SESSION_HOURS=8`
- `ALLOW_LOCAL_ADMIN=false`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_CONTENT_TABLE=hcc_site_content`
- `SUPABASE_AUDIT_TABLE=hcc_admin_audit`
- `SUPABASE_BOOKINGS_TABLE=hcc_bookings`
- `CONTENT_RECORD_ID=main`
- `SUPABASE_AUTH_ENABLED=true`
- `ADMIN_EMAILS`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER=hcc-website`
- `FORMSPREE_ENDPOINT`
- `BOOKING_RETENTION_DAYS=0` until HCC approves another period

Never place `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_SECRET`, Formspree
credentials, admin credentials, or `SESSION_SECRET` in browser/mobile code.

## 6. Mobile app file map

All mobile paths below are relative to
`/Users/aaronsaju9gmail.com/Documents/HCC website/hcc-mobile-app`.

### Application and configuration

- `App.tsx` — root application and navigation/tab composition.
- `index.ts` — Expo/React Native entry point.
- `app.json` — app identity and native configuration. Current app name is
  Hamriyah Cricket Centre; iOS bundle ID and Android package are both
  `com.hcccricket.elite`; iPad support is disabled for release 1.
- `eas.json` — EAS development, preview and production build/submit profiles.
- `package.json` — scripts and dependencies. Current Expo is `~57.0.7`, React
  Native `0.86.0`, and React `19.2.3`.
- `package-lock.json` — locked mobile dependency tree.
- `tsconfig.json` — TypeScript configuration.
- `eslint.config.js` — Expo lint configuration.
- `.env.example` — public build-variable template.
- `.easignore` — prevents local secrets and unnecessary files reaching EAS.
- `.gitignore` — ignores dependencies, builds, caches, native generated folders,
  signing credentials and environment files.
- `.github/workflows/mobile-ci.yml` — GitHub Mobile checks workflow.
- `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json` — local agent/editor guidance;
  read `AGENTS.md` before changing anything inside the mobile repository.

### Mobile screens and logic

- `src/HomeScreen.tsx` — home screen and live HCC content.
- `src/TournamentsScreen.tsx` — tournament listing/details and entry flow.
- `src/BookingScreen.tsx` — booking form, field-level validation, server submit,
  and booking-reference confirmation.
- `src/BookingStatusScreen.tsx` — separate customer status screen.
- `src/BookingStatusCard.tsx` — safe reference + email lookup UI/API client.
- `src/GalleryScreen.tsx` — gallery and full-screen viewer.
- `src/AboutScreen.tsx` — centre information and contact actions.
- `src/ErrorBoundary.tsx` — app-level crash fallback.
- `src/adminContent.ts` — shared Render content client, cache, sanitization and
  `EXPO_PUBLIC_HCC_API_URL` handling.
- `src/booking.ts` — booking dates, reference validation and contact/team input
  validation; directly covered by tests.
- `src/data.ts` — local/default content and data models.
- `src/legal.tsx` — in-app Privacy Policy and Terms with production legal URLs.
- `src/monitoring.ts` — optional Sentry initialization; disabled when the public
  DSN is unset.
- `src/motion.tsx` — reduced-motion-aware animation helpers.
- `src/safeLinking.ts` — allowlisted/safe external-link handling.
- `src/theme.ts` — colours, spacing, typography and visual tokens.
- `src/ui.tsx` — shared reusable mobile UI components.
- `__tests__/booking-test.ts` — seven booking/date/reference/validation tests.

### Mobile documentation

- `README.md` — architecture, backend connection, local run and release notes.
- `PRE_RELEASE_CHECKLIST.md` — authoritative app release checklist.
- `OPERATIONS.md` — daily booking workflow, statuses, retention, incident and
  maintenance procedures.
- `SECURITY_NOTES.md` — mobile threat model and security constraints.
- `LEGAL_REVIEW.md` — completed practical compliance review and remaining HCC
  approvals; not formal legal advice.
- `STORE_LISTING_DRAFT.md` — Apple/Google store descriptions, keywords and
  reviewer notes.
- `STORE_PRIVACY_DECLARATIONS.md` — prepared Apple App Privacy and Google Data
  Safety answers under the stated no-Sentry/no-tracking assumptions.
- `STORE_SCREENSHOTS.md` — screenshot creation and upload guidance.

### Mobile assets

- `assets/app-icon.png`, `assets/icon.png`, `assets/adaptive-icon.png`,
  `assets/splash-icon.png`, `assets/favicon.png` — app/store/platform icons.
- `assets/hcc/logo.png` — HCC logo source.
- `assets/hcc/hero.png`, `assets/hcc/hero-optimized.jpg` — mobile hero assets.
- `assets/hcc/gallery-1.jpg` through `assets/hcc/gallery-7.jpg` — bundled gallery
  fallback images.
- `assets/hcc/tournament-1.jpg` through `assets/hcc/tournament-3.jpg` — bundled
  tournament fallback images.

### Final store assets

- `store-assets/apple/iphone-6.9/01-home.png`
- `store-assets/apple/iphone-6.9/02-booking.png`
- `store-assets/apple/iphone-6.9/03-booking-status.png`
- `store-assets/apple/iphone-6.9/04-gallery.png`
- `store-assets/apple/iphone-6.9/05-about.png`
- `store-assets/apple/iphone-6.9/06-privacy.png`
- `store-assets/google/feature-graphic.png` — verified 1024 x 500 graphic.
- `store-assets/google/phone/01-home.png`
- `store-assets/google/phone/02-booking.png`
- `store-assets/google/phone/03-booking-status.png`
- `store-assets/google/phone/04-gallery.png`
- `store-assets/google/phone/05-about.png`
- `store-assets/google/phone/06-privacy.png`

Raw screenshot-capture directories were deleted after final assets were made.
Do not delete the final store assets above.

### Mobile public variables and backend URLs

Production fallback origin is hard-coded in a few safe client files as:

`https://hcc-with-admin-panel.onrender.com`

Relevant files are `src/adminContent.ts`, `src/BookingScreen.tsx`,
`src/BookingStatusCard.tsx`, and `src/legal.tsx`.

EAS production should also set:

- `EXPO_PUBLIC_HCC_API_URL=https://hcc-with-admin-panel.onrender.com`
- Leave `EXPO_PUBLIC_SENTRY_DSN` empty unless HCC explicitly enables Sentry and
  the privacy declarations are updated.

Never place secret values in an `EXPO_PUBLIC_` variable; those values are
embedded in the shipped app.

## 7. Completed feature and security work

Website/backend completed:

- Production website, CMS/admin panel and shared API.
- Supabase-backed content, audit records, bookings and admin authentication.
- Cloudinary-backed image upload and cleanup.
- Formspree server proxy; endpoint is not exposed in frontend source.
- Website and app booking submissions stored before notification forwarding.
- Server-generated booking reference.
- Dedicated website booking confirmation view containing the reference.
- Dedicated public booking-status page using reference plus matching email.
- Phone-number maximum length and clear validation feedback.
- Admin booking statuses, private notes, CSV/export/backup and deletion.
- Privacy Policy, Terms, SEO metadata, sitemap, robots and health endpoint.
- Rate limiting, same-origin protection, CSP/security headers, secure sessions,
  local-admin production lockout, input limits/sanitization and safe public-file
  allowlist.

Mobile completed:

- Home, tournaments, booking, separate booking-status, gallery and about flows.
- Shared live content and bookings backend with offline cached content.
- Field-specific validation and server-issued booking confirmation reference.
- Safe links, reduced motion, accessible controls and crash fallback.
- In-app legal pages and store privacy/data-safety drafts.
- Phone-only iOS configuration and prepared Apple/Google images.
- Expo SDK patch updated from 57.0.6 to 57.0.7.

## 8. Last verification results

Website commands passed:

```bash
cd "/Users/aaronsaju9gmail.com/Documents/HCC website/admin-panel"
npm run check
npm run test:security
```

Mobile command passed:

```bash
cd "/Users/aaronsaju9gmail.com/Documents/HCC website/hcc-mobile-app"
npm run check
```

The mobile result included:

- TypeScript passed
- Expo lint passed
- Jest: 1 suite, 7/7 tests passed
- Expo Doctor: 20/20 checks passed
- GitHub Actions `Mobile checks` passed for commit `b428a1d`

`npm audit` reports moderate findings in Expo's transitive `xcode -> uuid`
build-tool chain. The suggested forced fix would install Expo 46, an unsafe
11-major-version downgrade. Do not run `npm audit fix --force`. Re-evaluate when
Expo publishes a compatible upstream dependency fix.

## 9. Exact next actions, in order

### A. Finish reliable website hosting and indexing

1. User upgrades the **existing** Render service from Free to Starter and
   completes payment.
2. Verify Render reports Starter and the latest deployment is live.
3. Verify `/health`, `/robots.txt`, `/sitemap.xml`, `/privacy`, `/terms`, normal
   booking, tournament booking, confirmation reference, status lookup and admin
   Bookings.
4. Retest the homepage in Google Search Console and request indexing.
5. Keep the Render origin for now. If HCC later buys a domain, add it to the
   same Render service, update DNS, wait for HTTPS, change `PUBLIC_ORIGIN`, update
   EAS `EXPO_PUBLIC_HCC_API_URL`, update legal/store URLs, then build a new app.

### B. Prepare personal mobile publishing accounts

1. Create/login to an Expo account.
2. Create a personal Apple Developer Program account and pay Apple's annual
   membership. No D-U-N-S is needed for an individual account.
3. Create a personal Google Play Console developer account and pay Google's
   registration fee. No D-U-N-S is needed for a personal account.
4. Obtain written HCC permission to publish and control an app using HCC's name,
   logo, images and service under the user's store accounts.
5. Confirm the public support email, phone, copyright owner and policy approval.
6. Keep in mind that personal Google accounts may have mandatory closed-testing
   requirements; verify the current Play Console requirement at submission time.

### C. Configure Expo/EAS

From the mobile repository:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Then:

1. Link/create the Expo project when prompted.
2. Preserve bundle/package ID `com.hcccricket.elite` unless the user explicitly
   decides before creating store records to use a different permanent ID.
3. Configure EAS production variable
   `EXPO_PUBLIC_HCC_API_URL=https://hcc-with-admin-panel.onrender.com`.
4. Leave Sentry disabled unless declarations are intentionally revised.
5. Run `npm ci && npm run check` again.
6. Create preview builds:

```bash
npx eas-cli@latest build --platform all --profile preview
```

7. Test iPhone XR using the real build rather than relying on Expo Go. Also test
   a current iPhone and small/large Android devices.
8. Test normal and tournament bookings, booking reference, status lookup,
   offline/cache behavior, weak network, large text, VoiceOver/TalkBack, reduced
   motion, all external links, Privacy Policy and Terms.

### D. Create production builds and submit

Production build:

```bash
npx eas-cli@latest build --platform all --profile production
```

Apple:

1. Create App Store Connect record for `com.hcccricket.elite`.
2. Submit/upload the iOS build.
3. Upload the prepared 6.9-inch iPhone screenshots.
4. Complete description, age rating, App Privacy, support/privacy/terms URLs,
   copyright and reviewer notes from the repository drafts.
5. Test the processed build through TestFlight on iPhone XR.
6. Submit for App Review after the user approves the final listing.

Google:

1. Create the Play Console app for `com.hcccricket.elite`.
2. Upload the `.aab` to Internal testing first.
3. Upload Google phone screenshots and `feature-graphic.png`.
4. Complete Data Safety, content rating, audience, ads, app access, privacy URL,
   support contact and reviewer notes from the repository drafts.
5. Complete any personal-account testing requirement shown by Play Console.
6. Resolve pre-launch issues and use a staged production rollout.

## 10. Client/business tasks that cannot be completed only in code

- Pay Render Starter.
- Create/pay Apple and Google personal developer memberships.
- Enter account identity, tax, banking and payment information privately.
- Give written permission for HCC branding/content and approve store metadata.
- Approve the Privacy Policy and Terms; obtain UAE legal advice if desired.
- Decide the booking-retention period and responsible privacy-contact person.
- Ensure the support inbox is monitored.
- Approve TestFlight/internal-test builds and final submissions.
- Purchase/configure a custom domain later if desired.

## 11. Ongoing HCC operations

- Check new and failed-delivery bookings daily.
- Use `Confirmed` only after HCC has approved availability; a form submission is
  only a request.
- Keep private admin notes private.
- Export bookings/content weekly and test restoration monthly.
- Review Supabase admin access monthly and remove former staff.
- Monitor Render health, Supabase, Cloudinary and Formspree usage/failures.
- Rotate `SESSION_SECRET`, Supabase service-role key and provider credentials if
  exposure is suspected; changing `SESSION_SECRET` logs out existing admins.
- Increase app version/build numbers for every release.
- Rerun website/mobile checks before each deployment or store submission.

## 12. Safety constraints for the next agent

- Do not create replacement infrastructure without explicit user approval.
- Do not reveal, read aloud, commit, or paste secrets.
- Preserve unrelated user changes in either Git repository.
- Inspect `git status` and diffs before every commit.
- Never force-downgrade Expo or run `npm audit fix --force`.
- Do not enable Sentry, analytics, advertising, payments, accounts, push,
  location, camera, or other data collection without updating code, policies and
  both store declarations.
- Do not claim a booking is confirmed immediately after submission.
- Do not enable iPad support without iPad testing and screenshots.
- Do not change the bundle/package identifier after store records are created.
- Do not delete the final store assets or canonical projects.
- Any payment, final store submission, production-account creation, credential
  rotation, or destructive provider action must be confirmed with the user at
  the point of action.

Begin by checking both repository statuses and asking whether the Render Starter
upgrade is complete. If it is complete, verify Render and Search Console first.
If it is not complete, continue with safe Expo/store preparation that does not
require payment or private identity details.

---

End of handover prompt.
