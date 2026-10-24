# Autopilot summary — run 20261024-214725

Phases run: 3, 4, 5, 6. All approved by Codex, `npm test` and `npm run build` pass.
Run output (plans, reviews, logs): `autopilot/runs/20261024-214725/`.

## Phase 3 — Draw the marks

- Commit: `77411eb`
- Files: `scripts/marks.test.js`, `src/App.css`, `src/App.jsx`, `src/config/markStyles.js`, `src/lib/marks.js`, `src/components/MarksLayer.jsx`
- Codex: plan fix rounds 0, diff fix rounds 0
- Approved plan: `autopilot/runs/20261024-214725/phase-3/plan-1.md`

### Changed
- `src/components/MarksLayer.jsx` (new): one drawing layer that puts a ring on every row and a diamond on every addition, all at once, positioned with `ringCircle`. Colour shows the type; line style plus a small ✓ or × shows the status. A white halo keeps each ring readable on black lines, and every mark has an aria-label. It only displays for now: clicks and hover come in Phase 4.
- `src/App.jsx`: builds the marks with `useMemo` above the loading checks. With `allMarks` on, it draws `MarksLayer` under the draft pin and the jump box, and only after the analysis has revealed the list. With the flag off, it shows today's addition dots exactly as before.
- `src/lib/marks.js`: adds `markLabel` (the aria-label text) and `diamondPoints` (the four corners of the addition diamond).
- `src/config/markStyles.js`: adds the halo, icon size and colour, and diamond size settings.
- `src/App.css`: adds position and size rules for the layer (`.marks-layer`, clicks pass through it). No colours.
- `scripts/marks.test.js`: adds 3 tests: draw order (additions on top, rejected underneath), the aria-label text, and the diamond centring on its point at zoom 0.5, 1 and 2. `npm test` passes (the marks file shows 17 passed) and `npm run build` passes.

### What to click
1. To see anything, set `"allMarks": true` in `src/config/features.json` on your machine only. Don't commit that change.
2. Run `npm run dev` and open the app. Go to the practice sheet, and click Analyse if that button appears.
3. When the list appears, check that every row has a thin ring on its symbol, coloured by type.
4. Accept a row: its ring gets thicker and shows a small ✓. Reject a row: its ring turns grey and dashed with a small ×, and stays visible.
5. Click a row in the list: the blue jump box appears on top of that ring.
6. Click **Add missing**, then click a spot on the drawing and confirm. A small dark diamond appears there instead of the old dot.
7. Use Fit width, then zoom to 100% and 200%. The rings should stay on their symbols and never get smaller than about 16 px. Panning should stay smooth.
8. Rename a row with Edit to a name of another type: its ring colour changes to the new type.
9. Set `"allMarks": false` and reload. No rings appear, and additions show the old dots, like `study-v1`.

## Phase 4 — Mark <-> row link

- Commit: `31b5f7a`
- Files: `scripts/marks.test.js`, `src/App.css`, `src/App.jsx`, `src/components/MarksLayer.jsx`, `src/config/markStyles.js`, `src/lib/marks.js`
- Codex: plan fix rounds 1, diff fix rounds 0
- Approved plan: `autopilot/runs/20261024-214725/phase-4/plan-2.md`

### Changed
- `src/App.jsx`: row click and mark click now both go through one new `selectRow(id, source)`, so each click logs only one event (`row_clicked` or `mark_clicked`). Clicking a mark also scrolls the list to its row. While "Add missing" is on, marks don't take clicks.
- `src/components/MarksLayer.jsx`: each mark has an invisible band along its ring. Hovering a ring or a diamond shows a tooltip. Clicking a ring selects its row; diamonds only show the tooltip. The selected row's ring is drawn thicker and on top. While placing, the bands are off and every click reaches the drawing.
- `src/lib/marks.js`: new `markTooltip(m)` builds the tooltip text: name, type, confidence and status, or "Added by you" for additions.
- `src/config/markStyles.js`: two new constants, the width of the hover/click band and the extra thickness of the selected ring.
- `src/App.css`: a pointer cursor over rings, and the normal cursor over diamonds.
- `scripts/marks.test.js`: 4 new tests for the tooltip text. `npm test` passes (marks: 21 passed) and `npm run build` passes. `allMarks` is still `false`.

