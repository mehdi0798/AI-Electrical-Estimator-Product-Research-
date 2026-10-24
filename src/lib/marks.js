// All marks on (Feature 1, flag allMarks). One mark per sheet row and per
// participant addition, derived from state the review screen already holds.
// Marks come ONLY from the sheet's rows and the user's own additions, so a
// missed item has no mark. Plain functions, tested in Node.

import { displayItem } from './edits.js'

// One mark per row (as shown, so a renamed row has its new name and type) and
// one per addition. x, y are ORIGINAL IMAGE PIXELS.
export function buildMarks({ items, statuses, additions, edits, byName }) {
  const rows = items.map((item) => {
    const shown = displayItem(item, edits, byName)
    return {
      id: shown.id,
      x: shown.x,
      y: shown.y,
      kind: 'row',
      name: shown.name,
      type: shown.type,
      confidence: shown.confidence,
      status: statuses[shown.id] ?? 'undecided',
    }
  })
  const added = additions.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    kind: 'added',
    name: a.name,
    type: a.type,
    confidence: null,
    status: null,
  }))
  return [...rows, ...added]
}

// Counts per type for the chips, rows only, in first-seen order.
export function typeCounts(marks) {
  const counts = new Map()
  for (const m of marks) {
    if (m.kind !== 'row') continue
    counts.set(m.type, (counts.get(m.type) ?? 0) + 1)
  }
  return [...counts].map(([type, count]) => ({ type, count }))
}

// The one type filter, for both marks and list rows.
export function filterByType(list, type) {
  if (type === 'all') return list
  return list.filter((m) => m.type === type)
}

// The aria-label of one mark: "E2-NL, Light fixture, accepted".
export function markLabel(m) {
  return `${m.name}, ${m.type}, ${m.kind === 'added' ? 'Added by you' : m.status}`
}

// SVG polygon points for an addition's diamond, in screen px. The centre comes
// from ringCircle (geometry.js); this only spreads the four corners around it.
export function diamondPoints({ cx, cy, r }) {
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`
}

// Paint order: rejected first (underneath), then undecided, accepted, added.
const LAYER = { rejected: 0, undecided: 1, accepted: 2 }
const layer = (m) => (m.kind === 'added' ? 3 : LAYER[m.status])

export function drawOrder(marks) {
  return [...marks].sort((a, b) => layer(a) - layer(b))
}
