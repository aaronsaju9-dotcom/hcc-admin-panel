# HCC Website

The main Hamriyah Cricket Centre website, protected administration and booking API. The approved redesign lives directly in this project folder.

- Website: https://hcc-admin-panel.vercel.app
- Existing website and mobile API: https://hcc-with-admin-panel.onrender.com
- Source: https://github.com/aaronsaju9-dotcom/hcc-website

## Run locally

Use Node.js 24 and run `npm start` from this folder. The default address is http://localhost:8765. `PORT=8768 npm start` uses the existing review address.

`npm run build` creates the allowlisted website in `public/`. `npm test` checks syntax, backend security, the booking lifecycle and release packaging. Tests use temporary local data and a fake notification service; no real booking or notification is sent.

Production credentials stay in the hosting providers. The server does not automatically load .env files. Without service configuration it uses bundled local content and does not deliver notifications. See .env.example for configuration names and DEPLOYMENT.md for hosting settings.

## Layout

| Path | Purpose |
| --- | --- |
| index.html | Approved public homepage |
| base.css, redesign.css | Website styles |
| site.js, scroll-design.js | Site behavior, entrances and scroll-controlled hero |
| assets/ | Active images, hero film and poster |
| admin/ | Protected staff interface, excluded from static output |
| server.js, api/ | Booking, content and authentication service |
| data/content.json | Bundled seed; production still uses Supabase |
| scripts/ | Build, checks and publishing helper |
| archive/old-website/ | Original website, unchanged and retained on GitHub |
| archive/retired-media/ | Removed pitch media, excluded from publication |
| archive/design-drafts/ | Earlier local design copies, excluded from Git and hosting |
| archive/local-backups/ | Private original working files and unfinished work |

The hero film advances and reverses with scrolling, holding its frame when scrolling stops. Sections enter once on first appearance. Testimonial columns retain their pause controls and reduced-motion behavior. The pitch section contains its existing information and booking link with no photo, video or reserved media space.

Navigation, booking forms, tournament management, contact details and existing content are preserved. The separate security-hardening branch and pull request remain separate. Independent mobile projects stay in their existing local folders.
