# CLAUDE.md — Product v1 · Feature 1: All marks on (branch `product`)

## Status
- `main` and tag `study-v1` = the frozen study tool. The paper describes it. Never touch them.
- The full product plan (all features, build order) is in `docs/product/PLAN.md`. Read it only if I ask.
- NOW: **Feature 1 — All marks on** (flag `allMarks`). Current phase: **Phase 1**
  (update this line after each phase I confirm; show me the change first).

## Why this feature, and why first
In the study, 2 estimators rejected 12/12 phantom rows each and restored 0/12 missing items each.
The screen showed **one box at a time**, so they could not see what the AI had covered. All 4 items
they added landed on symbols that already had a row. Both asked, on their own, for the same thing:
- P2: "is there any option then I can see all the blue boxes, so that I will get an idea which part is missing?"
- P1: "if we have bounding box for each element … there is E2 and I can see there is no bounding box around E2"

**Goal of this feature:** every row has a mark on the drawing at the same time. A symbol with
**no mark** is a symbol the AI missed. This turns an invisible error into a visible one.

It is first because every later feature builds on it: zones ("every symbol in this zone has a mark"),
quick add (the "this symbol already has a row" check uses the marks), the finish panel and count check.

## Hard rules — never break these
1. Work only on branch `product`. Never commit or push to `main`, `fr`, `v0.2`, `v0.3`.
   Never move or delete tags `study-v1` and `study-v1-fr`.
2. Never change study data: `public/sheets/*`, `answer-key/`, `baseline/`, `handoff/`, `planting/`,
   `scoring.config.json`, and the scoring logic in `scripts/score.js`.
3. The app never reads `answer-key/`, `baseline/` or `handoff/`. Marks come ONLY from the sheet JSON
   rows and the user's own additions. **A missed item must have no mark.** The app must not know
   where missed items are.
4. All x,y are ORIGINAL IMAGE PIXELS. Every image↔screen conversion goes through `src/lib/geometry.js`.
   No ad-hoc math in components.
5. Log every user action once, with the existing `logEvent` (keeps the localStorage queue).
   Keep every existing action name and column. Logs go to `product_event_log`.
6. Everything new sits behind flag `allMarks` in `src/config/features.json`.
   `allMarks: false` = the app looks and logs exactly like `study-v1` (only the table name differs).
7. Never invent a price.

If a task conflicts with a hard rule: stop and tell me.

## What to build (the spec)
1. **All marks.** Every row of the current sheet gets a ring on the drawing at its x,y, at the same time.
   - Thin **ring**, not a filled box, so the symbol stays readable.
   - Diameter **24 image px**, never smaller than **16 screen px**. (Some symbols are 18 px apart on
     sheets 3 and 6; they must still show as two rings.)
