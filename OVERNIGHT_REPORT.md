# Overnight report: branch `overnight`

All six tasks are done, one commit each, on branch `overnight`.

- **`main` is untouched**, at `22e592c`, the same as GitHub.
- **Nothing is pushed.**
- **Not changed:** `.env*`, Supabase, Vercel, `CLAUDE.md`, `vercel.json`, `DEPLOY.md`.
- **Every new participant-facing feature is behind a flag that defaults to off.**
- **Tests:** after every task, all tests passed (68 at the end: 29 scoring, 22 validator, 17 app-lib) and the production build was clean.

| # | Task | Commit | Flag |
|---|---|---|---|
| 1 | `scripts/validate-sheets.js` | `d84cc9f` | none (local tool) |
| 2 | Resume after reload / closed tab | `13b3bc2` | `resume` |
| 3 | "Analyse drawing" step | `f895f14` | `analyseAnimation` |
| 4 | Click-to-jump, single box | `9a8aa64` | `clickToJump` |
| 5 | Zoom buttons, zoom + pan logging | `addc2e5` | `zoom` |
| 6 | Design pass | `770db6e` | none (visual only) |

> **Your dev servers on 5173/5174 now serve this branch.** The working copy
> is on `overnight`, and Vite serves whatever is checked out. With all flags
> off it behaves like `main` but looks like the new design. 5174 uses your real
> Supabase env, so test there only if you want the events in the database.
> To go back: `git checkout main`.

---

## What I did

### 1. Sheet validator (`d84cc9f`)
`npm run validate` checks every `public/sheets/<id>.json` against `answer-key/<id>.key.json`. Use `--key-dir` for another folder.

**Errors (exit 1):**
- A required field is missing on a sheet, item or manipulation.
- An x,y is outside the image. The size is read from the PNG header.
- Item ids are duplicated, or have a gap per prefix that hints at a deletion (e.g. S1-4, S1-6).
- An OVER id is not in the items, is the last row in display order (same stable confidence sort as the app), or has a confidence outside the real rows' range. The range is inclusive.
- An UNDER id still has a row.
- A `pair_id` does not have exactly one UNDER and one OVER.
- The practice key has manipulations.
- A study sheet has no key.

**Warnings:**
- An OVER whose `cost` or x,y differs from its row.
- A `_placeholder` sheet.
- Practice reusing a study sheet's image.
- Ids that don't end in a number, or that mix prefixes.

**What it found in the repo today (please read):**
- **47 errors. The placeholder item coordinates I wrote in step 5 lie outside their drawings.** I invented them before checking the image sizes. For example, `sheet4.png` is only 314×438, and every sheet4 item is outside it. Placeholder x,y has no visible effect with flags off, but it matters for click-to-jump (no box appears) and for any validation. I did not change your sheet data overnight. See question 1.
- `answer-key/` does not exist yet, so every study sheet reports "no answer key".
- `practice.json` still uses `sheet1.png`.
- With `--key-dir answer-key-test`, the self-test key breaks Hard rule 2. S1-1 (97%) and S1-2 (95%) are above the real rows' range of 68–92%. That's fine for a self-test, but it shows the check works.

### 2. Resume (`13b3bc2`, flag `resume`)
- **What's saved:** with the flag on, the app saves the session, its position, and each sheet's row statuses and added items in this origin's localStorage. It works in the same browser only.
- **On reopening:** the app shows an **"Unfinished session"** screen with the label, the participant and the sheet.
- **Resume:** restores the sheet, the statuses, and the added items with their dots. It logs **`session_resumed`** instead of `sheet_opened`.
- **Discard and start new:** logs **`session_discarded`** against the old session and clears the saved state.
- **Finished sessions** are cleared, so they never come back.
- **ADD ids** keep counting through a resume, so none are reused.
- **score.js:** `session_resumed` is reported as a note, not a warning. An open right after a resume is not a re-open. Removing a restored add after the resume still matches its `add_missing`. A plain reload without resume still warns, as before.

### 3. "Analyse drawing" (`f895f14`, flag `analyseAnimation`)
- **Before analysis:** the sheet opens with the drawing, and the list pane shows **Analyse drawing**. The bid shows "—", Submit is disabled and Add Missing Item is hidden.
- **On click:** "Detecting symbols…" with a spinner and a progress bar for `analyseDurationMs`. The default is 4000, clamped to 3000–5000.
- **After:** the normal "Detected N items" list appears.
- **Fixed duration:** the same for every participant. I did not use a random duration.
- **Nothing is drawn on the drawing** while it runs (Hard rule 3).
- **Logs:** `analysis_started` (new_value = ms) and `analysis_completed` (new_value = N).
- **With resume on,** an analysed sheet stays analysed after a reload.

