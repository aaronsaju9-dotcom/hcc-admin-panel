#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
branch=$(git branch --show-current)
if [ -z "$branch" ] || [ "$branch" = main ]; then
  echo "Use a feature branch and a pull request to publish website changes."
  exit 1
fi
npm test
git add -- index.html base.css redesign.css site.js scroll-design.js assets admin api server.js data/content.json scripts package.json package-lock.json vercel.json render.yaml .github .gitignore .env.example README.md DEPLOYMENT.md HCC_COMPLETE_HANDOVER_PROMPT.md PUBLISHING_CHECKLIST.md supabase-schema.sql archive/old-website archive/retired-media archive/previous-documentation archive/README.md
if git diff --cached --quiet; then
  echo "No website changes to commit."
else
  git commit -m "${1:-Update HCC website}"
fi
git push -u origin "$branch"
echo "Open a pull request to main; verify the deployment before promoting production."
