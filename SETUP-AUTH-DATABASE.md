# MUeRA Google login and database setup

The source now includes a Google sign-in gate and per-user cloud data sync using Supabase. The database is not provisioned until you create/configure a Supabase project.

## 1. Create the database
1. Create a project at https://supabase.com/dashboard.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Project Settings → API, copy the Project URL and publishable/anon key. Never put a service-role key in the browser.

## 2. Configure Google sign-in
1. In Supabase, open Authentication → Providers → Google and enable it.
2. Configure Google OAuth credentials in Google Cloud Console, including the callback URL shown by Supabase.
3. Add your local and production site URLs to Supabase Authentication → URL Configuration (Site URL and Redirect URLs).

## 3. Set environment variables
Create `.env.local` in the `export` folder for local development:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Set the same variables in your hosting provider's environment settings before building. Do not commit real credentials.

## 4. Run locally
```sh
npm install
npm run dev
```

## Data behavior
- Tasks, timetable, attendance, notes, settings and chat are stored in a per-user row in `public.user_data` and cached in that user's browser.
- Row-level security restricts each user to their own row.
- The existing app layout and navigation are retained.
- This is a JSON document store for the app state, not separate relational tables per feature.
- Configure and test OAuth redirect URLs before production use. The source has not been deployed or tested against your Supabase project.
