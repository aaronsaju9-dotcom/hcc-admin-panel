# HCC Admin Panel

This folder contains the admin panel, Supabase-ready content API, and public website preview for Hamriyah Cricket Centre.

## Local Run

```bash
npm start
```

Open:

- Website: `http://localhost:8765/`
- Admin: `http://localhost:8765/admin`
- Content API: `http://localhost:8765/api/content`

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

The existing `ADMIN_USER` / `ADMIN_PASSWORD` login remains as a fallback. Use a strong fallback password.

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
- Security headers
- `GET /health`
- `GET /robots.txt`
- `GET /sitemap.xml`
- Admin routes hidden from robots

## Formspree Endpoint

Booking forms submit to `/api/form-submit`. The server forwards them to Formspree using an environment variable:

```bash
FORMSPREE_ENDPOINT=https://formspree.io/f/your-form-id
```

This keeps the Formspree URL out of `site.html` and lets you change forms from Render env settings.

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
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
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
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
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
