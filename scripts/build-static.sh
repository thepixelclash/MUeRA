#!/usr/bin/env bash
# Builds the static single-page version for PHP/static hosts such as InfinityFree.
# Output: infinityfree-package/htdocs  (upload the CONTENTS of htdocs to the host's htdocs folder)
# Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment or .env.local (public values only).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist infinityfree-package
MUERA_STATIC=1 VITE_AI_ENDPOINT="${VITE_AI_ENDPOINT:-/api/ai.php}" npx vite build
OUT=infinityfree-package/htdocs
mkdir -p "$OUT/api"
cp -r dist/client/. "$OUT/"
cp "$OUT/_shell.html" "$OUT/index.html"
# Preserve the production navigation animation, including reduced-motion support.
sed -i 's|</head>|<link rel="stylesheet" href="/muera-icons.css"></head>|' "$OUT/index.html"
cp hosting/htaccess-spa "$OUT/.htaccess"
cp hosting/php-api/ai.php hosting/php-api/prompts.php hosting/php-api/config.example.php hosting/php-api/.htaccess "$OUT/api/"
# Some shared hosts serve .mjs as text/plain, which browsers refuse for module workers (PDF reading breaks).
# Rename the PDF worker to .js (always served as JavaScript) and update every reference.
for f in "$OUT"/assets/*.mjs; do
  [ -e "$f" ] || continue
  b="$(basename "$f")"; n="${b%.mjs}.js"
  mv "$f" "$OUT/assets/$n"
  grep -rIl --include='*.js' --include='*.html' --include='*.css' -F "$b" "$OUT" | while read -r r; do sed -i "s|$b|$n|g" "$r"; done
done
# Safety: no secrets may be in the package.
if grep -rIlE "service_role|sk-[A-Za-z0-9]{20,}" "$OUT" >/dev/null 2>&1; then echo "Secret-like text found in package" >&2; exit 1; fi
echo "Package ready: $OUT"
