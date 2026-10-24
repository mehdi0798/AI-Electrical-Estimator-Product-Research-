## Changed
- `src/components/MarksLayer.jsx` (new): one drawing layer that puts a ring on every row and a diamond on every addition, all at once, positioned with `ringCircle`. Colour shows the type; line style plus a small ✓ or × shows the status. A white halo keeps each ring readable on black lines, and every mark has an aria-label. It only displays for now: clicks and hover come in Phase 4.
- `src/App.jsx`: builds the marks with `useMemo` above the loading checks. With `allMarks` on, it draws `MarksLayer` under the draft pin and the jump box, and only after the analysis has revealed the list. With the flag off, it shows today's addition dots exactly as before.
- `src/lib/marks.js`: adds `markLabel` (the aria-label text) and `diamondPoints` (the four corners of the addition diamond).
- `src/config/markStyles.js`: adds the halo, icon size and colour, and diamond size settings.
- `src/App.css`: adds position and size rules for the layer (`.marks-layer`, clicks pass through it). No colours.
- `scripts/marks.test.js`: adds 3 tests: draw order (additions on top, rejected underneath), the aria-label text, and the diamond centring on its point at zoom 0.5, 1 and 2. `npm test` passes (the marks file shows 17 passed) and `npm run build` passes.

## What to click
1. To see anything, set `"allMarks": true` in `src/config/features.json` on your machine only. Don't commit that change.
2. Run `npm run dev` and open the app. Go to the practice sheet, and click Analyse if that button appears.
3. When the list appears, check that every row has a thin ring on its symbol, coloured by type.
4. Accept a row: its ring gets thicker and shows a small ✓. Reject a row: its ring turns grey and dashed with a small ×, and stays visible.
5. Click a row in the list: the blue jump box appears on top of that ring.
6. Click **Add missing**, then click a spot on the drawing and confirm. A small dark diamond appears there instead of the old dot.
7. Use Fit width, then zoom to 100% and 200%. The rings should stay on their symbols and never get smaller than about 16 px. Panning should stay smooth.
8. Rename a row with Edit to a name of another type: its ring colour changes to the new type.
9. Set `"allMarks": false` and reload. No rings appear, and additions show the old dots, like `study-v1`.