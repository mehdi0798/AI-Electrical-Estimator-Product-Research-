import { useEffect, useState } from 'react'
import './App.css'

// v0.1 — Step 2: row actions (accept/reject), row highlight, live bid total.
// Builds on step 1 (load practice sheet, drawing left, full list right).
// Still NO logging (step 4), NO add-missing (step 3), NO start/submit screens.

const euro = (n) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n)

export default function App() {
  const [sheet, setSheet] = useState(null)
  const [error, setError] = useState(null)

  // Row status map: { [item.id]: 'accepted' | 'rejected' }.
  // Untouched rows have NO entry (undefined) and still count in the bid total.
  const [statuses, setStatuses] = useState({})
  // Row highlight — visual only in v0.1 (does nothing on the drawing).
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    fetch('/sheets/practice.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load sheet (${res.status})`)
        return res.json()
      })
      .then(setSheet)
      .catch((err) => setError(err.message))
  }, [])

  // Status-change handler. Toggles: clicking the active status clears it back
  // to untouched. Shaped so step 4 can log old -> new here: `prev[id]` is the
  // old value (undefined = untouched) and `next` is the new value, both in
  // scope before the overwrite, with no refactor required.
  const changeStatus = (id, target) => {
    setStatuses((prev) => {
      const old = prev[id] // old_value for logging (step 4): 'accepted' | 'rejected' | undefined
      const next = old === target ? undefined : target // new_value
      // Step 4 will log { item_id: id, old_value: old, new_value: next } right here.
      const updated = { ...prev }
      if (next === undefined) {
        delete updated[id]
      } else {
        updated[id] = next
      }
      return updated
    })
  }

  if (error) {
    return <div className="state">Could not load sheet: {error}</div>
  }
  if (!sheet) {
    return <div className="state">Loading…</div>
  }

  // Hard rule 4: sorted by confidence, highest first; shown in full.
  const items = [...sheet.items].sort((a, b) => b.confidence - a.confidence)

  // Live bid total: sum of unit_price over every row that is NOT rejected.
  // Untouched rows count (Open settings default YES); accepted rows count.
  const bidTotal = items.reduce(
    (sum, item) => (statuses[item.id] === 'rejected' ? sum : sum + item.unit_price),
    0,
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Voltra Takeoff</div>
        <div className="sheet-name">Practice · {sheet.name}</div>
        <div className="bid">
          <span className="bid-label">Bid total</span>
          <span className="bid-amount">{euro(bidTotal)}</span>
        </div>
      </header>

      <main className="layout">
        {/* Left: drawing at native size inside a scrollable box (scroll = pan) */}
        <section className="drawing-pane">
          <div className="drawing-scroll">
            <img className="drawing-img" src={sheet.image} alt={sheet.name} />
          </div>
        </section>

        {/* Right: full list, sorted by confidence */}
        <aside className="list-pane">
          <div className="list-header">
            Detected {items.length} items · Sorted by confidence
          </div>
          <ul className="item-list">
            {items.map((item) => {
              const status = statuses[item.id]
              const isSelected = selectedId === item.id
              return (
                <li
                  className={
                    'item-row' +
                    (isSelected ? ' selected' : '') +
                    (status === 'rejected' ? ' rejected' : '')
                  }
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="item-main">
                    <span className="item-type">{item.type}</span>
                    <span className="item-room"> · {item.room}</span>
                  </div>
                  <div className="item-meta">
                    <span className="item-conf">
                      {Math.round(item.confidence * 100)}%
                    </span>
                    <span className="item-price">{euro(item.unit_price)}</span>
                    <div className="item-actions">
                      <button
                        type="button"
                        className={
                          'act accept' + (status === 'accepted' ? ' active' : '')
                        }
                        aria-pressed={status === 'accepted'}
                        title="Accept"
                        onClick={(e) => {
                          e.stopPropagation()
                          changeStatus(item.id, 'accepted')
                        }}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className={
                          'act reject' + (status === 'rejected' ? ' active' : '')
                        }
                        aria-pressed={status === 'rejected'}
                        title="Reject"
                        onClick={(e) => {
                          e.stopPropagation()
                          changeStatus(item.id, 'rejected')
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </aside>
      </main>
    </div>
  )
}
