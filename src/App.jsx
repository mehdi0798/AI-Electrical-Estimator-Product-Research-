import { useEffect, useRef, useState } from 'react'
import './App.css'
import ITEM_TYPES from './config/item_types.json'
import FEATURES from './config/features.json'
import { getLogContext, logEvent, setLogContext } from './lib/logger'
import { nextAddId } from './lib/addIds'
import {
  clearSession,
  loadSession,
  loadSheetState,
  savePosition,
  saveSheetState,
  startSavedSession,
} from './lib/sessionStore'

// v0.1 — Step 5: session flow.
//   Start screen (participant A/B + session label) → practice → the six sheets
//   in participant order → between-sheets screen → end screen. Submit opens a
//   confirm dialog. Logs session_started, sheet_opened, submitted, confirmed,
//   cancelled on top of the step-4 logger.
//
// The review UI (steps 1–4: drawing, ranked list, accept/reject, add-missing,
// live bid) is unchanged — it moved verbatim into <ReviewScreen>, mounted with
// key={sheetId} so every per-sheet piece of state resets cleanly between sheets.

const euro = (n) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(n)

// Dropdown types + unit-price lookup (single source of truth, CLAUDE.md data layout).
const PRICE_BY_TYPE = Object.fromEntries(ITEM_TYPES.map((t) => [t.type, t.unit_price]))

// Sheet order per CLAUDE.md: practice first, then A = 1→6, B = 6→1.
const REAL_SHEETS = ['sheet1', 'sheet2', 'sheet3', 'sheet4', 'sheet5', 'sheet6']
const sheetOrder = (participant) =>
  participant === 'B'
    ? ['practice', ...[...REAL_SHEETS].reverse()]
    : ['practice', ...REAL_SHEETS]

export default function App() {
  // Flow phases: 'start' | 'resume' | 'review' | 'between' | 'end'.
  // An unfinished saved session (features.resume) opens on the 'resume' screen.
  const [saved, setSaved] = useState(() => (FEATURES.resume ? loadSession() : null))
  const [phase, setPhase] = useState(() => (saved ? 'resume' : 'start'))
  const [order, setOrder] = useState([]) // sheet ids in participant order
  const [index, setIndex] = useState(0) // position within `order`
  // The sheet that was resumed into: its mount logs session_resumed, not sheet_opened.
  const [resumedSheet, setResumedSheet] = useState(null)

  // Begin the session: set the logging context, log session_started, open the
  // first sheet (practice).
  const startSession = (participant, sessionLabel) => {
    setLogContext({ participant, session_label: sessionLabel })
    logEvent({ action: 'session_started', new_value: participant })
    const newOrder = sheetOrder(participant)
    if (FEATURES.resume) {
      startSavedSession({ session_label: sessionLabel, participant, order: newOrder })
    }
    setOrder(newOrder)
    setIndex(0)
    setPhase('review')
  }

  // Continue a saved session where it stopped (same browser).
  const resumeSession = () => {
    const s = saved
    setLogContext({ participant: s.participant, session_label: s.session_label, sheet: s.order[s.index] })
    logEvent({ action: 'session_resumed', item_id: s.order[s.index], new_value: s.phase })
    setOrder(s.order)
    setIndex(s.index)
    setResumedSheet(s.phase === 'review' ? s.order[s.index] : null)
    setSaved(null)
    setPhase(s.phase)
  }

  // Drop a saved session and go to the start screen. Logged against the old
  // session so the log shows it was abandoned here.
  const discardSession = () => {
    const s = saved
    setLogContext({ participant: s.participant, session_label: s.session_label, sheet: s.order[s.index] })
    logEvent({ action: 'session_discarded', item_id: s.order[s.index], new_value: s.phase })
    setLogContext({ participant: null, session_label: null, sheet: 'practice' })
    clearSession()
    setSaved(null)
    setPhase('start')
  }

  // A sheet was confirmed. Advance: more sheets → between screen, else → end.
  const onSheetConfirmed = () => {
    if (index + 1 < order.length) {
      if (FEATURES.resume) savePosition({ index, phase: 'between' })
      setPhase('between')
    } else {
      if (FEATURES.resume) clearSession() // finished: nothing to resume
      setPhase('end')
    }
  }

  const continueToNext = () => {
    if (FEATURES.resume) savePosition({ index: index + 1, phase: 'review' })
    setIndex((i) => i + 1)
    setPhase('review')
  }

  if (phase === 'resume') {
    return <ResumeScreen saved={saved} onResume={resumeSession} onDiscard={discardSession} />
  }

  if (phase === 'start') {
    return <StartScreen onStart={startSession} />
  }

  if (phase === 'between') {
    return <BetweenScreen onContinue={continueToNext} />
  }

  if (phase === 'end') {
    return <EndScreen />
  }

  // phase === 'review'
  const sheetId = order[index]
  const isPractice = sheetId === 'practice'
  // k of 6 counts only the real sheets; practice sits at order index 0.
  const headerPosition = isPractice ? 'Practice' : `Sheet ${index} of ${REAL_SHEETS.length}`
  return (
    <ReviewScreen
      key={sheetId}
      sheetId={sheetId}
      headerPosition={headerPosition}
      onConfirmed={onSheetConfirmed}
      resumed={sheetId === resumedSheet}
    />
  )
}