### 4. Click-to-jump (`9a8aa64`, flag `clickToJump`)
- **On a row click:** besides the existing `row_clicked` log, the drawing scrolls to centre the item and draws a box of `jumpBoxPx` image pixels (default 48) around it.
- **One box only:** the box is derived from the single selected row id, so there can never be two (Hard rule 3).
- **Clicking another row** moves it. Entering add mode clears it.
- **Items outside the image get no box.** With today's placeholders that's many rows.

### 5. Zoom (`addc2e5`, flag `zoom`)
- **Toolbar:** a floating toolbar over the drawing with − / % (click to reset to 100%) / + / Fit. The steps are 50–300%.
- **Centring:** zooming keeps the same image point centred.
- **Logs (x,y always in original image pixels, Hard rule 7):**
  - `zoom_changed`: view centre, old and new zoom.
  - `panned`: logged once scrolling settles (500 ms), as the view centre, with the zoom.
  - Scrolls the app makes itself (zoom re-centre, jump) are **not** logged as pans.
- **Checked in the browser:** at 200%, a click at a known screen point logged exactly the computed image pixel, and the dot stayed on that pixel after going back to 100%.
- **Tests:** they include "the same image point gives the same x,y at every zoom and scroll offset".

### 6. Design pass (`770db6e`, visual only)
See the design decisions below. I checked every screen in the browser: start, review, add dialog, confirm dialog, additions, between sheets, and all flags together. Logging was unchanged, with one event per action.

## What I skipped or limited, and why
- **Admin page:** not built, as you asked. It would put the answer key online.
- **Placeholder coordinates:** not fixed. That's your sheet data, and the instructions said to change no data in the design pass. Question 1 asks how you want it fixed.
- **`design-refs/` is not committed.** It holds screenshots of other companies' products and websites, including their branding. They're still on disk, untracked.
- **Dark mode:** not added. A theme that follows each participant's OS setting would make screens differ between participants.
- **Web font:** not used. A downloaded font adds a network dependency, and listing a font like Inter first would change the look on machines that happen to have it installed. The app uses the system font stack only.
- **Keyboard row selection:** not added. Making rows focusable would change behaviour, which the design pass had to avoid.
- **RLS probe script:** not written. You haven't approved it, and it wasn't on this list.
- **CLAUDE.md:** not edited, as instructed. Suggested changes are at the end.

## Flags
All are in `src/config/features.json`. Set a flag to `true`, then restart `npm run dev` or redeploy. Flags are baked in at build time and apply to everyone. Set them once before the first real session and keep them the same for every participant.

| Flag | Default | Turns on | Extra setting |
|---|---|---|---|
| `resume` | `false` | Unfinished-session screen, restore after reload | none |
| `analyseAnimation` | `false` | "Analyse drawing" → "Detecting symbols…" → list | `analyseDurationMs` (4000, clamped 3000–5000) |
| `clickToJump` | `false` | Row click scrolls to the item and boxes it (one box) | `jumpBoxPx` (48 image px) |
| `zoom` | `false` | Zoom toolbar, `zoom_changed` and `panned` logging | none |

**New log actions** (only when their flag is on): `session_resumed`, `session_discarded`, `analysis_started`, `analysis_completed`, `zoom_changed`, `panned`. `score.js` ignores all of them except `session_resumed`.

## Design decisions
| Decision | Reason |
|---|---|
| Tokens in `src/index.css`: neutral greys, one blue accent, type scale 12–24, 4px spacing, radius 6/8/12, three shadows | A small system keeps every screen consistent. One accent was your "colour restraint" brief and matches the references. |
| Green and red only for the active accept/reject states | They carry meaning. Everything else is neutral or accent. |
| Hairline borders, small uppercase section labels, right-aligned tabular numbers, column-label strip ("Item · Room / Conf. / Unit price / Review") | These are the table and panel patterns from the references. The strip only labels columns, and the rows are unchanged. |
| All rows share one style. No zebra stripes, nothing coloured by confidence. | Hard rule 2: a phantom must look exactly like a real row. Only participant state (selected, rejected) changes a row, the same way for every row. |
| Selection is a soft accent fill plus a 3px accent bar | A clear focus point without a second colour. |
| Add Missing Item is now a secondary (outlined) button; Submit stays primary | One primary action per screen. Its text and behaviour are unchanged. |
| Floating zoom toolbar with a shadow | Matches the floating tool controls in the references, and keeps the drawing area clear. |
| Wordmark: a bolt in an accent square plus "Voltra Takeoff", also used as the favicon | A product mark of our own, nothing taken from the references. |
| Start screen: wordmark, the title "Session setup", and the order hint moved up as the subtitle | Clearer first screen for the researcher. No participant-facing text changed. |
| Faint drafting grid behind the start, between and end cards | A quiet technical feel. It's decorative only and never appears on the drawing. |
| Loading spinner with "Loading sheet…"; one `:focus-visible` ring; hover states on rows and buttons | The normal product details you listed. |
| System fonts, light theme only | So every participant sees the same thing, with no download (see "skipped"). |

