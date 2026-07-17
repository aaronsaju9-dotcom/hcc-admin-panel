# HCC publishing checklist (without GPT Sites)

This workspace has two canonical release projects:

- Website, admin and booking API: `admin-panel`
- iOS and Android app: `hcc-mobile-app`

Do not deploy `hcc-admin-sites`, `hcc-app-admin-backend`, or
`hcc-mobile-app-expo-go`. They are duplicate or experimental copies.

## 1. Business decisions HCC must complete

- [ ] Confirm the licensed legal entity and public developer/seller name.
- [ ] Confirm ownership or licences for every logo, photo, video, font,
      testimonial, tournament poster and store screenshot.
- [ ] Approve the Privacy Policy and Terms with UAE-qualified advice if a
      formal legal opinion is required.
- [ ] Choose a booking-retention period and assign a person to privacy and
      deletion requests. Keep `BOOKING_RETENTION_DAYS=0` until approved.
- [ ] Create organization-owned Apple, Google, Expo, Render, Supabase,
      Cloudinary and Formspree accounts. Do not share one staff password.

## 2. Publish the website/backend on Render

- [ ] Review and push the `admin-panel` changes to GitHub.
- [ ] Back up Supabase and export current admin content.
- [ ] Run `admin-panel/supabase-schema.sql` in the production Supabase project.
- [ ] In Render, create or sync the service from the repository's
      `render.yaml`. It sets the root directory, build/start commands, health
      check and non-secret production defaults.
- [ ] Enter every value that Render prompts for from `render.yaml`. For an
      existing service, add any missing `sync: false` variables manually;
      Render prompts for them only when a Blueprint is first created.
- [ ] Generate `SESSION_SECRET` with `openssl rand -hex 32` and store only the
      generated value in Render.
- [ ] Set `NODE_ENV=production`, `TRUST_PROXY=true`,
      `SUPABASE_AUTH_ENABLED=true`, and `ALLOW_LOCAL_ADMIN=false`.
- [ ] Create individual Supabase Auth users and put only authorised emails in
      `ADMIN_EMAILS`.
- [ ] Deploy. `/health` must return HTTP 200 with `ready: true` and no
      `readinessIssues`.
- [ ] Add the final custom domain in Render, update DNS, wait for HTTPS, then
      set `PUBLIC_ORIGIN` to that exact origin and redeploy.
- [ ] Test one website slot request and one tournament request. Confirm both
      appear in Bookings, status lookup works, private notes stay private, and
      deletion removes public lookup.
- [ ] Configure uptime monitoring for `/health` and a weekly backup/export.

## 3. Prepare the app

- [ ] Decide the final website origin before building. Configure
      `EXPO_PUBLIC_HCC_API_URL` in the EAS production environment.
- [ ] Leave `EXPO_PUBLIC_SENTRY_DSN` empty unless HCC intentionally enables
      diagnostics and updates both store privacy declarations.
- [ ] Review and push the seven local mobile commits to `origin/main`.
- [ ] Run `npm ci && npm run check` in `hcc-mobile-app`.
- [ ] Run `npx expo export --platform ios` and
      `npx expo export --platform android`.
- [ ] Run `npx eas-cli@latest login` and `npx eas-cli@latest build:configure`.
- [ ] Confirm HCC owns bundle/package ID `com.hcccricket.elite` before the
      first store record is created. Changing it later creates a different app.
- [ ] Create preview builds with
      `npx eas-cli@latest build --platform all --profile preview`.
- [ ] Test on a small/current iPhone and small/large Android device, including
      weak network, offline cache, large text, VoiceOver/TalkBack, every link,
      both booking flows, status lookup, Privacy Policy and Terms.
- [ ] Create production builds with
      `npx eas-cli@latest build --platform all --profile production`.

## 4. Google Play

- [ ] Create the Play Console app with package `com.hcccricket.elite`.
- [ ] Upload the first `.aab` manually to an internal testing track.
- [ ] Upload the phone screenshots and `store-assets/google/feature-graphic.png`.
- [ ] Complete the listing, Data Safety, content rating, target audience,
      advertising, app access, privacy policy and support contact forms using
      the repository drafts.
- [ ] If the developer account is a personal account created after
      13 November 2023, complete the required closed test with at least 12
      continuously opted-in testers for 14 days, then apply for production.
- [ ] Resolve every pre-launch report issue, then use a staged production
      rollout rather than releasing to everyone immediately.

## 5. Apple App Store

- [ ] Create the App Store Connect record with bundle ID
      `com.hcccricket.elite`.
- [ ] Upload the production build with
      `npx eas-cli@latest submit --platform ios`.
- [ ] Upload the 6.9-inch iPhone screenshots. The first release is phone-only;
      do not enable iPad support without iPad QA and screenshots.
- [ ] Complete App Privacy, age rating, description, support/privacy URLs,
      copyright and reviewer notes using the repository drafts.
- [ ] Test the processed build with TestFlight.
- [ ] Select the verified build, choose **Add for Review**, then
      **Submit for Review**.

## 6. After release

- [ ] Monitor Render health, Supabase usage, Formspree delivery failures,
      Cloudinary usage, store crashes and reviews.
- [ ] Review admin access monthly and remove former staff immediately.
- [ ] Export bookings/content weekly and test restoration monthly.
- [ ] Increase the app version/build numbers for every subsequent release.
- [ ] Run dependency audits and the complete check suite before every release.
