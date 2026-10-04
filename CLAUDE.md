# Project brief for Claude Code

## Current status (4 Oct 2026)
- Branch `v0.2`. Steps 1–7 DONE and committed: real sheets in, name + type,
  catalog and prices, click-to-jump, edit, errors planted, answer keys
  written, scoring RADIUS locked at 30.
- End-to-end test on sheet 1 PASSED: app logged to Supabase, CSV exported,
  `score.js` scored it correctly.
- NOW: v0.3, the drawing viewer and the legend. Next: step 8 below.
- The practice sheet (old step 8) is now step 14. It comes last so the
  participant practises on the final interface.

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
   never screen pixels, at any window size, scroll or ZOOM level. Every
   conversion goes through one shared function, never ad-hoc math.
8. Every participant sees the same build: same flags, same sheets, same
   design. Every sheet opens the same way: fit to width, legend open.
   Nothing changes between the first and last real session.

## Tech
- React + Vite, Supabase (table `event_log`), Vercel. Repo stays PRIVATE.
- Row Level Security: the anon key may INSERT into `event_log` only
  (no SELECT, UPDATE or DELETE).
- `main` is the live site: every push to main redeploys production.
  Work on `v0.3` only (steps 8–14). Never commit to `v0.2`. Never push `main`.

---

## What exists (on v0.2)
Start screen (participant A or B, session label; practice first, then
A = 1→6, B = 6→1) → review screen → confirm dialog → between sheets → end.
Review screen: drawing on the left in a scrollable box at NATIVE size, full
list on the right (name, type, confidence %, unit price, accept / reject /
edit), Add missing item (click drawing, pick type then name, dot + a row in
"Your Additions"), live bid total in €.
Click a row: the drawing scrolls to that item and boxes it (Hard rule 3).
Logging: localStorage queue, retried until Supabase confirms; the UI never
waits on the network; events without participant or session label are
quarantined, never sent, never deleted.
Scoring: `scripts/score.js` on a CSV export of `event_log`.
Validation: `npm run validate` (exits 1 only because practice is missing).

### The problem v0.3 fixes
Today each sheet shows at native size, so each one looks different: sheet 1
fits, sheet 3 (2019 px wide) forces sideways scrolling, sheet 6 is tall.
This looks unprofessional. There is also no legend, so the participant
cannot check what a symbol means.

---

## CURRENT SCOPE: v0.3 — viewer and legend

### The two goals
1. Every drawing fits the width of its pane when it opens, the same way for
   all sheets, and the participant can zoom in and out and pan, like a
   professional takeoff tool (reference: BuildVision / similar tools — a
   bottom toolbar with  −  [ 92% ]  +  and a "Fit width" button).
2. One combined legend image, shown in a panel BELOW the drawing, so the
   participant can look up a symbol while reading the drawing.

### Decisions already made
- Zoom % means: 100% = one image pixel per screen pixel. The toolbar shows
  the real %, so "fit width" reads e.g. 52% on sheet 3 and 95% on sheet 1.
- Every sheet opens at FIT WIDTH: zoom = pane inner width / image
  naturalWidth. No horizontal scrollbar at fit. A tall sheet (6) scrolls
  vertically at fit. That is normal.
- Zoom range 25% to 400%. Buttons step by ×1.25. Ctrl + wheel (and trackpad
  pinch) zooms around the mouse pointer. Plain wheel scrolls.
- Pan: scrollbars, plus click-and-drag on the drawing (grab cursor). In
  Add-missing mode a click places the item instead of panning.
- Rendering: the <img> gets width = naturalWidth × zoom. Do NOT use a CSS
  transform on the scroll container (it breaks scroll sizes and click math).
  Boxes and dots are placed at (x × zoom, y × zoom) and resize with zoom.
- Window resize: if the participant has not zoomed yet, refit to width;
  once they have zoomed, keep their zoom.