### What to click
1. To see anything, set `"allMarks": true` in `src/config/features.json` on your machine only (don't commit it). Then run `npm run dev` and open the app.
2. Start a session, open a sheet and click **Analyse**. Wait for the list to appear.
3. Hover the edge of any ring. A tooltip appears, for example "E2 · Light fixture · 95% · undecided".
4. Click the edge of a ring for a row low in the list. The list scrolls to that row and highlights it, the blue jump box shows on the symbol, and that ring gets thicker.
5. Click a different row in the list. Its ring gets thicker and the earlier one goes back to normal.
6. Click **+ Add Missing Item**, then click right on top of a ring. The pin lands there and the ring does not select its row. Finish or cancel the addition.
7. If you made an addition, hover its diamond. The tooltip ends in "Added by you". Clicking the diamond selects nothing.
8. Check the log with the `product_event_log` table, or the localStorage queue if you're offline:
   - a mark click gave one `mark_clicked` with that row's id, and no `row_clicked`;
   - a row click gave one `row_clicked`.
9. Set `allMarks` back to `false`. Row clicks still work as before and still log `row_clicked`.

## Phase 5 — Type chips

- Commit: `94f392e`
- Files: `scripts/marks.test.js`, `src/App.css`, `src/App.jsx`, `src/config/markStyles.js`, `src/lib/marks.js`, `src/components/TypeChips.jsx`
- Codex: plan fix rounds 1, diff fix rounds 0
- Approved plan: `autopilot/runs/20261024-214725/phase-5/plan-2.md`

### Changed
- `src/components/TypeChips.jsx` (new): the row of type buttons above the drawing. It starts with "All", then one button per type with its count and a small dot in that type's colour. The button you've chosen looks pressed.
- `src/App.jsx`: adds the chosen-type setting, which starts at "All". Choosing a type now filters the rings on the drawing, the list rows and "Your Additions" together. It logs one `type_filter_changed` event per change, with the old and new type; clicking the button that's already chosen logs nothing. The chips only show when `allMarks` is on, after Analyse.
- `src/App.css`: layout only for the chip row (wrapping row, pill shape, spacing).
- `src/config/markStyles.js`: the chip colours, for a chip at rest and the chosen chip, plus the dot size.
- `src/lib/marks.js`: chips are now ordered by count, highest first, and still count only the AI's rows.
- `scripts/marks.test.js`: 4 new tests: chip order, counts staying right after a rename changes a type, filtering by a type that isn't on the sheet, and the chip colours being complete. `npm test` passes (25 tests in this file) and `npm run build` passes.

### What to click
1. In `src/config/features.json`, set `"allMarks": true` on your machine only; don't commit it. Then run `npm run dev` and open the app.
2. Start a session, open sheet 1 and click **Analyse**. When it finishes, a row of chips appears above the drawing: `All`, then each type with its count, biggest first. `All` looks pressed.
3. Check that the counts add up to the number in "Detected N items" in the list header.
4. Click **Light fixture**. Only light-fixture rings stay on the drawing, and the list shows only light-fixture rows. The header still shows the full count, and the bid total doesn't change.
5. Click **Light fixture** again. Nothing changes and nothing is logged.
6. Click **Receptacle**, then **All**. Everything comes back.
7. Use **Add missing** to add a Light fixture. With **Receptacle** chosen, its diamond and its "Your Additions" row are hidden; with **Light fixture** or **All** chosen, they show.
8. With **Switch** chosen, edit a switch row to a light fixture's name. The row leaves the list, and the Switch chip stays visible (count 0 if it was the only switch).
9. In DevTools → Application → Local Storage, check the log queue. There is one `type_filter_changed` per chip change, e.g. `old_value: all, new_value: Light fixture`.
10. Set `allMarks` back to `false` and reload. There are no chips, and the list and drawing look like `study-v1`.

## Phase 6 — Marks switch + M key

- Commit: `7a73dcb`
- Files: `scripts/marks.test.js`, `src/App.css`, `src/App.jsx`, `src/config/markStyles.js`, `src/lib/marks.js`, `src/components/MarksToggle.jsx`
- Codex: plan fix rounds 0, diff fix rounds 0
- Approved plan: `autopilot/runs/20261024-214725/phase-6/plan-1.md`

### Changed
- `src/components/MarksToggle.jsx` (new): the "Marks on / Marks off" button above the drawing, with an **M** key hint. It only shows the button and does no logging.
- `src/App.jsx`: adds the `marksOn` state, which starts on. One handler logs `marks_toggled` (`on`/`off`) and flips the state. The **M** key toggles marks, except while you type in a field, hold Ctrl/Alt/Cmd, or hold the key down. The button sits in one row with the type chips. Switching off hides every ring and diamond, but the blue jump box and the draft pin stay.
- `src/App.css`: layout for the new toolbar row (button on the left, chips wrapping beside it), the button's size and focus outline, and the M key hint.
- `src/config/markStyles.js`: the on/off colours of the button (`TOGGLE_STYLE`), the same calm tones as the chips.
- `src/lib/marks.js`: new `isTypingTarget(el)`, which tells whether a key was pressed inside an input, select, textarea or editable text.
- `scripts/marks.test.js`: tests for `isTypingTarget` and `TOGGLE_STYLE`. `npm test` passes (28 marks tests, plus the existing ones) and `npm run build` succeeds. `allMarks` is still `false`.

### What to click
1. To see anything, set `"allMarks": true` in `src/config/features.json` on your machine only (don't commit it). Then run `npm run dev`.
2. Start a session and open the practice sheet. Click **Analyse drawing** and wait for the list. A **Marks on [M]** button appears above the drawing, to the left of the type chips.
3. Click **Marks on**. Every ring and diamond disappears and the button reads **Marks off**. Click it again and the marks come back.
4. Click anywhere on the page that is not a text field, then press **M**. The marks hide. Press **M** again and they show.
5. Click a row so the blue jump box shows, then press **M**. The rings hide but the blue box stays.
6. Click **Add missing**, click the drawing, then open the item dropdown in the popover and type **m** there. The marks must not toggle. Do the same in the Edit dialog's dropdown.
7. Pick a type chip such as **Receptacle**, switch marks off, then on again. Only that type's marks come back.
8. Open the browser devtools (Application → Local Storage, the log queue). Each button click or **M** press adds exactly one `marks_toggled` event, with new_value `off` or `on`. Holding **M** down adds only one.
9. Set `allMarks` back to `false` and reload. There is no button and pressing **M** does nothing.

## Next

Phase 7 (quality check) is interactive. `allMarks` is still `false` in every commit.