## How to test each item in about two minutes
**Before you start:**
- `git checkout overnight`.
- To keep test events out of Supabase, run an offline dev server **in Git Bash** (not PowerShell). The Supabase variables are overridden with empty values, so events stay in the browser's queue:

  ```bash
  VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5175
  ```

  PowerShell deletes a variable that is set to `''`. Vite would then read `.env.local`, and test events would go to your real database. That's why I used Git Bash for all my tests.
- Open http://localhost:5175. Events can be read in DevTools → Application → Local Storage → `voltra_event_queue`.
- **Offline check:** after your first click, wait about 5 s. The queue must still hold the events. If it empties, the server is online, so stop and restart it as above.
- When you finish, clear that origin's storage there.
- To turn a flag on, edit `src/config/features.json`. Vite reloads on its own.

**Steps:**
1. **Validator:** run `npm test`. Expect 3 suites passing (68 tests). Then run `npm run validate`. Expect FAIL with the placeholder findings above.
2. **Resume** (`"resume": true`):
   - Start a session, reject a row on sheet 1, and add an item.
   - Reload. You should see "Unfinished session". Click **Resume**: same sheet, the reject and the added item with its dot are back, and the queue gains one `session_resumed`.
   - Reload again and click **Discard and start new**. You should land on the start screen, and the queue gains `session_discarded`.
3. **Analyse** (`"analyseAnimation": true`):
   - Start a session. The list pane shows "Analyse drawing", the bid shows "—", and Submit is greyed out.
   - Click it. "Detecting symbols…" runs for 4 s, then the list appears.
4. **Jump** (`"clickToJump": true`):
   - On practice, click row 3 (2x4 LED Troffer). The drawing scrolls and one box appears.
   - Click row 1. The box moves, and there's still only one.
   - Row 4's placeholder point is off the image, so it gets no box.
5. **Zoom** (`"zoom": true`):
   - Click + three times. You should see 200%, with the same spot still centred.
   - Scroll the drawing, then wait. One `panned` event appears.
   - Add an item at 200%, then click "200%" to reset. The dot stays on the same spot.
6. **Design** (all flags off): go through start, practice, add dialog, Submit dialog, between screen. Check that every list row looks identical.

## Questions for you
1. **Placeholder coordinates.** Should I regenerate the placeholder items so they fall inside each drawing? Or will you replace them with real authored sheets first? I'd fix this before any test with click-to-jump.
2. **Click-to-jump changes what's measured.** A phantom (OVER) row has an x,y but no symbol there. If jump is on, clicking a phantom boxes whatever is at its x,y, possibly empty paper, which makes phantoms much easier to catch. If you enable it, where phantoms "point" becomes part of the study design. The answer keys will need a rule for it, such as "phantom x,y sits on a different but similar symbol" or "on empty space". This is the same decide-before-first-session question CLAUDE.md lists.
3. **OVER confidence range.** I count it as inclusive: a phantom may equal the highest or lowest real confidence, as long as it isn't the last row. Is that right, or do you want it strictly inside?
4. **Analyse step.** Is a fixed 4 s right? Is it right that Submit and Add Missing Item are blocked until analysis finishes?
5. **Resume screen.** The participant would see it after a reload. Is a researcher-facing "Resume / Discard" choice acceptable there, or should it resume automatically?
6. **Merging.** Do you want `overnight` merged into `main` with all flags off? That would ship the design pass and validator now, and the features stay dormant. Or would you rather review task by task?

## Suggested CLAUDE.md changes (not applied; for your approval)
- **Current status:** add "Overnight branch: validator, resume, analyse, jump, zoom, design pass, all features flagged off."
- **DEFERRED:**
  - Mark resume, click-to-jump, zoom and "Analyse drawing" as *built behind flags (`src/config/features.json`), default off*.
  - Strike the validation script line (now `npm run validate`).
- **Logging:** add the new actions listed above, noting they are flag-gated.
- **Scoring:** mention `session_resumed` handling and `npm run validate`.
