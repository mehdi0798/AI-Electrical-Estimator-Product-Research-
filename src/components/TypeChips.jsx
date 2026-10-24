// All marks on (Feature 1, flag allMarks): one chip per type with its row count,
// plus "All". Choosing a chip filters marks and list rows together (App.jsx).
// Presentational only: no state, no logging. Colours from markStyles.js.

import { memo } from 'react'
import { CHIP_STYLE, REJECTED_COLOR, TYPE_COLORS } from '../config/markStyles'

function Chip({ active, onClick, type, children }) {
  const s = active ? CHIP_STYLE.active : CHIP_STYLE.rest
  return (
    <button
      type="button"
      className="type-chip"
      aria-pressed={active}
      onClick={onClick}
      style={{ background: s.background, borderColor: s.border, color: s.text }}
    >
      {type && (
        <span
          className="type-chip-dot"
          aria-hidden="true"
          style={{
            width: CHIP_STYLE.dotSize,
            height: CHIP_STYLE.dotSize,
            background: TYPE_COLORS[type] ?? REJECTED_COLOR,
          }}
        />
      )}
      {children}
    </button>
  )
}

function TypeChips({ counts, value, onChange }) {
  // The active type stays visible at 0 (a rename can empty it).
  const shown = value !== 'all' && !counts.some((c) => c.type === value)
    ? [...counts, { type: value, count: 0 }]
    : counts
  return (
    <div className="type-chips" role="group" aria-label="Filter by type">
      <Chip active={value === 'all'} onClick={() => onChange('all')}>
        All
      </Chip>
      {shown.map((c) => (
        <Chip key={c.type} type={c.type} active={value === c.type} onClick={() => onChange(c.type)}>
          {c.type} <span className="type-chip-count">{c.count}</span>
        </Chip>
      ))}
    </div>
  )
}

export default memo(TypeChips)
