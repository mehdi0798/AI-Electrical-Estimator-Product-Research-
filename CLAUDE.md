# Project brief for Claude Code

## Current status
v0.1 steps 1–5 DONE. Next: step 6.

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
   hint that an item is missing.
2. Added items (OVER, "phantoms") must look EXACTLY like real rows: same
   confidence range, same styling, never the last row.
3. The drawing never shows boxes or markers on detected items. In v0.1 there
   are no boxes at all. (Later, if click-to-jump is added: box ONLY the clicked
   item, never all items.) The only markers allowed on the drawing are dots for
   items the participant added themselves.
4. The list is sorted by confidence, highest first, and shown IN FULL in a
   scrollable panel. No truncation ("47 more..."), no paging, no grouping.
5. Log every action with a timestamp. Never lose a log event. The log is the
   only source of scoring.
6. The participant app must NEVER read, import, or ship the answer key.
   Answer-key files live outside `public/` and `src/` and are only read by the
   local scoring script.
7. All x,y values are in ORIGINAL IMAGE PIXELS (naturalWidth/naturalHeight),
   never screen pixels, so scoring works regardless of window size or scroll.

## Tech
- React + Vite (front end), Supabase (events table), Vercel (hosting).
- Repo stays PRIVATE.
- Supabase Row Level Security: the anon key may INSERT into `events` only.
  No SELECT, UPDATE, or DELETE from the browser.

---

## CURRENT SCOPE: v0.1 — simplest working version
Goal: a participant opens a link, reviews the practice sheet and all 6 sheets,
and every action lands in the database. Nothing more.

### Screens
1. **Start**: researcher types participant code (A or B) and a session label
   (e.g. `pilot1`, `real`). Order: practice sheet first, then
   A = 1→6, B = 6→1.
2. **Review** (one per sheet):
   - Header: "Voltra Takeoff", "Sheet k of 6 · <name>", bid total, Submit sheet.
   - Left: the drawing PNG at native size inside a scrollable box
     (scrolling = panning). No zoom buttons. No boxes.
   - Right: "Detected N items · Sorted by confidence", then the full list.
   - One row = one physical symbol on the drawing. There is NO quantity:
     a type with 16 symbols is 16 separate rows. A phantom (OVER) is one
     extra row mapping to no symbol; a deleted item (UNDER) is one row that
     should exist but doesn't.
   - Row: `type · room`, confidence %, unit price, accept ✓ / reject ✕.
     Status can be changed again; every change is logged with old and new
     value.
   - Clicking a row only highlights the row (logged as `row_clicked`).
     It does nothing on the drawing in v0.1.
   - **Add missing item**: button → crosshair cursor → participant clicks the
     drawing → picks a type from a dropdown → a new row is appended at the
     bottom of the list marked "Added by you", and a small dot appears at the
     click point. Log x,y in image pixels. Added rows can be removed (logged).
   - **Bid total**: sum of unit_price over every row that is not rejected
     (untouched rows count; added items count). Updates live.
3. **Confirm**: Submit sheet → dialog "Final bid: €X. Confirm?" → Confirm
   moves on; Cancel returns to the sheet.
4. **Between sheets**: "Sheet done. Click Continue when ready."
5. **End**: "Session complete. Thank you."

The practice sheet uses the same screen with NO planted errors; its events are
logged with `sheet = practice`.

### Data layout
```
public/sheets/practice.json, practice.png
public/sheets/sheet1.json ... sheet6.json, sheet1.png ... sheet6.png
    { "id", "name", "image", "items": [
        { "id", "type", "room", "x", "y", "confidence", "unit_price" } ] }
src/config/item_types.json
    [ { "type", "unit_price" } ]      # dropdown for "Add missing item"
answer-key/sheet1.key.json ... sheet6.key.json     # NOT in public/ or src/
    { "manipulations": [ { "id", "direction": "UNDER"|"OVER",
                           "x", "y", "cost", "pair_id" } ] }
```

### Logging
Supabase table `events`:
`id, session_label, participant, sheet, action, item_id, x, y,
old_value, new_value, client_ts, server_ts (default now())`

v0.1 actions: `session_started, sheet_opened, row_clicked, accepted, rejected,
add_missing, add_removed, submitted, confirmed, cancelled`.
Added items get ids `ADD-<sheet>-<n>`.

Never-lose rule, implemented simply:
- Every event is first pushed to a queue in localStorage, then inserted.
- Removed from the queue only after Supabase confirms the insert.
- Pending queue is retried every few seconds and on page load.
- The UI never waits on the network.

### Scoring (no admin page in v0.1)
- Export `events` as CSV from the Supabase dashboard.
- `scripts/score.js` (Node, run locally) reads the CSV + `answer-key/` + RADIUS
  and prints, per participant per sheet:
  - OVER caught = phantom's final state is rejected.
  - UNDER caught = an add_missing (not later removed) within RADIUS image
    pixels of the deleted item's x,y.
  - final confirmed bid.

### Build order for v0.1 (I trigger one step at a time)
1. Scaffold React + Vite. Load the practice sheet: drawing left, full list right.
2. Row actions (accept/reject), row highlight, live bid total.
3. Add missing item (click → type → row + dot, image-pixel coordinates).
4. Supabase logging with localStorage queue; insert-only RLS.
5. Start screen, A/B sheet order, submit + confirm, between-sheets, end screen.
6. Deploy to Vercel, write `scripts/score.js`, dry run by me end to end.

---

## DEFERRED — do NOT build until I explicitly ask
- Click-to-jump + box on the selected item (Hard rule 3 applies when built).
- Zoom buttons and zoom/pan logging.
- "Analyse drawing" → "Detecting symbols..." → "Detected N items" animation.
- Admin page (password, manipulation view, in-app scoring, CSV button).
- Resuming a session after the tab is closed / splitting across two sittings.
- Validation script for authored sheets (e.g. no phantom has the lowest
  confidence, every UNDER item is absent from `items`).

Decide BEFORE the first real session (these change what is measured, so they
must be identical for every participant): click-to-jump, zoom, the "Analyse
drawing" framing.

## Open settings
- Scoring RADIUS for "add missing": set before first real session.
- Untouched (not-yet-reviewed) rows count in the bid total: default YES.
- Currency: €.

## Note on the list model
The list is ungrouped — one row per physical symbol, never "type ×N".
Grouping would collapse OVER and UNDER into a single "is this count right?"
check and destroy the asymmetry being studied. A long flat list of near-
identical rows is intended: it makes a phantom (OVER) catchable only by
cross-checking a row against the drawing, and a deletion (UNDER) invisible
in the list by construction. Keep it ungrouped.

## How to work with me
- Build ONE step at a time. Do only the step I ask for.
- Before writing code for a step, propose a short plan and wait for approval.
- After a step works and I confirm, commit with a clear message.
- Keep it simple. This is a study instrument, not a commercial product.
- If something conflicts with a Hard rule, stop and tell me.