// --- Resume screen (features.resume) ------------------------------------------

function ResumeScreen({ saved, onResume, onDiscard }) {
  const sheetId = saved.order[saved.index]
  const where =
    sheetId === 'practice'
      ? 'Practice sheet'
      : `Sheet ${saved.index} of ${REAL_SHEETS.length}`
  return (
    <div className="screen">
      <div className="card">
        <h1 className="card-title">Unfinished session</h1>
        <p className="card-sub">
          Session {saved.session_label} · Participant {saved.participant} · {where}
          {saved.phase === 'between' ? ' (done)' : ''}
        </p>
        <button type="button" className="btn primary wide" onClick={onResume}>
          Resume session
        </button>
        <button type="button" className="btn ghost wide" onClick={onDiscard}>
          Discard and start new
        </button>
        <p className="card-hint">Everything already done in this session stays logged.</p>
      </div>
    </div>
  )
}

// --- Start screen -----------------------------------------------------------

function StartScreen({ onStart }) {
  const [participant, setParticipant] = useState('A')
  const [sessionLabel, setSessionLabel] = useState('')
  const canStart = sessionLabel.trim().length > 0

  return (
    <div className="screen">
      <div className="card">
        <h1 className="card-title">Voltra Takeoff</h1>
        <p className="card-sub">Session setup</p>

        <label className="field">
          <span>Participant</span>
          <select value={participant} onChange={(e) => setParticipant(e.target.value)}>
            <option value="A">A — sheets 1 → 6</option>
            <option value="B">B — sheets 6 → 1</option>
          </select>
        </label>

        <label className="field">
          <span>Session label</span>
          <input
            type="text"
            value={sessionLabel}
            placeholder="e.g. pilot1, real"
            onChange={(e) => setSessionLabel(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="btn primary wide"
          disabled={!canStart}
          onClick={() => onStart(participant, sessionLabel.trim())}
        >
          Start session
        </button>
        <p className="card-hint">Practice sheet first, then the six study sheets.</p>
      </div>
    </div>
  )
}

// --- Between-sheets screen --------------------------------------------------

function BetweenScreen({ onContinue }) {
  return (
    <div className="screen">
      <div className="card">
        <h1 className="card-title">Sheet done.</h1>
        <p className="card-sub">Click Continue when ready.</p>
        <button type="button" className="btn primary wide" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  )
}

// --- End screen -------------------------------------------------------------

function EndScreen() {
  return (
    <div className="screen">
      <div className="card">
        <h1 className="card-title">Session complete.</h1>
        <p className="card-sub">Thank you.</p>
      </div>
    </div>
  )
}

// --- Analyse panel (features.analyseAnimation) ---------------------------------
// Shown in the list pane until detection "finishes". Nothing is drawn on the
// drawing (Hard rule 3), and no count is shown before the list itself.

function AnalysePanel({ running, durationMs, onAnalyse }) {
  return (
    <div className="analyse-panel">
      {running ? (
        <div className="analyse-running" role="status" aria-live="polite">
          <div className="analyse-spinner" aria-hidden="true" />
          <div className="analyse-title">Detecting symbols…</div>
          <div className="analyse-track" aria-hidden="true">
            <div className="analyse-fill" style={{ animationDuration: `${durationMs}ms` }} />
          </div>
        </div>
      ) : (
        <div className="analyse-idle">
          <div className="analyse-title">Drawing loaded</div>
          <p className="analyse-text">Run the analysis to detect electrical symbols on this sheet.</p>
          <button type="button" className="btn primary" onClick={onAnalyse}>
            Analyse drawing
          </button>
        </div>
      )}
    </div>
  )
}

// --- Review screen (steps 1–4, now one sheet at a time) ---------------------

function ReviewScreen({ sheetId, headerPosition, onConfirmed, resumed = false }) {
  const [sheet, setSheet] = useState(null)
  const [error, setError] = useState(null)
  // features.resume: this sheet's saved state, if any (read once on mount).
  const [savedSheet] = useState(() => (FEATURES.resume ? loadSheetState(sheetId) : null))

  // Row status map: { [item.id]: 'accepted' | 'rejected' }.
  // Untouched rows have NO entry (undefined) and still count in the bid total.
  const [statuses, setStatuses] = useState(() => savedSheet?.statuses ?? {})
  // Row highlight — visual only in v0.1 (does nothing on the drawing).
  const [selectedId, setSelectedId] = useState(null)

  // --- Add missing item (step 3) ---
  // Placement mode and normal row-click/highlight are MUTUALLY EXCLUSIVE:
  // while placing, the drawing captures the click and row highlight is suppressed.
  const [placing, setPlacing] = useState(false)
  // Draft pin awaiting the popover's Confirm/Cancel. { x, y } in ORIGINAL IMAGE PIXELS.
  const [draft, setDraft] = useState(null)
  const [draftType, setDraftType] = useState(ITEM_TYPES[0].type)
  const [draftRoom, setDraftRoom] = useState('')
  // Confirmed additions, shown in "Your Additions" (NOT sorted into the ranked list).
  const [additions, setAdditions] = useState(() => savedSheet?.additions ?? [])
  const imgRef = useRef(null)
  // Re-render once the drawing has loaded so dots can be placed (restored
  // additions exist before the image does).
  const [, setImgLoaded] = useState(false)

  // features.analyseAnimation: the list is revealed only after an "Analyse
  // drawing" step. 'idle' -> 'running' -> 'done'. With the flag off it starts
  // 'done', i.e. exactly as v0.1. A resumed sheet that was analysed stays done.
  const [analysis, setAnalysis] = useState(() =>
    !FEATURES.analyseAnimation || savedSheet?.analysed ? 'done' : 'idle',
  )
  const analysisTimer = useRef(null)
  useEffect(() => () => clearTimeout(analysisTimer.current), [])

  // features.resume: keep this sheet's state saved so a reload can restore it.
  useEffect(() => {
    if (FEATURES.resume) {
      saveSheetState(sheetId, { statuses, additions, analysed: analysis === 'done' })
    }
  }, [sheetId, statuses, additions, analysis])

  // Submit → confirm dialog (step 5).
  const [confirming, setConfirming] = useState(false)

  // Load this sheet. Point the logger at it FIRST so sheet_opened and every
  // later row event carry the right sheet id (practice logs sheet = 'practice').
  // The cleanup flag makes this log sheet_opened exactly once: in dev, StrictMode
  // runs the effect twice, and only the surviving run may log.
  useEffect(() => {
    let cancelled = false
    setLogContext({ sheet: sheetId })
    fetch(`/sheets/${sheetId}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load sheet (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setSheet(data)
        // A resumed sheet was already opened; session_resumed was logged instead.
        if (!resumed) logEvent({ action: 'sheet_opened', item_id: data.id })
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [sheetId])

  // Escape exits placement mode (and clears any draft pin). Logs nothing.
  useEffect(() => {
    if (!placing && !draft) return
    const onKey = (e) => {
      if (e.key === 'Escape') cancelPlacement()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const changeStatus = (id, target) => {
    // Log from the handler, NOT from inside the setStatuses updater: StrictMode
    // runs updaters twice in dev, which logged every status change twice.
    const old = statuses[id] // old_value for logging: 'accepted' | 'rejected' | undefined
    const next = old === target ? undefined : target // new_value
    logEvent({
      // The new status when set; when toggled back to untouched, the status undone.
      action: next ?? old,
      item_id: id,
      old_value: old ?? null,
      new_value: next ?? null,
    })
    setStatuses((prev) => {
      const updated = { ...prev }
      if (next === undefined) {
        delete updated[id]
      } else {
        updated[id] = next
      }
      return updated
    })
  }

  // Enter placement mode. Clears row highlight so the two modes can't overlap.
  const startPlacement = () => {
    setSelectedId(null)
    setDraft(null)
    setPlacing(true)
  }

  // Exit placement mode without adding (Cancel button or Escape). Logs nothing.
  const cancelPlacement = () => {
    setPlacing(false)
    setDraft(null)
    setDraftRoom('')
  }

  // Click on the drawing while placing: capture it as the pin, convert to
  // ORIGINAL IMAGE PIXELS (Hard rule 7), open the popover. Suppresses highlight.
  const handleDrawingClick = (e) => {
    if (!placing) return
    const img = imgRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    // Image is shown at native size, but scale defensively so coords are always
    // naturalWidth/naturalHeight-based regardless of any future rendered sizing.
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    setDraft({ x, y })
    setDraftType(ITEM_TYPES[0].type)
    setDraftRoom('')
  }

  // Confirm the popover: append a row to "Your Additions", log add_missing.
  const confirmAddition = () => {
    if (!draft) return
    const { session_label, participant } = getLogContext()
    const id = nextAddId(sheet.id, { sessionLabel: session_label, participant })
    const addition = {
      id,
      type: draftType,
      room: draftRoom.trim(),
      x: draft.x,
      y: draft.y,
      unit_price: PRICE_BY_TYPE[draftType] ?? 0,
    }
    setAdditions((prev) => [...prev, addition])
    logEvent({
      action: 'add_missing',
      item_id: id,
      x: draft.x,
      y: draft.y,
      new_value: draftType,
    })
    // Leave placement mode after a successful add.
    setPlacing(false)
    setDraft(null)
    setDraftRoom('')
  }

  // Remove a confirmed addition (CLAUDE.md: added rows can be removed, logged).
  const removeAddition = (id) => {
    setAdditions((prev) => prev.filter((a) => a.id !== id))
    logEvent({ action: 'add_removed', item_id: id })
  }

  if (error) {
    return <div className="state">Could not load sheet: {error}</div>
  }
  if (!sheet) {
    return <div className="state">Loading…</div>
  }

  // Hard rule 4: sorted by confidence, highest first; shown in full.
  const items = [...sheet.items].sort((a, b) => b.confidence - a.confidence)

  // Live bid total: sum of unit_price over every detected row that is NOT rejected
  // (untouched rows count) PLUS every confirmed addition.
  const bidTotal =
    items.reduce(
      (sum, item) => (statuses[item.id] === 'rejected' ? sum : sum + item.unit_price),
      0,
    ) + additions.reduce((sum, a) => sum + a.unit_price, 0)

  // Submit → open the confirm dialog, logging the bid in new_value (step 5).
  const submitSheet = () => {
    logEvent({ action: 'submitted', item_id: sheet.id, new_value: bidTotal })
    setConfirming(true)
  }
  const confirmSubmit = () => {
    logEvent({ action: 'confirmed', item_id: sheet.id, new_value: bidTotal })
    setConfirming(false)
    onConfirmed()
  }
  const cancelSubmit = () => {
    logEvent({ action: 'cancelled', item_id: sheet.id, new_value: bidTotal })
    setConfirming(false)
  }

  // features.analyseAnimation: a fixed, identical delay for every participant
  // (clamped to the 3-5 s the design calls for). Presentation only: the list is
  // pre-authored and simply revealed when the timer ends.
  const analysed = analysis === 'done'
  const startAnalysis = () => {
    if (analysis !== 'idle') return
    const ms = Math.min(5000, Math.max(3000, Number(FEATURES.analyseDurationMs) || 4000))
    logEvent({ action: 'analysis_started', item_id: sheet.id, new_value: ms })
    setAnalysis('running')
    analysisTimer.current = setTimeout(() => {
      logEvent({ action: 'analysis_completed', item_id: sheet.id, new_value: items.length })
      setAnalysis('done')
    }, ms)
  }

  // Position the draft pin + addition dots back onto the rendered image using the
  // same natural→rendered ratio (stays correct as the box scrolls/resizes).
  const dotStyle = (pt) => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return { display: 'none' }
    return {
      left: `${(pt.x / img.naturalWidth) * 100}%`,
      top: `${(pt.y / img.naturalHeight) * 100}%`,
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Voltra Takeoff</div>
        <div className="sheet-name">
          {headerPosition} · {sheet.name}
        </div>
        <div className="bid">
          <span className="bid-label">Bid total</span>
          <span className="bid-amount">{analysed ? euro(bidTotal) : '—'}</span>
        </div>
        <button
          type="button"
          className="btn primary submit-btn"
          onClick={submitSheet}
          disabled={!analysed}
        >
          Submit sheet
        </button>
      </header>

      <main className="layout">
        {/* Left: drawing at native size inside a scrollable box (scroll = pan) */}
        <section className="drawing-pane">
          <div className={'drawing-scroll' + (placing ? ' placing' : '')}>
            <div className="drawing-canvas">
              <img
                ref={imgRef}
                className="drawing-img"
                src={sheet.image}
                alt={sheet.name}
                onClick={handleDrawingClick}
                onLoad={() => setImgLoaded(true)}
              />
              {/* Dots ONLY for participant-added items (Hard rule 3). */}
              {additions.map((a) => (
                <span key={a.id} className="map-dot" style={dotStyle(a)} />
              ))}
              {draft && <span className="map-dot draft" style={dotStyle(draft)} />}
            </div>
          </div>
        </section>

        {/* Right: full list, sorted by confidence */}
        <aside className="list-pane">
          {!analysed ? (
            <AnalysePanel
              running={analysis === 'running'}
              durationMs={Math.min(5000, Math.max(3000, Number(FEATURES.analyseDurationMs) || 4000))}
              onAnalyse={startAnalysis}
            />
          ) : (
          <>
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
                  onClick={() => {
                    // Suppress normal highlight while in placement mode.
                    if (placing) return
                    setSelectedId(item.id)
                    logEvent({ action: 'row_clicked', item_id: item.id })
                  }}
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

          {/* Your Additions — appended below the ranked list, never sorted in. */}
          {additions.length > 0 && (
            <div className="additions">
              <div className="additions-header">Your Additions</div>
              <ul className="item-list additions-list">
                {additions.map((a) => (
                  <li className="item-row addition-row" key={a.id}>
                    <div className="item-main">
                      <span className="item-type">{a.type}</span>
                      {a.room && <span className="item-room"> · {a.room}</span>}
                      <span className="added-badge">Added</span>
                    </div>
                    <div className="item-meta">
                      <span className="item-conf">—</span>
                      <span className="item-price">{euro(a.unit_price)}</span>
                      <div className="item-actions">
                        <button
                          type="button"
                          className="act reject"
                          title="Remove"
                          onClick={() => removeAddition(a.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="add-bar">
            <button
              type="button"
              className={'add-btn' + (placing ? ' active' : '')}
              onClick={placing ? cancelPlacement : startPlacement}
            >
              {placing ? 'Cancel' : '+ Add Missing Item'}
            </button>
          </div>
          </>
          )}
        </aside>
      </main>

      {/* Placement banner */}
      {placing && !draft && (
        <div className="placement-banner" role="status">
          Click on the drawing to place the missing item
          <button type="button" className="banner-cancel" onClick={cancelPlacement}>
            Cancel
          </button>
        </div>
      )}

      {/* Popover after a pin is dropped */}
      {draft && (
        <div className="popover-backdrop" onClick={cancelPlacement}>
          <div className="popover" onClick={(e) => e.stopPropagation()}>
            <div className="popover-title">Add missing item</div>
            <label className="field">
              <span>Type</span>
              <select value={draftType} onChange={(e) => setDraftType(e.target.value)}>
                {ITEM_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.type}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Room</span>
              <input
                type="text"
                value={draftRoom}
                placeholder="e.g. Office 101"
                onChange={(e) => setDraftRoom(e.target.value)}
                autoFocus
              />
            </label>
            <div className="popover-actions">
              <button type="button" className="btn ghost" onClick={cancelPlacement}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={confirmAddition}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit confirm dialog (step 5) */}
      {confirming && (
        <div className="popover-backdrop" onClick={cancelSubmit}>
          <div className="popover" onClick={(e) => e.stopPropagation()}>
            <div className="popover-title">Final bid: {euro(bidTotal)}. Confirm?</div>
            <div className="popover-actions">
              <button type="button" className="btn ghost" onClick={cancelSubmit}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={confirmSubmit}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
