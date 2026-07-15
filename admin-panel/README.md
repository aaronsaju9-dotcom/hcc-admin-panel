# HCC Admin Panel

This folder contains the shared website/mobile-app admin panel, Supabase-ready content and booking APIs, and public website preview for Hamriyah Cricket Centre.

## Local Run

```bash
npm start
```

Open:

- Website: `http://localhost:8765/`
- Admin: `http://localhost:8765/admin`
- Content API: `http://localhost:8765/api/content`
- Protected bookings API: `http://localhost:8765/api/bookings`
- Public booking-status API: `POST http://localhost:8765/api/booking-status`
- Customer booking-status page: `http://localhost:8765/booking-status`

Without Supabase environment variables, the app uses `data/content.json` as a local fallback.

## Phase 1: Supabase Content Database

This phase stores website content in Supabase instead of relying on `data/content.json`.

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the SQL in `supabase-schema.sql`.
4. Add these environment variables to your host:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_CONTENT_TABLE=hcc_site_content`
   - `SUPABASE_AUDIT_TABLE=hcc_admin_audit`
   - `SUPABASE_BOOKINGS_TABLE=hcc_bookings`
   - `CONTENT_RECORD_ID=main`
5. Restart the Node app.

When Supabase variables are present, `/api/content` reads and writes Supabase. If they are missing, it uses the local JSON fallback for development.

Important: keep `SUPABASE_SERVICE_ROLE_KEY` on the server only. Do not put it in browser JavaScript.

## Phase 2: Cloudinary Image Storage

This phase stores uploaded images in Cloudinary and saves only the hosted image URLs in Supabase/content data.

1. Create a Cloudinary account.
2. In Cloudinary, open Dashboard.
3. Copy:
   - Cloud name
   - API key
   - API secret
4. Add these environment variables to your host:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `CLOUDINARY_FOLDER=hcc-website`
5. Restart the Node app.

When Cloudinary variables are present, image uploads go to Cloudinary through the protected server endpoint `/api/upload`. If they are missing, the app falls back to local data URLs for development only.

Important: keep `CLOUDINARY_API_SECRET` on the server only. Do not put it in browser JavaScript.

## Phase 4: Supabase Auth Admin Users

The app can use Supabase Auth for real admin accounts.

1. In Supabase, create admin users under Authentication.
2. Add allowed admin emails to `ADMIN_EMAILS`.
3. Set:
   - `SUPABASE_AUTH_ENABLED=true`
   - `SUPABASE_ANON_KEY`
   - `ADMIN_EMAILS=owner@example.com,manager@example.com`
4. Restart/redeploy.

When `SUPABASE_AUTH_ENABLED=true`, the local `ADMIN_USER` / `ADMIN_PASSWORD` login is disabled by default. Set `ALLOW_LOCAL_ADMIN=true` only for a short, deliberate emergency window, then disable it again.

`ADMIN_EMAILS` means the Supabase Auth email addresses allowed into the admin panel. Example:

```bash
ADMIN_EMAILS=owner@hcc.com,manager@hcc.com
```

## Phase 5: Editorial Controls

The admin panel supports:

- Published/hidden status
- Featured flags
- Display order

Hidden content stays out of the public website. Display order controls sorting across tournaments, gallery images, socials, and testimonials.

## Phase 6: Production Hardening

Included server hardening:

- Login and API rate limiting
- Content Security Policy and anti-framing headers
- Same-origin checks for all write requests
- Eight-hour admin session expiry by default
- Exact public-file allowlist that blocks server source, data files, and deployment documentation
- Production local-admin fallback disabled when Supabase Auth is enabled
- Form honeypot, field allowlist, and input-length limits
- `GET /health`
- `GET /robots.txt`
- `GET /sitemap.xml`
- Admin routes hidden from robots
- Admin Settings screen with storage/auth status
- Supabase password reset and password change flow
- Content export/import backup tools
- Form validation for links, dates, and required fields
- Cloudinary cleanup for images uploaded after this update
- Server-backed admin audit log
- SEO meta tags, structured data, privacy page, and terms page

## Formspree Endpoint

Booking forms submit to `/api/form-submit`. The server forwards them to Formspree using an environment variable:

```bash
FORMSPREE_ENDPOINT=https://formspree.io/f/your-form-id
```

This keeps the Formspree URL out of `site.html` and lets you change forms from Render env settings.

Every valid booking is saved before it is forwarded, receives a server-generated reference such as `HCC-20260715-A1B2C3D4`, and can be managed from **Bookings** in the admin panel. Status and internal notes are private admin fields. For persistent production booking history, run the latest `supabase-schema.sql` and set `SUPABASE_BOOKINGS_TABLE=hcc_bookings` in Render.

Customers can check progress from the dedicated `/booking-status` website page or the separate status screen in the app using the booking reference and matching email address. The public status response intentionally excludes names, phone numbers, email addresses, submitted notes, delivery state, and private admin notes. Failed lookups use the same response whether the reference or email is wrong.

Admins can permanently delete an individual booking from its expanded card. This cannot be undone, so export a CSV or database backup first when the record may still be needed.

Optional automatic retention is controlled with:

```bash
BOOKING_RETENTION_DAYS=0
```

`0` disables automatic deletion. A positive whole number deletes bookings older than that many days when the booking list is read. Choose a period only after confirming HCC's operational, accounting, dispute, and legal requirements.

### Customer Auto-response Email

The server includes the generated `booking_reference` and customer `email` in the Formspree submission. To send an automatic acknowledgement, configure an Auto Response action in the Formspree dashboard Workflow for this form. Formspree currently lists autoresponses for Professional and Business plans and requires an `email` field, which these forms provide. The message should state that the request is not confirmed yet and provide HCC's phone/email for urgent changes. Only include the booking reference if the selected Formspree plan, sending-domain setup, and template explicitly support submission fields in autoresponses. This is a Formspree account setting; it is not enabled by source code alone.

## Admin Login

The admin panel and content writes are protected by a login page.

Default local credentials:

- Username: `admin`
- Password: `change-this-password`

Set these environment variables before hosting:

```bash
ADMIN_USER=your-user
ADMIN_PASSWORD=your-strong-password
SESSION_SECRET=another-long-random-secret
ADMIN_SESSION_HOURS=8
ALLOW_LOCAL_ADMIN=false
PUBLIC_ORIGIN=https://your-domain.example
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
SUPABASE_BOOKINGS_TABLE=hcc_bookings
BOOKING_RETENTION_DAYS=0
SUPABASE_AUTH_ENABLED=true
ADMIN_EMAILS=owner@example.com
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_FOLDER=hcc-website
FORMSPREE_ENDPOINT=https://formspree.io/f/your-form-id
NODE_ENV=production
TRUST_PROXY=true
```

### Password Reset And Change

For production, use Supabase Auth:

- Admin login page: `/login`
- Admin panel: `/admin`
- Forgot password page: `/reset-request`
- Password reset landing page: `/reset-password`

Admins listed in `ADMIN_EMAILS` can request a reset email. Logged-in Supabase admins can also change their password from **Settings** inside the admin panel.

The local `ADMIN_USER` / `ADMIN_PASSWORD` account is intended for local development. It is disabled whenever Supabase Auth is enabled unless `ALLOW_LOCAL_ADMIN=true` is explicitly set.

Admin cookies are signed, `HttpOnly`, `SameSite=Lax`, `Secure` in production, and expire after `ADMIN_SESSION_HOURS` (eight hours by default). Changing `SESSION_SECRET` immediately invalidates every existing admin session.

### Backups

Use **Export JSON** before major content cleanup or client handover. The exported file can be imported again from the admin toolbar.

### Cloudinary Cleanup

New image uploads save Cloudinary `public_id` values alongside the image URL. When those images are replaced or deleted later, the admin panel asks Cloudinary to remove the old asset.

Images uploaded before this feature may not have a saved `public_id`, so they may need manual cleanup in Cloudinary.

### Audit Log

The dashboard shows recent admin actions from `/api/audit`.

For Supabase persistence, run the latest `supabase-schema.sql`. It creates:

- `public.hcc_site_content`
- `public.hcc_admin_audit`
- `public.hcc_bookings`

If the audit table is missing, the app falls back to `data/audit.json` and content edits still work.

## Hosting On Render

1. Push this `admin-panel` folder to a GitHub repository.
2. Create a new Render Web Service.
3. Use this folder as the app root if your repo contains more than this folder.
4. Build command: leave empty or use `npm install`.
5. Start command: `npm start`.
6. Add environment variables:
   - `ADMIN_USER`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `ADMIN_SESSION_HOURS=8`
   - `ALLOW_LOCAL_ADMIN=false`
   - `PUBLIC_ORIGIN=https://your-domain.example`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_AUDIT_TABLE`
   - `SUPABASE_BOOKINGS_TABLE=hcc_bookings`
   - `BOOKING_RETENTION_DAYS=0`
   - `SUPABASE_AUTH_ENABLED`
   - `ADMIN_EMAILS`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `FORMSPREE_ENDPOINT`
