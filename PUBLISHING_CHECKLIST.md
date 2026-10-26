# HCC Website publishing checklist

- Use the repository root, not archived or earlier redesign folders.
- Repository: aaronsaju9-dotcom/hcc-website. Production branch: main.
- Run npm test and confirm GitHub Website checks pass.
- Vercel: root, npm run build, public output; retain the existing project, domain, protection and production configuration.
- Render: root, npm ci, npm start, /health; retain the existing service, domain and mobile API configuration.
- Verify the exact deployment commit, website, content API, readiness, protected admin login, booking/status pages and video seeking.
- Confirm archives, source, credentials and stored records are not public.
- Follow DEPLOYMENT.md to roll back across the folder-layout change.
- Business, app-store and ownership tasks remain preserved in archive/previous-documentation/PUBLISHING_CHECKLIST.md. This reorganization does not mark those separate tasks complete.
