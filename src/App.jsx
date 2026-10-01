import { useEffect, useState } from 'react'
import './App.css'

// v0.1 — Step 1 only: load the practice sheet and render the Review screen.
// Drawing on the left (scrollable, native size, no zoom, no boxes),
// full item list on the right, sorted by confidence (highest first).
// Display only — no accept/reject, no bid total, no logging yet.

const euro = (n) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n)

export default function App() {
  const [sheet, setSheet] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/sheets/practice.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load sheet (${res.status})`)
        return res.json()
      })
      .then(setSheet)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <div className="state">Could not load sheet: {error}</div>
  }
  if (!sheet) {
    return <div className="state">Loading…</div>
  }

  // Hard rule 4: sorted by confidence, highest first; shown in full.
  const items = [...sheet.items].sort((a, b) => b.confidence - a.confidence)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Voltra Takeoff</div>
        <div className="sheet-name">Practice · {sheet.name}</div>
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
            {items.map((item) => (
              <li className="item-row" key={item.id}>
                <div className="item-main">
                  <span className="item-type">{item.type}</span>
                  <span className="item-room"> · {item.room}</span>
                </div>
                <div className="item-meta">
                  <span className="item-conf">
                    {Math.round(item.confidence * 100)}%
                  </span>
                  <span className="item-price">{euro(item.unit_price)}</span>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </div>
  )
}
