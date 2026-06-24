#!/bin/sh
set -e

cd "$(dirname "$0")"

git add admin-panel

if git diff --cached --quiet; then
  echo "No admin-panel changes to commit."
else
  git commit -m "${1:-Update HCC admin panel}"
fi

git push -u origin main
