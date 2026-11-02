# Business Search

A personal CRM for finding a small business to buy. It starts with laundromats and works for any business type. It runs in the browser on your laptop and your phone.

## What it does

| Area | Features |
|---|---|
| **Businesses** | Organized by business type (Laundromat is set up for you; add more in Settings, each with its own extra fields). Search, filter, sort, bulk actions. |
| **Getting data in** | Upload **Excel (.xlsx) or CSV**, paste a **Google Sheet link**, or paste a table straight from **ChatGPT / Claude / Google**. Columns are matched automatically and you can fix the mapping. **Duplicates and previously ruled-out businesses are flagged** so they don't come back. Or add businesses manually. |
| **Owners** | Owners are separate from businesses, so one owner can have several locations. Owner mailing address and a **do-not-contact** flag. |
| **Activity log** | Calls, door knocks, postcards, letters, emails, texts, meetings, notes, each with an **outcome** (voicemail, spoke to owner, not interested…). Bulk-log a postcard or letter campaign to many businesses at once. |
| **Pipeline** | Prospect → Contacted → In conversation → NDA → Financials → LOI → Due diligence → Closed. A prospect moves to Contacted automatically on your first outreach. |
| **Follow-ups** | A next follow-up date and note on each business. The **Today** page shows what's due and overdue. |
| **Ruling out** | A reason (too small, bad lease, not selling…), a note, and an optional **revisit date**. Ruled-out businesses come back on Today when that date arrives. |
| **Map** | Every business on a map, colored by stage. Addresses are converted to map locations automatically. |
| **Route planner** | Enter a start, an end (or round trip) and **how many stops**. It picks the businesses that are most "on the way", orders them, and gives you a list. It skips ruled-out businesses, do-not-contact owners, and anything you knocked on recently. Save the route, open it on your phone, and use **Navigate** (Google Maps) plus **one-tap outcome logging** at each door. |
| **Exports** | A mailing-list CSV (owner name + mailing address, ready for Lob, Click2Mail, or Word mail merge), a full CSV export, and a JSON backup/restore. |

## Setup (about 20 minutes, all free)

You can try it right away without any setup: run it locally (below) and it saves data in your browser ("Local mode"). To use it on both your **phone and laptop**, do these three steps.

### 1. Database: Supabase (free)
1. Create an account at [supabase.com](https://supabase.com) → **New project** (any name, pick a region near you, save the database password somewhere).
2. In the project, open **SQL Editor → New query**, paste the whole contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Go to **Project Settings → API** (or **Connect**) and copy the **Project URL** and the **anon / publishable key**.

### 2. Hosting: Vercel (free)
1. Sign in at [vercel.com](https://vercel.com) with GitHub → **Add New… → Project** → import this repository.
2. Under **Environment Variables** add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. Click **Deploy**. You get a URL like `business-search-xyz.vercel.app`.
4. Open it, click **Create your account**, and sign up with your email. (Supabase may email you a confirmation link first.)
5. **Lock it down:** since this is just for you, go to Supabase → **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Your data is already private to your login (row-level security), but this stops anyone else from making an account.

On your phone, open the URL and choose **Add to Home Screen** so it works like an app.

> Netlify works too: `public/_redirects` is already included. Use the same two environment variables, build command `npm run build`, publish directory `dist`.

### 3. Better maps and routes: OpenRouteService key (free, optional but recommended)
1. Sign up at [openrouteservice.org](https://openrouteservice.org/dev/#/signup). No credit card is needed.
2. Copy your API key → in the app go to **Settings → OpenRouteService API key** → Save.

With the key you get real driving routes (drawn on the map), drive times, and faster address lookups. The free plan allows about 2,000 address lookups and 500 route optimizations per day.
Without a key, address lookups use OpenStreetMap's free service (one per second, which is fine for hundreds of businesses) and routes are estimated from straight-line distance.

## Run it on your computer

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. To use your Supabase database locally, copy `.env.example` to `.env.local` and fill in the two values.

Other commands: `npm test` (unit tests), `npm run build` (production build into `dist/`).

## Tips

- **Getting lists from ChatGPT / Claude:** Import → Paste a table has a ready-made prompt to copy. AI lists often include closed or made-up businesses. Import them anyway, then rule them out as you verify them.
- **Google Drive spreadsheets:** either share the Sheet as "Anyone with the link → Viewer" and paste the link, or use File → Download → .xlsx and upload the file.
- **Postcard campaign:** Businesses → filter → Select all → **Export mailing list** (send it to your print service) → **Log activity → Postcard** with a campaign name. Every recipient is logged at once.
- **Back up** now and then: Settings → Download backup.

## How it's built

- React + TypeScript + Vite. It's a static single-page app, so there's no server to maintain.
- Supabase (Postgres + auth) stores the data. Without Supabase settings, the app falls back to browser storage (`src/lib/backend.ts`).
- Leaflet + OpenStreetMap draw the maps. OpenRouteService handles geocoding and route optimization (VROOM), with Nominatim and a built-in cheapest-insertion + 2-opt optimizer as the no-key fallback (`src/lib/routing.ts`).
- Google Maps links handle turn-by-turn navigation. Long routes are split into legs of up to 9 waypoints, which is Google's limit per link.

| Path | What's there |
|---|---|
| `src/lib/types.ts` | Data model, stages, activity types and outcomes, rule-out reasons |
| `src/lib/store.tsx` | In-memory data store, save logic, background geocoder |
| `src/lib/importer.ts` | File, paste and Google Sheet parsing, column guessing, duplicate detection |
| `src/lib/routing.ts` / `geo.ts` | Route eligibility, stop selection, optimization, map links |
| `src/pages/*` | Screens |
| `supabase/schema.sql` | Database tables and security rules |

## Ideas for later

- Document uploads (NDAs, P&Ls) per business
- Automatic outreach sequences (postcard → letter → call → knock)
- Owner lookup from state business registries and county property records
- Deal scoring and valuation worksheet
- Send postcards directly through Lob's API
