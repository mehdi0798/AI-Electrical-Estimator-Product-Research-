## Changed
- `src/App.jsx`: row click and mark click now both go through one new `selectRow(id, source)`, so each click logs only one event (`row_clicked` or `mark_clicked`). Clicking a mark also scrolls the list to its row. While "Add missing" is on, marks don't take clicks.
- `src/components/MarksLayer.jsx`: each mark has an invisible band along its ring. Hovering a ring or a diamond shows a tooltip. Clicking a ring selects its row; diamonds only show the tooltip. The selected row's ring is drawn thicker and on top. While placing, the bands are off and every click reaches the drawing.
- `src/lib/marks.js`: new `markTooltip(m)` builds the tooltip text: name, type, confidence and status, or "Added by you" for additions.
- `src/config/markStyles.js`: two new constants, the width of the hover/click band and the extra thickness of the selected ring.
- `src/App.css`: a pointer cursor over rings, and the normal cursor over diamonds.
- `scripts/marks.test.js`: 4 new tests for the tooltip text. `npm test` passes (marks: 21 passed) and `npm run build` passes. `allMarks` is still `false`.

## What to click
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