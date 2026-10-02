# Project brief for Claude Code

## Current status
- v0.1 DONE and deployed (Vercel project `voltra-ai`). Scoring self-tested.
  Live check passed: the live site writes to `event_log`.
- Branch `overnight` (validator, resume, analyse animation, click-to-jump,
  zoom, design pass) merged into main with all flags OFF, then `clickToJump`
  turned ON.
- NOW: v0.2, real sheets. Step 0 DONE. Next: v0.2 step 1.

## What this is
A web app for a research study on automation bias in electrical cost estimating
(capstone, HUGS 2027 workshop at ICSE). Professional estimators review an
AI-style "takeoff" of electrical drawings. The output is NOT produced by a real
AI: it is a pre-authored list with some errors planted by the researcher
(Wizard-of-Oz). The tool must feel like a real AI estimating tool, and it must
log everything the participant does so the researcher can score it later.

The study measures one thing: whether estimators catch DELETED items (on the
drawing but missing from the list, "UNDER") less often than ADDED items
(phantom rows not on the drawing, "OVER").

## Hard rules — never break these
These protect the experiment. Breaking one invalidates the results.
1. Deleted items (UNDER) simply have NO row in the list. Nothing on screen may
   hint that an item is missing. Item ids must show no gap.
2. Added items (OVER, "phantoms") must look EXACTLY like real rows: same
   confidence range, same styling, never the last row.
3. The drawing shows a box ONLY on the row the participant clicked. Never more
   than one box, never boxes on all items. The only other markers allowed are
   dots for items the participant added themselves.
4. The list is sorted by confidence, highest first, and shown IN FULL in a
   scrollable panel. No truncation, no paging, no grouping.
5. Log every action with a timestamp. Never lose a log event. The log is the
   only source of scoring.
6. The participant app must NEVER read, import, or ship the answer key OR the
   baseline files (baselines contain the deleted items). Both live outside
   `public/` and `src/` and are read only by local scripts.
7. All x,y values are in ORIGINAL IMAGE PIXELS (naturalWidth/naturalHeight),
   never screen pixels, at any window size, scroll or zoom level.
8. Every participant sees the same build: same flags, same sheets, same
   design. Nothing changes between the first and last real session.

## Tech
- React + Vite, Supabase (table `event_log`), Vercel. Repo stays PRIVATE.
- Row Level Security: the anon key may INSERT into `event_log` only
  (no SELECT, UPDATE or DELETE).
- `main` is the live site: every push to main redeploys production.

---

## What exists (v0.1, on main)
Start screen (participant A or B, session label; practice first, then
A = 1→6, B = 6→1) → review screen → confirm dialog → between sheets → end.
Practice has NO planted errors; its events are logged with
`sheet = practice` and never scored.
Review screen: drawing left at native size in a scrollable box, full list
right, accept / reject per row, Add missing item (click drawing, pick type,
dot + a row under "Your Additions" with an "Added" badge, removable), live
bid total in € (sum of unit_price over every row not rejected, added items
included).
Logging: localStorage queue, retried until Supabase confirms; the UI never
waits on the network; events without participant or session label are
quarantined, never sent, never deleted.
Scoring: `scripts/score.js` on a CSV export of `event_log`.

---

## CURRENT SCOPE: v0.2 — real sheets (on main)
Goal: six real sheets plus a practice sheet, each presentable, each with
40–60 verified items and 4 planted errors (2 UNDER + 2 OVER, cost-matched).

All six sheets come from ONE plan set. Zones and draft counts are in
`SHEETS.md` (repo root). Draft counts are not yet verified.

### Decisions already made
- NO rooms. Each sheet is one area. A row is identified by its position on
  the drawing, not by a room name.
- One row = one physical symbol. Never "type ×N": grouping would turn OVER
  and UNDER into one "is the count right?" check and erase the asymmetry
  being studied.
- Click-to-jump is ON for the study. It is how a row maps to a symbol: click
  a row, the drawing scrolls to it and boxes it (Hard rule 3). Without it,
  same-type rows are indistinguishable and a phantom cannot be scored.
- Row shows: type code and name, confidence %, unit price, actions.

### Build order (I trigger one step at a time)
0. Merge `overnight` into main with ALL flags OFF. This brings the validator,
   click-to-jump and the design pass. Confirm tests and build pass and that
   behaviour with flags off is unchanged. Then set `clickToJump` to true.
