# Project brief for Claude Code

## Current status
- v0.1 DONE and live (Vercel project `voltra-ai`). Live check passed: the live
  site writes to `event_log`.
- Branch `overnight` merged into main, all flags off, then `clickToJump` on.
- The live site (main) still shows the v0.1 placeholder sheets. Their x,y lie
  off the drawings, so click-to-jump boxes only a few rows.
- The six real sheets are cropped and counted; positions are final. Some
  names are still to confirm (end of `handoff/README.md`). Source: `handoff/`.
- v0.2 is built on branch `v0.2`. Nothing goes to main until step 7 validates.
- The old placeholder PNGs in `Experiment Design/Sheets/` are removed.
- NOW: v0.2, real sheets. Next: step 3 below.

## What this is
A web app for a research study on automation bias in electrical cost estimating
(capstone, HUGS 2027 workshop at ICSE). Professional estimators review an
AI-style "takeoff" of electrical drawings. The output is NOT produced by a real
AI: it is a pre-authored list with a few errors planted by the researcher
(Wizard-of-Oz). The tool must feel like a real, professional estimating tool,
and it must log everything the participant does so it can be scored later.

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
6. The participant app must NEVER read, import, or ship the answer key, the
   baseline files, or the `handoff/` folder (they contain the deleted items).
   They live outside `public/` and `src/` and are read only by local scripts.
7. All x,y values are in ORIGINAL IMAGE PIXELS (naturalWidth/naturalHeight),
   never screen pixels, at any window size, scroll or zoom level.
8. Every participant sees the same build: same flags, same sheets, same
   design. Nothing changes between the first and last real session.

## Tech
- React + Vite, Supabase (table `event_log`), Vercel. Repo stays PRIVATE.
- Row Level Security: the anon key may INSERT into `event_log` only
  (no SELECT, UPDATE or DELETE).
- `main` is the live site: every push to main redeploys production.
  v0.2 work stays on branch `v0.2`; never push it to main before step 7.

---

## What exists (on main)
Start screen (participant A or B, session label; practice first, then
A = 1→6, B = 6→1) → review screen → confirm dialog → between sheets → end.
Practice has NO planted errors; its events are logged with `sheet = practice`
and never scored.
Review screen: drawing on the left at native size in a scrollable box, full
list on the right, accept / reject per row, Add missing item (click drawing,
pick what it is, dot + a row in "Your Additions" with an "Added" badge,
removable), live bid total in € (sum of unit_price over every row not
rejected, added items included).
Click a row: the drawing scrolls to that item and boxes it (Hard rule 3),
if its x,y lies inside the image.
Step 2 done: items carry `name` and `type`; the placeholder lists use
`type = Placeholder` and the Add dialog picks a name from `item_types.json`
until step 3.
Logging: localStorage queue, retried until Supabase confirms; the UI never
waits on the network; events without participant or session label are
quarantined, never sent, never deleted.
Scoring: `scripts/score.js` on a CSV export of `event_log`.
Tools: `npm test`; `npm run validate` (sheets against answer keys, used in
step 7). Also on main: the design pass, and code for `resume`,
`analyseAnimation` and `zoom` (flags off).

---

## CURRENT SCOPE: v0.2 — real sheets

### The five goals
1. The six real sheets are in the tool, each with its own correct list.
2. Clicking a row jumps to the right symbol on the drawing.
3. No rooms. Every item stands on its own.
4. Every item has a NAME and a TYPE.
5. The participant can change an item's name or type.

### Decisions already made
- NO rooms. A row is identified by its position on the drawing.
- One row = one physical symbol. Never "type ×N": grouping would turn OVER
  and UNDER into one "is the count right?" check and erase the asymmetry
  being studied.
- NAME = what the drawing calls the item. It is the tag printed next to the
  symbol (E2, D8, H). When the drawing prints no tag, it is the legend name
  (Duplex receptacle, Junction box).
- TYPE = the family the name belongs to. There are nine: Light fixture,
  Track light head, Exit sign, Ceiling fan, Receptacle, Switch, Sensor,
  Junction box, Panelboard.
- Each name belongs to exactly one type. The full list is `handoff/catalog.csv`
  (38 names). The price is set per name.
- A row shows: name, type, confidence %, unit price, actions.
- The item lists are final. They were counted by eye and by symbol matching,
  then checked by me by eye and by a second agent. There is no click helper.
- All sheets are at the same drawing scale, and the drawing scrolls. Whether
  a sheet scrolls depends on the screen: in a 1920×1080 browser only sheet 3
  scrolls sideways and only sheet 6 scrolls down; on a 1366×768 laptop all
  six scroll.

### The sheets
| sheet | items | image (px) |
|---|---|---|
| 1 | 52 | 1100 × 433 |
| 2 | 45 | 1100 × 542 |
| 3 | 55 | 2019 × 719 |
| 4 | 54 | 1100 × 683 |
| 5 | 59 | 1302 × 706 |
| 6 | 47 | 1100 × 1148 |

### Build order (I trigger one step at a time)

**Step 1 — Bring in the sheets and their lists.**
Read `handoff/README.md` first.
- Copy the six PNGs to `public/sheets/`, byte for byte. Never resize or
  re-encode them.
- Write a local import script. It turns each `handoff/baseline_lists/sheetN.items.csv`
  into `baseline/sheetN.baseline.json` and stores the image size and sha256.