- Opening a new sheet always resets to fit width (Hard rule 8).
- Click-to-jump keeps the current zoom and centres the symbol in the pane.
- One reusable component (`ZoomableImage`) is used for BOTH the drawing and
  the legend. Same toolbar, same behaviour. Only the drawing allows
  click-to-jump boxes, dots and Add missing.
- Legend panel: under the drawing, in the left column, open by default,
  collapsible with one header button ("Legend ▾"). The drawing keeps most
  of the height (legend about one third when open).
- The legend is one image, the same for all sheets. It is built once by a
  local script and shipped as `public/legend.png`.
- `zoom` flag is now ON (decided).

### Build order (I trigger one step at a time)

**Step 8 — Zoomable viewer for the drawing.**
- Build `ZoomableImage` and use it for the drawing pane.
- Fit width on open, toolbar ( − , %, + , Fit width ), ctrl+wheel zoom
  around the pointer, drag to pan, refit on resize until first zoom.
- Done when: all six sheets open filling the pane width with no sideways
  scrollbar, at 1366×768 and 1920×1080 window sizes; zoom in/out and
  Fit width work on every sheet.

**Step 9 — Click-to-jump and Add missing at any zoom.**
- One shared function converts screen ↔ image pixels (Hard rule 7).
- Done when, on sheets 3 and 6, at Fit width, 100% and 200%:
  - clicking any row centres and boxes the right symbol;
  - an Add missing placed on a known symbol logs x,y within 3 px of that
    symbol's baseline x,y.
  Write a small automated test for the conversion function too.

**Step 10 — Log zoom and pan.**
- `zoom_changed`: old_value and new_value = zoom % (integer), plus how
  (button, wheel, fit). One event per change; a wheel gesture logs ONCE
  when it ends (debounce ~300 ms), not once per wheel tick.
- `panned`: one event per drag or scroll gesture when it ends; x,y = the
  centre of the visible area in image pixels.
- Done when: each gesture produces exactly one event in the log.

**Step 11 — Build the combined legend image (local script).**
- I put the two legend screenshots in `handoff/legend/`
  (`legend-1.webp` = lighting/equipment, `legend-2.webp` = ELECTRICAL LEGEND).
- Script `scripts/build-legend` crops each one, then stacks them
  vertically into ONE image: ELECTRICAL LEGEND on top, the other below,
  same width, white background, a thin gap between.
- Crops must remove: the dark bar at the top, the window frame lines, and
  the "Activate Windows" watermark text at the right edge. Never resize
  the content. If a crop would cut a symbol or a description, stop and
  tell me.
- Output `public/legend.png` (lossless PNG).
- Done when: I open `public/legend.png` and approve it by eye.

**Step 12 — Legend panel below the drawing.**
- Uses `ZoomableImage` with `public/legend.png`: fit width, zoom, scroll.
- Open by default, collapsible. No boxes, no dots, no Add missing on it.
- Log `legend_toggled` with new_value `open` or `closed`. Legend zoom and
  scroll are NOT logged.
- Done when: on a 1366×768 window the drawing still gets about two thirds
  of the left column with the legend open, and the full drawing height
  with it closed.

**Step 13 — Re-test end to end.**
- Same test as before on sheet 1, but zoom in and out during the session.
- Done when: CSV exported, `score.js` scores it correctly, the zoom /
  pan / legend events are in the export, and `npm run validate` passes
  every check except the missing practice sheet.

**Step 14 — Practice sheet.**
- I supply in `handoff/`: one PNG (same drawing scale as the six sheets)
  and its list in the same CSV format as `handoff/baseline_lists/sheetN.items.csv`,
  one row per physical symbol, every name already in `handoff/catalog.csv`,
  every x,y in original image pixels. I tell you the file names and the count.
- Copy the PNG byte for byte to `public/sheets/practice.png`. Import the
  list with the same checks as step 1.
- No planted errors, no answer key. Same confidence rule and same row look
  as sheets 1–6. Events logged with `sheet = practice`, never scored.
- Done when: `npm run validate` exits 0.

---