1. Authoring helper, local only (`npm run author`), never in the participant
   build. Load a sheet image; choose a type (list editable); each click drops
   one marker; the type stays selected for repeated clicks; live count per
   type and total; click a marker to delete it; undo; save and reload.
   Saves `baseline/sheetN.baseline.json`.
2. Images. I supply one cropped PNG per sheet plus one for practice. Check
   each is readable at 100% and fits the review screen; same scale for all;
   grey outside the zone where needed.
3. Remove `room` from the item format, the row, and the Add missing dialog.
4. Rate table: one unit price per type in `src/config/item_types.json`.
   I approve the prices.
5. Planting script. Input: a baseline plus my choice of 2 UNDER (baseline
   ids) and 2 OVER (type, x, y), cost-matched by `pair_id`. Output:
   `public/sheets/sheetN.json` and `answer-key/sheetN.key.json`.
   - Ids are generated AFTER planting, so nothing hints at a deletion.
   - Confidence comes from one fixed, seeded rule, identical for all sheets.
   - Phantoms land mid-list, inside the real rows' confidence range.
   - Finish by running `npm run validate`; it must pass.
6. Edit action: change a row's type; the price updates; logged as `edited`
   with old and new value.

### Baseline verification (my job, tracked in SHEETS.md)
Hand count with the helper → cross-check against the fixture or panel
schedule → cold recount one week later. The answer key is locked only after
all three agree.

---

## Data layout
```
public/sheets/practice.json, practice.png
public/sheets/sheet1.json ... sheet6.json, sheet1.png ... sheet6.png
    { "id", "name", "image", "items": [
        { "id", "type", "x", "y", "confidence", "unit_price" } ] }
src/config/item_types.json      [ { "type", "name", "unit_price" } ]
src/config/features.json        feature flags (see below)
baseline/sheetN.baseline.json   # NOT in public/ or src/. Full truth.
answer-key/sheetN.key.json      # NOT in public/ or src/.
    { "manipulations": [ { "id", "direction": "UNDER"|"OVER",
                           "x", "y", "cost", "pair_id" } ] }
scoring.config.json             RADIUS, locked before the first session
SHEETS.md                       zones, counts, verification status
```

## Logging
Table `event_log`: `id, session_label, participant, sheet, action, item_id,
x, y, old_value, new_value, client_ts, server_ts`.

Actions: `session_started, sheet_opened, row_clicked, accepted, rejected,
edited, add_missing, add_removed, submitted, confirmed, cancelled`.
Flag-gated: `session_resumed, session_discarded, analysis_started,
analysis_completed, zoom_changed, panned`.
Each action logs exactly once. Added items get ids `ADD-<sheet>-<n>`, never
reused.
A row's status can be changed again; every change logs `old_value` and
`new_value`.

## Scoring (`scripts/score.js`, run locally)
- OVER caught = the phantom's final state is rejected. A phantom that was
  edited but not rejected is NOT caught.
- UNDER caught = an `add_missing` (not later removed) within RADIUS image
  pixels of the deleted item's x,y. One add matches at most one deletion.
- Also reported: final confirmed bid, real items rejected, adds matching no
  deletion. Exact duplicate rows are dropped and counted.
- Output: one row per manipulation (participant, session, sheet, id,
  direction, pair_id, cost, caught).

## Feature flags (`src/config/features.json`)
| Flag | Study setting |
|---|---|
| `clickToJump` | ON (decided) |
| `resume` | undecided |
| `analyseAnimation` | undecided |
| `zoom` | undecided |

## Decide BEFORE the first real session
- Phantom placement rule (awaiting supervisor). Working default: a phantom's
  x,y sits on a plausible spot where no such fixture exists (a gap in a run
  of fixtures, or a look-alike mark). Never on blank margin. Never on the
  exact position of another listed item. Same rule for all 12 phantoms.
- `resume`, `analyseAnimation`, `zoom`: on or off.
- Scoring RADIUS, set from real symbol spacing once sheets are authored.
- Supervisor sign-off on the new design.
- Freeze: point Vercel production at a frozen study branch.
- Clear test rows from `event_log`.

## DEFERRED — do NOT build until I explicitly ask
- Admin page. (It would put the answer key online; scoring stays local.)
- Any redesign beyond the overnight design pass.

## How to work with me
- Build ONE step at a time. Do only the step I ask for.
- Before writing code for a step, propose a short plan and wait for approval.
- After a step works and I confirm, commit with a clear message.
- Show me any change to this file before making it.
- Keep it simple. This is a study instrument, not a commercial product.
- If something conflicts with a Hard rule, stop and tell me.
