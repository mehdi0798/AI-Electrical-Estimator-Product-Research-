## Phase 4 plan: link marks and rows

- **`src/lib/marks.js`**: add one pure function, `markTooltip(m)`. It returns the hover text with name, type, confidence and status. A row reads like `"E2 · Light fixture · 92% · accepted"`. An addition reads `"E2-NL · Light fixture · Added by you"`. No other logic changes.
- **`src/config/markStyles.js`**: add the new visual constants. `HIT_WIDTH` is the width in screen px of an invisible click band along each ring. `SELECTED_EXTRA` is the extra stroke and halo width for the selected row's mark. All visual constants stay in this file.
- **`src/components/MarksLayer.jsx`**: add the props `selectedId`, `onMarkClick` and `clickable`.
  - Each row ring gets an invisible circle that responds only on its stroke (`pointer-events: stroke`, width `HIT_WIDTH`). Only the ring takes the click. The symbol's centre and the rest of the svg stay `pointer-events: none`, so panning and drawing clicks still work.
  - On click, the ring calls `e.stopPropagation()` and then `onMarkClick(id)`. `stopPropagation` keeps the click from also reaching `onImageClick`.
  - The selected mark is drawn thicker with `SELECTED_EXTRA` and on top. The blue jump box is still drawn above everything by App.
  - Every mark gets a hover tooltip: an SVG `<title>` with the `markTooltip(m)` text. Addition diamonds get the tooltip but cannot be clicked, because they have no list row to select. Additions rows cannot be selected today either.
  - When `clickable` is false, no hit circles are drawn, so rings ignore clicks (Phase 1 decision 5).
  - The component stays presentational: no logging, still `React.memo`, each mark keyed by row id.
- **`src/App.jsx`, new `selectRow(id, source)`**: one function shared by row click and mark click.
  - If `placing` is on, it does nothing.
  - Otherwise it calls `setSelectedId(id)` and logs exactly one event: `row_clicked` when `source === 'row'`, `mark_clicked` when `source === 'mark'`, each with `item_id: id`.
  - Then it runs the same `if (FEATURES.clickToJump) jumpTo(item)` as today.
  - For `source === 'mark'` only, it also scrolls the list to the row. The row the user clicks is already visible, so row clicks don't need it.
  - The `<li onClick>` calls `selectRow(item.id, 'row')`. With the flag off, the behaviour and logs are the same as today.
- **`src/App.jsx`, list scroll (new code, Phase 1 decision 3)**: a `rowRefs = useRef(new Map())`, filled by a ref callback on each `<li>`. `selectRow` calls `rowRefs.current.get(id)?.scrollIntoView({ block: 'nearest' })`.
- **`src/App.jsx`, wiring**: pass `selectedId`, `onMarkClick={(id) => selectRow(id, 'mark')}` and `clickable={!placing}` to `<MarksLayer>`. This only happens behind `FEATURES.allMarks`. No new state, and nothing from later phases (no chips, switch or M key).
- **`src/App.css`**: add a `.marks-layer .mark-hit { cursor: pointer; }` rule. While placing, the crosshair cursor wins because the hit circles are not drawn. Layout only, no colours.
- **`scripts/marks.test.js`**: add tests for `markTooltip`:
  - an accepted row shows its name, type, rounded confidence % and status;
  - a rejected row shows `rejected`;
  - a renamed row shows its new name and type;
  - an addition shows `Added by you` and no %.

  The existing hard-rule-3 guard test stays. `npm test` and `npm run build` must both pass. `allMarks` stays `false`.