## The sheets
| sheet | items | image (px) |
|---|---|---|
| 1 | 52 | 1100 × 433 |
| 2 | 45 | 1100 × 542 |
| 3 | 55 | 2019 × 719 |
| 4 | 54 | 1100 × 683 |
| 5 | 59 | 1302 × 706 |
| 6 | 47 | 1100 × 1148 |

Images are never resized or re-encoded. Fitting is done on screen only.

## Item model (from v0.2, unchanged)
- NO rooms. One row = one physical symbol. Never "type ×N".
- NAME = the tag printed next to the symbol (E2, D8, H), else the legend
  name. TYPE = one of nine families: Light fixture, Track light head,
  Exit sign, Ceiling fan, Receptacle, Switch, Sensor, Junction box,
  Panelboard. Each name belongs to one type. Price is set per name.
- The item lists are final.

## Data layout
```
handoff/                        images, lists, catalog, legend. Source only. Never shipped.
handoff/legend/legend-1.webp, legend-2.webp
public/legend.png               built by scripts/build-legend
public/sheets/practice.json, practice.png
public/sheets/sheet1.json ... sheet6.json, sheet1.png ... sheet6.png
    { "id", "name", "image", "items": [
        { "id", "name", "type", "x", "y", "confidence", "unit_price" } ] }
src/config/catalog.json         [ { "name", "type", "unit_price" } ]
src/config/features.json        feature flags (see below)
baseline/sheetN.baseline.json   # NOT in public/ or src/. Full truth.
answer-key/sheetN.key.json      # NOT in public/ or src/.
    { "manipulations": [ { "id", "direction": "UNDER"|"OVER",
                           "x", "y", "cost", "pair_id" } ] }
scoring.config.json             RADIUS = 30, locked
```

## Logging
Table `event_log`: `id, session_label, participant, sheet, action, item_id,
x, y, old_value, new_value, client_ts, server_ts`.

Actions: `session_started, sheet_opened, row_clicked, accepted, rejected,
edited, add_missing, add_removed, submitted, confirmed, cancelled,
zoom_changed, panned, legend_toggled`.
Flag-gated: `session_resumed, session_discarded, analysis_started,
analysis_completed`.
Each action logs exactly once. Added items get ids `ADD-<sheet>-<n>`, never
reused. A row's status can be changed again; every change logs `old_value`
and `new_value`. All x,y in image pixels.

## Scoring (`scripts/score.js`, run locally) — unchanged
- OVER caught = the phantom's final state is rejected. A phantom that was
  edited but not rejected is NOT caught.
- UNDER caught = an `add_missing` (not later removed) within RADIUS image
  pixels of the deleted item's x,y. One add matches at most one deletion.
  The name chosen for the added item does not matter.
- Also reported: final confirmed bid, real items rejected, real items edited,
  adds matching no deletion. Exact duplicate rows are dropped and counted.
- Zoom, pan and legend events are never scored; they are kept for analysis.
- Output: one row per manipulation (participant, session, sheet, id,
  direction, pair_id, cost, caught).

## Feature flags (`src/config/features.json`)
| Flag | Study setting |
|---|---|
| `clickToJump` | ON (decided) |
| `zoom` | ON (decided) |
| `resume` | undecided |
| `analyseAnimation` | undecided |

## Decide BEFORE the first real session
- `resume`, `analyseAnimation`: on or off.
- Supervisor sign-off: the design, fit-width + zoom viewer, legend panel,
  track heads as rows, and how the lists were verified.
- Freeze: point Vercel production at a frozen study branch.
- Clear test rows from `event_log`.

## DEFERRED — do NOT build until I explicitly ask
- Admin page. (It would put the answer key online; scoring stays local.)
- Any redesign beyond v0.3.

## How to work with me
- Build ONE step at a time. Do only the step I ask for.
- Before writing code for a step, propose a short plan and wait for approval.
- After a step works and I confirm, commit on `v0.3` with a clear message.
- Show me any change to this file before making it.
- Keep it simple. This is a study instrument, not a commercial product.
- If something conflicts with a Hard rule, stop and tell me.