- Done when: counts match the table above, and every x,y is inside its image.
- Until step 8, `practice.json` still points at `sheet1.png`, so practice
  shows the real sheet 1. Branch only.

**Step 2 — New item format: name and type, no room.**
- Remove `room` everywhere: item format, the row, the list header, the Add
  missing dialog, `scripts/validate-lib.js` and its tests. (Room was never
  logged.)
- Every item carries `name` and `type`.
- Done when: tests pass and nothing in the app mentions a room.

**Step 3 — The catalog and the prices.**
- `src/config/catalog.json` holds every name with its type and unit price.
  It replaces `item_types.json`.
- Prices come from `handoff/catalog.csv`. They are final: use them as given,
  never invent one.
- Done when: every name used in a baseline exists in the catalog.

**Step 4 — Show the real sheets in the tool (no errors planted yet).**
- A local script builds `public/sheets/sheetN.json` from the baseline.
- Confidence comes from one fixed, seeded rule, identical for all sheets.
- Branch `v0.2` only. Never push these unplanted sheets to main.
- Done when: each sheet opens with its real drawing and its full list.

**Step 5 — Click-to-jump on the real sheets.**
- Clicking any row scrolls the drawing so the symbol is in view, and boxes it.
- It must work when the drawing is wider or taller than the pane
  (sheets 3, 5, 6), at any scroll position.
- Done when: I have clicked through each sheet and every box sits on its symbol.

**Step 6 — Edit action.**
- On a row, the participant can change the item: pick a type, then a name
  from that type. The price follows the name.
- The Add missing dialog uses the same picker.
- Logged as `edited` with old and new value. Each edit logs once.
- Scoring: an edited phantom that is not rejected is still NOT caught.
  `score.js` also reports real items edited (see Scoring).

**Step 7 — Plant the errors.**
- Input: a baseline plus my choice of 2 UNDER (baseline ids) and 2 OVER
  (name, x, y), cost-matched by `pair_id`. Output: `public/sheets/sheetN.json`
  and `answer-key/sheetN.key.json`.
- Ids are generated AFTER planting, so nothing hints at a deletion.
- Phantoms land mid-list, inside the real rows' confidence range.
- Finish by running `npm run validate`; it must pass.

**Step 8 — Practice sheet.**
- I supply one more image and list. No planted errors.

---

## Data layout
```
handoff/                        images, lists, catalog. Source only. Never shipped.
public/sheets/practice.json, practice.png
public/sheets/sheet1.json ... sheet6.json, sheet1.png ... sheet6.png
    { "id", "name", "image", "items": [
        { "id", "name", "type", "x", "y", "confidence", "unit_price" } ] }
src/config/catalog.json         [ { "name", "type", "unit_price" } ]
src/config/features.json        feature flags (see below)
baseline/sheetN.baseline.json   # NOT in public/ or src/. Full truth.
    { "sheet", "image", "image_size", "image_sha256", "items": [
        { "id", "name", "type", "description", "label", "where",
          "x", "y", "status" } ] }
answer-key/sheetN.key.json      # NOT in public/ or src/.
    { "manipulations": [ { "id", "direction": "UNDER"|"OVER",
                           "x", "y", "cost", "pair_id" } ] }
scoring.config.json             RADIUS, locked before the first session
```

## Logging
Table `event_log`: `id, session_label, participant, sheet, action, item_id,
x, y, old_value, new_value, client_ts, server_ts`.

Actions: `session_started, sheet_opened, row_clicked, accepted, rejected,
edited, add_missing, add_removed, submitted, confirmed, cancelled`.
Flag-gated: `session_resumed, session_discarded, analysis_started,
analysis_completed, zoom_changed, panned`.
Each action logs exactly once. Added items get ids `ADD-<sheet>-<n>`, never
reused. A row's status can be changed again; every change logs `old_value`
and `new_value`.

## Scoring (`scripts/score.js`, run locally)
- OVER caught = the phantom's final state is rejected. A phantom that was
  edited but not rejected is NOT caught.
- UNDER caught = an `add_missing` (not later removed) within RADIUS image
  pixels of the deleted item's x,y. One add matches at most one deletion.
  The name chosen for the added item does not matter.
- Also reported: final confirmed bid, real items rejected, real items edited,
  adds matching no deletion. Exact duplicate rows are dropped and counted.
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
- Names still to confirm (listed at the end of `handoff/README.md`). A wrong
  name in the list would look like an error I did not plant.
- Phantom placement rule (awaiting supervisor). Working default: a phantom's
  x,y sits on a plausible spot where no such item exists (a gap in a run of
  items, or a look-alike mark). Never on blank margin. Never on the exact
  position of another listed item. Same rule for all 12 phantoms.
- Deletion choice (awaiting supervisor). Working default: do not delete an
  item that sits right next to an unlabelled mark, because an add placed on
  that mark could be scored as a catch.
- Scoring RADIUS, set from the real symbol spacing. Some symbols sit only
  about 18 px apart (the outlet pairs on sheets 3 and 6).
- `resume`, `analyseAnimation`, `zoom`: on or off.
- Same screen size, browser window and zoom for every session: what fits
  without scrolling changes what participants see.
- Supervisor sign-off: the design, scrolling sheets, track heads as rows,
  and how the lists were verified.
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
