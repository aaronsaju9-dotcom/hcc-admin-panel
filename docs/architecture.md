# HCC Website architecture

The public page and browser assets live in the project root. scripts/build-public.cjs copies a fixed list into public/ for static hosting. archive/ and admin/ are never copied.

server.js retains the existing content, booking, authentication and legal/status routes. Its explicit file map serves the public homepage and active assets, and serves admin files only after authentication. The public homepage is index.html; admin/index.html is the protected staff shell.

api/index.mjs adapts Vercel rewritten requests to the same Node handler. It removes only its routing query parameter and preserves ordinary endpoint query parameters. Render and local development start that handler as a Node HTTP server with npm start.

Production content and records stay in Supabase; images use Cloudinary and form delivery uses Formspree. Local fallback data is in data/, and Vercel temporary fallback files use /tmp. No schema or production service behavior is changed by this folder reorganization.
