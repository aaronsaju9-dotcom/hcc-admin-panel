# HCC Website handover

The approved redesigned website is the main project in the repository root. Start with README.md and DEPLOYMENT.md. Source: https://github.com/aaronsaju9-dotcom/hcc-website. Keep the existing Vercel and Render addresses.

Homepage: index.html. Styles: base.css and redesign.css. Browser logic: site.js and scroll-design.js. Active media: assets/. Protected administration: admin/. Backend: server.js. Vercel adapter: api/index.mjs. Build and checks: scripts/.

Run npm start from the root; PORT=8768 npm start uses the previous review address. Run npm test before release. npm run build creates only allowlisted public/ output.

Preserve navigation, content, booking and tournament flows, contact details and branding. The hero video is paused and seeks with scrolling; it must not autoplay. Sections enter once on first appearance. Testimonials keep their moving-column presentation, pause controls and reduced-motion handling. The pitch section has no photo, video or reserved media space.

archive/old-website is the unchanged original production source. Earlier local designs, original working files and the temporary release checkout are retained in ignored archive folders. Never publish those folders or credentials. Archived instructions describe former layouts.

Production data remains in the existing Supabase, Cloudinary and Formspree services. Do not replace production content with local JSON, rotate credentials or run schema changes for this folder move. The mobile projects and Render API address stay intact.

The separate codex/security-hardening branch and pull request are preserved. Private original working files and uncommitted documentation are retained under archive/local-backups. Reconcile that separate work deliberately in a later change.
