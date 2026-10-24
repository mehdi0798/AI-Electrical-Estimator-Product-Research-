# Phase 5 plan: type chips

1. **`src/lib/marks.js`**: change `typeCounts(marks)` so it sorts by count, highest first. Types with the same count keep the order they first appear in. It still counts rows only, not additions, so the chips match the rows the AI detected (e.g. `Light fixture 32 · Receptacle 22 …`). `filterByType` stays as it is: it is the one rule for both marks and list rows.

2. **`src/components/TypeChips.jsx`** (new, display only, wrapped in `React.memo`): it receives `counts`, `value` and `onChange`, and draws a row of real `<button type="button">` chips: `All · <type> <count> …`.
   - The active chip has `aria-pressed="true"`, and the row has `role="group"` and `aria-label="Filter by type"`.
   - If the active type drops to count 0 (a rename can do that), its chip still shows with 0, so the user can always see what is selected.
   - No logging inside the component.

3. **`src/App.jsx` state**: add `const [typeFilter, setTypeFilter] = useState('all')` next to the other review-screen state, above the loading checks. Then add a `useMemo` for `counts = typeCounts(marks)` and one for `shownMarks = filterByType(marks, typeFilter)`. Both are derived and copy no state.

4. **`src/App.jsx` handler**: add `changeTypeFilter(next)`. If `next === typeFilter` it does nothing and logs nothing. Otherwise it calls `logEvent({ action: 'type_filter_changed', old_value: typeFilter, new_value: next })` once, then `setTypeFilter(next)`.

5. **`src/App.jsx` wiring**: `MarksLayer` gets `shownMarks` instead of `marks`.
   - The list renders `filterByType(items, typeFilter)` and the additions list renders `filterByType(additions, typeFilter)`, so marks and rows always follow the same rule.
   - `<TypeChips>` goes in the drawing pane, just above `<ZoomableImage>`. It only shows when `FEATURES.allMarks && analysed`, the same condition as the marks.
   - The "Detected N items" header and the bid total still use every row, not just the filtered ones.
   - Selection, the jump box and `selectRow` don't change.
   - With the flag off, `typeFilter` stays `'all'` and no chips render, so the app looks and logs like `study-v1`.

6. **Styles**:
   - **`src/App.css`**: layout for the chip row: a flex row that wraps, small gaps and a compact height that fits at 1366×768.
   - **`src/config/markStyles.js`**: a small colour dot on each chip, using the colour already set for that type.
   - The active-chip and rest-state colours copy the existing button look and live in `App.css`, the same way Phase 1 decision 8 handles layout.

7. **`scripts/marks.test.js`**, new tests (the existing ones stay unchanged and still pass):
   - `typeCounts` sorts by count, highest first, and ties keep first-seen order.
   - Additions are not counted.
   - `filterByType` with a type that isn't on the sheet returns `[]`, for both marks and rows.
   - The total of counts still equals the number of rows after a rename changes a row's type.

8. **Checks**: `npm test` and `npm run build` must both pass. `allMarks` stays `false` in `features.json`, which I don't touch. Nothing from Phase 6 gets built: no marks switch, no M key, no `marks_toggled`.