## Changed
- `src/lib/geometry.js`: added `ringCircle`, which works out where a mark's ring sits on screen and how big it is. It is 24 image px across and never smaller than 16 screen px.
- `src/lib/marks.js` (new): builds one mark per row and one per addition, and has helpers for type counts, the type filter and the drawing order. A renamed row's mark shows its new name and type.
- `src/config/markStyles.js` (new): the approved colour for each of the 9 types, the colours for additions and rejected rows, the ring sizes, and the line style and icon for each status.
- `scripts/marks.test.js` (new): 14 tests covering everything listed under Tests in CLAUDE.md, plus a few extra checks. One of them confirms that nothing in `src/` mentions `answer-key`, `baseline/` or `handoff`.
- `package.json`: the new test file now runs at the end of `npm test`.
- `src/App.jsx`: I reworded the comment at line 34 so it no longer says "handoff". No code changed.

`npm test` passes, including the 14 new tests, and `npm run build` passes. `allMarks` is still `false`.

## What to click
This phase adds no screen changes. Turning `allMarks` on in `src/config/features.json` would show nothing new yet, because the marks are only drawn from Phase 3.

1. Run `npm test` in the project folder. The end of the output should show `marks: 14 passed` with no FAIL lines.
2. Run `npm run dev` and open the app. Go through the practice sheet and one real sheet, and check that it looks and behaves exactly as before.