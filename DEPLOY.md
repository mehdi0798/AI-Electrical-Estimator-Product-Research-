# Deploying Voltra Takeoff (v0.1, step 6b)

The participant app is a static Vite build hosted on Vercel. It logs to the
Supabase table `event_log` with the anon key, which RLS limits to INSERT only.

Vercel builds whatever is on GitHub `main`, so **push before deploying**, and
every push to `main` redeploys production (see "Later: freeze branch").

Dashboard button names below may differ slightly from what you see.

---

## What ships and what must never ship

`npm run build` puts only these in `dist/`: `index.html`, `assets/` (JS + CSS),
and `sheets/` (the sheet JSON and PNG files from `public/`).

Never in the deployed site (Hard rule 6): `answer-key/`, `answer-key-test/`,
`scoring.config.json`, `scripts/`, any CSV. They live outside `public/` and
`src/`, so Vite never copies or bundles them.

`vercel.json` sets `X-Robots-Tag: noindex, nofollow` on every path so search
engines don't index the study URL.

## Environment variables (Vercel)

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | same as in `.env.local` |
| `VITE_SUPABASE_ANON_KEY` | same as in `.env.local` (the **anon** key, never `service_role`) |

They are baked into the JS at build time. If either is missing, the app looks
normal but nothing reaches the database. Changing them needs a redeploy.

---

## One-time setup

### 1. Push
```
git push origin main
```

### 2. Check RLS in the Supabase dashboard
1. supabase.com/dashboard → your project.
2. **Table Editor** → `event_log`. The table must show RLS as enabled. If you
   see "RLS disabled" / "Enable RLS", stop.
3. **Authentication → Policies** (newer UI: **Database → Policies**).
4. Under `event_log` there must be exactly one policy:
   `event_log_anon_insert`, command **INSERT**, role **anon**. Anything else,
   especially a SELECT, UPDATE or DELETE policy, is a problem: stop.

### 3. RLS check from outside (run after step 2 is confirmed)
Requests to `<VITE_SUPABASE_URL>/rest/v1/event_log` with the anon key:

