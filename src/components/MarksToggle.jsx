// All marks on (Feature 1, flag allMarks): the marks switch above the drawing.
// Hides/shows every mark to see the bare drawing; key M does the same (App.jsx).
// Presentational only: no state, no logging. Colours from markStyles.js.

import { memo } from 'react'
import { TOGGLE_STYLE } from '../config/markStyles'

function MarksToggle({ on, onToggle }) {
  const s = on ? TOGGLE_STYLE.on : TOGGLE_STYLE.off
  return (
    <button
      type="button"
      className="marks-toggle"
      aria-pressed={on}
      aria-keyshortcuts="M"
      title="Show or hide all marks (M)"
      onClick={onToggle}
      style={{ background: s.background, borderColor: s.border, color: s.text }}
    >
      {on ? 'Marks on' : 'Marks off'} <kbd aria-hidden="true">M</kbd>
    </button>
  )
}

export default memo(MarksToggle)
