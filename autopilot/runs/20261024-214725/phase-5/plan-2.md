# Phase 5 plan: type chips (revised)

1. **`src/lib/marks.js`**: change `typeCounts(marks)` so it sorts by count, highest first. Types with the same count keep the order they first appear in. It still counts rows only, not additions, so the chips match the rows the AI detected (e.g. `Light fixture 32 · Receptacle 22 …`). `filterByType` stays as it is: it is the one rule for both marks and list rows.

2. **`src/config/markStyles.js`**: add a `CHIP_STYLE` table that holds every visual constant for the chips:
   - colours for a chip at rest (background, border, text);
   - colours for the active chip (background, border, text);
   - the type-dot size.

   Each chip's type dot uses the colour already set for that type (`#344054`-style neutrals for the rest and active states, checked for ≥ 4.5:1 text contrast).

3. **`src/components/TypeChips.jsx`** (new, display only, wrapped in `React.memo`): it receives `counts`, `value` and `onChange`, and draws a row of real `<button type="button">` chips: `All · <type> <count> …`.
   - All colours come from `markStyles.js` as inline styles. The active chip has `aria-pressed="true"`, and the row has `role="group"` and `aria-label="Filter by type"`.
   - If the active type drops to count 0 (a rename can do that), its chip still shows with 0, so the user can always see what is selected.
   - No logging inside the component.

4. **`src/App.jsx` state**: add `const [typeFilter, setTypeFilter] = useState('all')` next to the other review-screen state, above the loading checks. Then add a `useMemo` for `counts = typeCounts(marks)` and one for `shownMarks = filterByType(marks, typeFilter)`. Both are derived and copy no state.

5. **`src/App.jsx` handler**: add `changeTypeFilter(next)`. If `next === typeFilter` it does nothing and logs nothing. Otherwise it calls `logEvent({ action: 'type_filter_changed', old_value: typeFilter, new_value: next })` once, then `setTypeFilter(next)`.

6. **`src/App.jsx` wiring**: `MarksLayer` gets `shownMarks` instead of `marks`.
   - The list renders `filterByType(items, typeFilter)` and the additions list renders `filterByType(additions, typeFilter)`, so marks and rows always follow the same rule.
   - `<TypeChips>` goes in the drawing pane, just above `<ZoomableImage>`. It only shows when `FEATURES.allMarks && analysed`, the same condition as the marks.
   - The "Detected N items" header and the bid total still use every row, not just the filtered ones.
   - Selection, the jump box and `selectRow` don't change.
   - With the flag off, `typeFilter` stays `'all'` and no chips render, so the app looks and logs like `study-v1`.

7. **`src/App.css`**: layout only for the chip row: a flex row that wraps, gaps, padding, border radius and a compact height that fits at 1366×768. No colours here, following Phase 1 decision 8.

8. **`scripts/marks.test.js` and checks**: new tests:
   - `typeCounts` sorts by count, highest first, and ties keep first-seen order.
   - Additions are not counted.
   - `filterByType` with a type that isn't on the sheet returns `[]`, for both marks and rows.
   - The total of counts still equals the number of rows after a rename changes a row's type.
   - `CHIP_STYLE` has every key the chips use.

   `npm test` and `npm run build` must both pass. `allMarks` stays `false`. Nothing from Phase 6 gets built: no marks switch, no M key, no `marks_toggled`.