2. **Colour by type** (the 9 types in `src/config/catalog.json`). **Status by line style + small icon**,
   so colour is never the only signal:
   | Status | Look |
   |---|---|
   | not decided | thin solid ring |
   | accepted | thicker solid ring + small ✓ |
   | rejected | grey dashed ring + small × (stays visible) |
   | added by the user | small diamond, one colour for all additions (replaces today's dot) |
   | selected row | the existing blue jump box, drawn on top |
3. **Type chips** above the drawing, with counts: `All · Light fixture 32 · Receptacle 22 …`.
   Choosing a chip shows only that type's marks **and** list rows. `All` shows everything.
4. **Marks switch** (button + key **M**) hides/shows all marks to see the bare drawing.
   M does nothing while the user is typing in an input.
5. **Mark ↔ row link.** Click a mark = select its row (list scrolls to it, jump box shows).
   Click a row = its mark is highlighted. Hover a mark: tooltip with name, type, confidence, status.

### New log actions (same columns as today)
| action | item_id | old_value | new_value |
|---|---|---|---|
| `marks_toggled` | | | `on` / `off` |
| `type_filter_changed` | | previous type or `all` | new type or `all` |
| `mark_clicked` | row id | | |

One event per user action: a mark click logs `mark_clicked` only (not also `row_clicked`).

## Architecture — how to build it
Today `src/App.jsx` is ~930 lines and holds the whole review screen. Do **not** refactor it.
Add the feature as small, separate pieces and touch `App.jsx` only to wire them in.

**1. Logic first, separated from the screen (pure JS, no React).**
- `src/lib/geometry.js` — add one function `ringCircle({ x, y, zoom, diameter, minScreen })`
  → `{ cx, cy, r }` in screen px. All mark positions use it (hard rule 4).
- `src/lib/marks.js` (new) — pure functions only:
  - `buildMarks({ items, statuses, additions, edits, byName })` → one mark per row and per addition:
    `{ id, x, y, kind: 'row' | 'added', name, type, confidence, status: 'undecided' | 'accepted' | 'rejected' }`.
    Use the existing `displayItem` from `edits.js` so renamed rows show their new name and type.
  - `typeCounts(marks)` → `[{ type, count }]` for the chips.
  - `filterByType(list, type)` → used for BOTH marks and list rows (one rule, two places).
  - `drawOrder(marks)` → rejected first, then undecided, accepted, added (selected box is drawn last by App).
- `src/config/markStyles.js` (new) — the type → colour table and the status → line style/icon table.
  All visual constants live here, nowhere else.

**2. Small components, presentational only.** Create `src/components/`:
- `MarksLayer.jsx` — receives `marks`, `zoom`, `selectedId`, `onMarkClick`; draws ONE `<svg>` overlay
  inside `ZoomableImage`'s `children(zoom)`. The svg has `pointer-events: none`; only rings take clicks.
  Wrap in `React.memo`; key each mark by its row id.
- `TypeChips.jsx` — receives `counts`, `value`, `onChange`. No logging inside.
- `MarksToggle.jsx` (or a button in the existing toolbar) — receives `on`, `onToggle`.

**3. One source of truth.** Marks are **derived** from the state that already exists
(`items`, `statuses`, `additions`, `edits`, `selectedId`) with `useMemo`. Do not copy that state.
Only two new pieces of state in the review screen: `marksOn` (boolean, default true) and
`typeFilter` (`'all'` or a type).

**4. Side effects in one place.** Components never call `logEvent`. App.jsx handlers do:
toggle → `marks_toggled`; chip → `type_filter_changed`; mark click → `mark_clicked` + the same
select-and-jump code the row click uses (extract that into one `selectRow(id, source)` function so
row click and mark click share it; `source` decides which event is logged).

**5. Flag at the edges.** Read `FEATURES.allMarks` once in App.jsx. When false: no layer, no chips,
no toggle, no M key, today's dots for additions. Nothing else changes.

**6. Design quality.**
- Palette: 9 colours that are distinct from each other and from the blue jump box, each with contrast
  ≥ 3:1 on white. Propose it in your plan (colour-blind safe, e.g. based on Okabe–Ito).
- Every ring has an `aria-label` ("E2-NL, Light fixture, accepted"). Chips are real buttons.
- Keep the study tool's calm look. Must work at 1366×768 and 1920×1080.
- Performance: up to ~70 marks per sheet; panning and zooming must stay smooth at 200%.

## Tests (plain Node, like the existing ones)
New file `scripts/marks.test.js`, added to the `npm test` chain in `package.json`:
- `ringCircle`: the centre lands on the item's x,y at zoom 0.5, 1 and 2 (±0.5 px); r never below 8 screen px.
- `buildMarks`: one mark per row and per addition; a rejected row keeps a mark with status `rejected`;
  a renamed row shows its new name and type.
- `typeCounts` adds up to the number of rows; `filterByType('all')` returns everything.
- Guard: no file in `src/` mentions `answer-key`, `baseline/` or `handoff` (hard rule 3).

## Phases — I trigger one at a time. Before each: a plan (max 8 bullets), then wait for my OK.
- **Phase 0 — Check the ground.** Confirm: on branch `product`; flags exist in `features.json`;
  the logger writes to `product_event_log`. If any is missing, stop and tell me (Step 0 is not done).
- **Phase 1 — Read and map (no code).** Tell me where `items`, `statuses`, `additions`, `edits`,
  `selectedId` live; how the jump box is drawn in `children(zoom)`; how a row click selects and jumps.
  Then give me the file plan and your colour palette.
- **Phase 2 — Logic + tests.** `ringCircle`, `marks.js`, `markStyles.js`, `scripts/marks.test.js`.
  Show me the `npm test` output.
- **Phase 3 — Draw the marks.** `MarksLayer`, wired into `ZoomableImage`. Display only, no clicks yet.
- **Phase 4 — Mark ↔ row link.** `selectRow(id, source)`, mark click, hover tooltip, `mark_clicked`.
- **Phase 5 — Type chips.** Filter marks and rows together; `type_filter_changed`.
- **Phase 6 — Marks switch + M key.** `marks_toggled`.
- **Phase 7 — Quality check** (see Done when). Then I confirm, you commit, turn `allMarks` ON.

## Done when
- On practice and all six sheets, every ring sits on its symbol at Fit width, 100% and 200%.
- Symbols with no ring are exactly the ones with no row (check sheet 1 with me).
- Chips filter marks and rows together; counts are right; M and the switch work.
- Mark → row and row → mark both work; each action logs exactly one event.
- `allMarks: false` → the app looks and logs like `study-v1`.
- `npm test` passes, including the new tests.

## Not in this feature (later steps — do not build)
Zones and progress by zone · quick add · finish panel · count check · anything in `docs/product/PLAN.md` LATER.

## Tech
React + Vite, Supabase, Vercel (product = Vercel preview of branch `product`).
Key files: `src/App.jsx`, `src/ZoomableImage.jsx` (overlays via `children(zoom)`), `src/lib/geometry.js`,
`src/lib/edits.js`, `src/lib/logger.js`, `src/config/catalog.json`, `src/config/features.json`.
Tests: plain Node scripts in `scripts/*.test.js`, run with `npm test`.

## How to work with me
- One phase at a time. Plan first, wait for my OK. Build only that phase.
- No extra features, no refactors I did not ask for.
- When a phase is done: run `npm test`, tell me in simple words what changed, list the files,
  and tell me exactly what to click to check it.
- Commit on `product` only after I confirm. Show me any change to this file before making it.
