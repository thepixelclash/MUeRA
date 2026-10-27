# MUeRA

**Multitasking Universal Educational Responsive Assistant**

A student academic companion by **The Pixel Clash**.

Plan smarter. Learn easier. Stay ahead.

## Features

- Academic calendar, timetable PDF import and task planning
- Attendance tracking and recovery planning
- PDF learning assistant, original-PDF recovery and document stacks
- AI assistant through a server-side OpenAI-compatible endpoint
- Google sign-in, per-user Supabase storage and opt-in Google Drive uploads
- Opt-in Student Connect with first-contact message requests
- Installable PWA and reduced-motion-aware navigation animations

## Local development

Use Node.js 22 or newer and npm.

```sh
npm ci --legacy-peer-deps
cp .env.example .env.local
# Fill your own public Supabase values and optional Google OAuth client ID.
npm run dev
```

The repository contains placeholders only. Never commit `.env.local`, provider keys, access tokens, or PHP `config.php`. Public browser configuration is not a server credential; a Supabase service-role key must never be used in the browser.

## Database and authentication

Create a Supabase project, then apply `supabase/migrations/0001` through `0009` in filename order. Review migrations and back up existing databases before applying them. `supabase/schema.sql` is an older baseline, not a replacement for all nine migrations. Enable Google authentication and configure the redirect URLs for your own deployment. For Drive uploads, enable the Drive API, set your OAuth client ID and allow your website origin. See `SETUP-AUTH-DATABASE.md` for background.

## Build for InfinityFree / PHP hosting

```sh
npm run build:static
```

Upload the contents of `infinityfree-package/htdocs/` to your website's `htdocs`. On the server only, copy `api/config.example.php` to `api/config.php` and fill in your own AI provider and Supabase configuration. Keep the included API access-protection rules. Do not overwrite an existing server secret file.

The static package includes the PHP endpoint, SPA rewrite rules, PWA assets and production navigation motion. The separate default `npm run build` targets server hosting; do not upload that output to a PHP-only host.

## Checks

```sh
npm test
npm run test:php
npx tsc --noEmit
```

The source passed 85 unit tests and a static build during repository preparation on 27 October 2026. This does not certify every external service or real-device workflow. Live two-account data-isolation and phone installation were not part of this preparation.

## Source snapshot

Prepared from the 26 October PDF-opening-fix source archive and reconciled with production at https://muera.page.gd/ on 27 October 2026. Rebuilding with the production public configuration reproduced all 38 downloaded JavaScript/CSS dependency files byte-for-byte, excluding the separately deployed navigation CSS, which is included as `public/muera-icons.css`. The demo-only sidebar color override is not included.

`docs/PRODUCTION-GUIDE.md` contains historical implementation notes and older test/deployment states. This README is the current setup entry point. No production credentials, user documents, database rows, logs, or Git history are included.

No software license has been selected in this repository.