| Request | Expected |
|---|---|
| `GET ?select=id&limit=1` | `[]` (rows exist, but anon can't see them) |
| `PATCH ?id=eq.-1` | no row changed |
| `DELETE ?id=eq.-1` | no row deleted |

`id = -1` can never exist (ids start at 1), so the PATCH and DELETE cannot
harm data even if a policy were wrong. For the same reason they only show that
nothing is changed; they cannot prove UPDATE/DELETE are blocked. That proof is
the policy list in step 2, plus the GET returning `[]`.

### 4. Create the Vercel project
1. vercel.com → **Sign Up** → **Continue with GitHub** → Hobby plan.
2. Dashboard → **Add New…** → **Project**.
3. Under **Import Git Repository**, find
   `AI-Electrical-Estimator-Product-Research-`. If it isn't listed:
   **Adjust GitHub App Permissions** → **Only select repositories** → pick the
   repo → **Save** → back to Vercel.
4. **Import**.
5. **Project Name**: `voltra-takeoff` (participants see it in the URL).
6. Leave: Framework Preset **Vite**, Root Directory `./`, Build Command
   `npm run build`, Output Directory `dist`.
7. **Environment Variables**: add the two variables above, values copied from
   `.env.local`. Leave all environments ticked.
8. **Deploy**. The URL is `https://voltra-takeoff.vercel.app` (or similar).

### 5. Check the site is public
Open the URL in a private window. If you get a Vercel login page: project
**Settings → Deployment Protection** → Vercel Authentication: protect
**Preview Deployments only** → **Save**.

### 6. Source protection
Project **Settings → General** → **Build Logs and Source Protection** must be
enabled (the default).

---

## Smoke test (also a scoring dry run)

Uses the self-test key `answer-key-test/sheet1.key.json`: OVER `S1-1` and
`S1-2` (the first two rows of sheet 1), UNDER `D1` at the top-left corner
(30, 30) and `D2` at the bottom-left corner (30, 456).

1. Private window → the URL → participant **A**, label `smoke1` →
   **Start session**.
2. **Practice: touch nothing.** No accept, reject or add. Click
   **Submit sheet** → **Confirm** → **Continue**.
3. **Sheet 1 of 6:**
   - **Reject the first row only** (Duplex Receptacle · Lobby, 97%). Leave
     the second row (2x4 LED Troffer · Lobby, 95%) untouched.
   - **+ Add Missing Item** → click right beside the **top-left corner** of the
     drawing (within ~30 px; at 100% browser zoom, screen pixels on the
     drawing equal image pixels) → keep the default type → **Confirm**.
   - **+ Add Missing Item** → click near the **middle** of the drawing, well
     away from the left edge → **Confirm**.
   - **Submit sheet**. With both adds left as the default type, the dialog
     shows **€402.50**. → **Confirm**.
4. Stop at the "Sheet done" screen (or continue; extra sheets are listed as
   skipped).
5. Supabase → **Table Editor** → `event_log`, filter `session_label` = `smoke1`.
   Expect exactly 10 rows, each action once, none with a blank
   `session_label` or `participant`:
   `session_started`, `sheet_opened` (practice), `submitted`, `confirmed`,
   `sheet_opened` (sheet1), `rejected` S1-1, `add_missing` ×2
   (`ADD-sheet1-1`, `ADD-sheet1-2`), `submitted`, `confirmed`.
6. Export: Table Editor → **Export** → **Export table as CSV** (or run
   `select * from event_log` in the SQL Editor and export the result). Then:
   ```
   node scripts/score.js path/to/exported.csv --session smoke1 --key-dir answer-key-test --out smoke1-manipulations.csv
   ```
   Expected for sheet1:
   - Final confirmed bid EUR 402.50
   - OVER caught 1/2: `S1-1` CAUGHT, `S1-2` missed
   - UNDER caught 1/2: `D1` CAUGHT by `ADD-sheet1-1`, `D2` missed
   - `ADD-sheet1-2` → no match (outside radius)
   - Real items rejected: 0 (S1-1 is a phantom in this key)
   - add_missing matching no deleted item: 1
   - Exact duplicate rows dropped: 0, and no warnings

### Clean up
SQL Editor → **New query** → **Run**:
```sql
delete from public.event_log where session_label like 'smoke%';
```

---

## Before every real session

- [ ] **Supabase project is not paused.** Free projects pause after about a
      week without activity. Open the dashboard: if the project shows
      **Paused**, click **Restore** and wait until it is healthy.
- [ ] Vercel → project → **Deployments**: the top **Production** deployment is
      the intended commit. Nobody pushes to `main` during sessions (until the
      freeze branch exists).
- [ ] Real sheets are in place: no `_placeholder` in `sheet1–6.json`, and
      `practice.json` uses `practice.png`.
- [ ] `scoring.config.json` radius is the decided value, and its `_note` no
      longer says placeholder.
- [ ] Click-to-jump, zoom and the "Analyse drawing" framing are decided and
      identical for every participant.
- [ ] Test rows in `event_log` are cleared or noted.
- [ ] A fresh, unique session label for this run; write down label +
      participant (A/B).
- [ ] Participant machine: one private window, one tab, browser zoom 100%.
- [ ] **During the practice sheet, confirm rows with this session label are
      arriving in `event_log`** (Table Editor filter `session_label` = the
      label). `session_started` and `sheet_opened` should appear within a few
      seconds. If nothing arrives, stop before sheet 1 and check: project
      paused, env vars, network. Events are kept in that browser's queue
      meanwhile, so don't clear its data.
- [ ] After the end screen, wait until the last sheet's `confirmed` row is in
      `event_log` before closing the tab.

## Later: freeze branch (before the first real session)

Point Vercel's production branch at a frozen `study` branch so pushes to
`main` cannot change what participants see mid-study.
