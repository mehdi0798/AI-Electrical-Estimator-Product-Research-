## Phase 4 plan, revised: link marks and rows

- **`src/lib/marks.js`**: add one pure function, `markTooltip(m)`. It returns the hover text with name, type, confidence and status. A row reads like `"E2 · Light fixture · 92% · accepted"`. An addition reads `"E2-NL · Light fixture · Added by you"`. No other logic changes.
- **`src/config/markStyles.js`**: add the new visual constants. `HIT_WIDTH` is the width in screen px of an invisible hover/click band along each ring or diamond. `SELECTED_EXTRA` is the extra stroke and halo width for the selected row's mark. All visual constants stay in this file.
- **`src/components/MarksLayer.jsx`, rows**: add the props `selectedId`, `onMarkClick` and `interactive`.
  - Each row ring gets an invisible circle that responds only on its stroke (`pointer-events: stroke`, width `HIT_WIDTH`). Only the ring takes the click. The symbol's centre and the rest of the svg stay `pointer-events: none`, so panning and drawing clicks still work.
  - On click, the ring calls `e.stopPropagation()` and then `onMarkClick(id)`.
  - The selected mark is drawn thicker with `SELECTED_EXTRA` and on top. The blue jump box is still drawn above everything by App.
  - Each mark's `<g>` holds an SVG `<title>` with the `markTooltip(m)` text, so hovering the band shows the tooltip.
  - The component stays presentational: no logging, still `React.memo`, each mark keyed by row id.
- **`src/components/MarksLayer.jsx`, additions**:
  - Each addition diamond gets the same kind of invisible band along its stroke (`pointer-events: stroke`, width `HIT_WIDTH`), so its `<title>` "Added by you" tooltip can appear on hover.
  - The diamond has no click handler and does not stop propagation. Additions have no list row to select.
  - When `interactive` is false (while placing), neither rings nor diamonds get bands. Every pointer event then reaches the drawing, so placement clicks pass through (Phase 1 decision 5).
- **`src/App.jsx`, new `selectRow(id, source)`**: one function shared by row click and mark click.
  - If `placing` is on, it does nothing.
  - Otherwise it calls `setSelectedId(id)` and logs exactly one event: `row_clicked` when `source === 'row'`, `mark_clicked` when `source === 'mark'`, each with `item_id: id`.
  - Then it runs the same `if (FEATURES.clickToJump) jumpTo(item)` as today.
  - For `source === 'mark'` only, it scrolls the list to the row, using `rowRefs = useRef(new Map())` filled by a ref callback on each `<li>` and `scrollIntoView({ block: 'nearest' })`. This is new code (Phase 1 decision 3).
  - The `<li onClick>` calls `selectRow(item.id, 'row')`. With the flag off, the behaviour and logs are the same as today.
- **`src/App.jsx`, wiring**: pass `selectedId`, `onMarkClick={(id) => selectRow(id, 'mark')}` and `interactive={!placing}` to `<MarksLayer>`. This only happens behind `FEATURES.allMarks`. No new state, and nothing from later phases (no chips, switch or M key).
- **`src/App.css`**:
  - Add `.marks-layer .mark-hit { cursor: pointer; }` for row rings.
  - Add `.marks-layer .mark-hit.added { cursor: default; }` for diamonds, since they show a tooltip but can't be clicked.

  Layout only, no colours.
- **`scripts/marks.test.js`**: add tests for `markTooltip`:
  - an accepted row shows its name, type, rounded confidence % and status;
  - a rejected row shows `rejected`;
  - a renamed row shows its new name and type;
  - an addition shows `Added by you` and no %.

  The existing hard-rule-3 guard test stays. `npm test` and `npm run build` must both pass. `allMarks` stays `false`.