7. Admin edits will use Supabase and image uploads will use Cloudinary when those variables are configured.

## Hosting On Railway

1. Push this folder to GitHub.
2. Create a Railway project from the repo.
3. Railway should detect the Node app from `package.json`.
4. Start command: `npm start`.
5. Add `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_AUTH_ENABLED`, `ADMIN_EMAILS`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `FORMSPREE_ENDPOINT` variables.

## Production Notes

- Supabase is now supported for Phase 1 database-backed content.
- Cloudinary is now supported for Phase 2 hosted image storage.
- Supabase Auth is supported for Phase 4 admin users.
- Published/order/featured controls are supported for Phase 5 content polish.
- `data/content.json` remains only as a local fallback.
- Uploaded images are stored as Cloudinary URLs when Cloudinary env vars are configured. Base64 local fallback is development only.
- The admin session is cookie based. Use `SUPABASE_AUTH_ENABLED=true` and `ADMIN_EMAILS` for real admin accounts.
- Keep database backups or periodic JSON exports.

## Security Verification And Key Rotation

Run the automated route, header, origin, login, honeypot, and session checks before deployment:

```bash
npm run check
npm run test:security
```

If a Supabase service-role key is ever exposed, rotate it in the Supabase dashboard, replace `SUPABASE_SERVICE_ROLE_KEY` in Render, and redeploy. Also generate a new `SESSION_SECRET` during client handover so previously issued admin sessions stop working.

After connecting the final domain, set `PUBLIC_ORIGIN` to the full HTTPS origin, for example `https://hamriyahcricket.ae`. This value is used for password-reset links, `robots.txt`, and `sitemap.xml`.
