## Changed
- `src/components/TypeChips.jsx` (new): the row of type buttons above the drawing. It starts with "All", then one button per type with its count and a small dot in that type's colour. The button you've chosen looks pressed.
- `src/App.jsx`: adds the chosen-type setting, which starts at "All". Choosing a type now filters the rings on the drawing, the list rows and "Your Additions" together. It logs one `type_filter_changed` event per change, with the old and new type; clicking the button that's already chosen logs nothing. The chips only show when `allMarks` is on, after Analyse.
- `src/App.css`: layout only for the chip row (wrapping row, pill shape, spacing).
- `src/config/markStyles.js`: the chip colours, for a chip at rest and the chosen chip, plus the dot size.
- `src/lib/marks.js`: chips are now ordered by count, highest first, and still count only the AI's rows.
- `scripts/marks.test.js`: 4 new tests: chip order, counts staying right after a rename changes a type, filtering by a type that isn't on the sheet, and the chip colours being complete. `npm test` passes (25 tests in this file) and `npm run build` passes.

## What to click
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