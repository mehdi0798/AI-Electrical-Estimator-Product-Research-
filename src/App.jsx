import { useEffect, useRef, useState } from 'react'
import './App.css'
import CATALOG from './config/catalog.json'
import FEATURES from './config/features.json'
import { getLogContext, logEvent, setLogContext } from './lib/logger'
import { nextAddId } from './lib/addIds'
import { applyEdit, bidTotal as computeBid, catalogIndex, displayItem } from './lib/edits'
import { clientToImage, imageToScreen, jumpBoxRect } from './lib/geometry'
import ZoomableImage from './ZoomableImage'
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

// Catalog lookups for the Type -> Name picker (Edit and Add dialogs). Each name
// has exactly one type and one unit price (src/config/catalog.json, built from
// handoff/catalog.csv). Nothing is hardcoded here.
const CAT = catalogIndex(CATALOG)

// The shared Type -> Name picker. Type only narrows the names; the chosen NAME
// decides the saved type and price. Changing the type picks that type's first name.
function TypeNamePicker({ name, onChange }) {
  const type = CAT.byName.get(name).type
  return (
    <>
      <label className="field">
        <span>Type</span>
        <select value={type} onChange={(e) => onChange(CAT.namesByType.get(e.target.value)[0])} autoFocus>
          {CAT.types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Name</span>
        <select value={name} onChange={(e) => onChange(e.target.value)}>
          {CAT.namesByType.get(type).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}

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

// --- Wordmark (design pass) ------------------------------------------------------

function Wordmark({ large = false }) {
  return (
    <span className={'wordmark' + (large ? ' large' : '')}>
      <span className="wordmark-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.5 2 4.5 13.5h6.2L9.8 22l9.7-12.3h-6.3L13.5 2z" />
        </svg>
      </span>
      <span className="wordmark-text">
        Voltra <b>Takeoff</b>
      </span>
    </span>
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
        <div className="card-brand">
          <Wordmark />
        </div>
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
        <div className="card-brand">
          <Wordmark large />
        </div>
        <h1 className="card-title">Session setup</h1>
        <p className="card-sub">Practice sheet first, then the six study sheets.</p>

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
      </div>
    </div>
  )
}

// --- Between-sheets screen --------------------------------------------------

function BetweenScreen({ onContinue }) {
  return (
    <div className="screen">
      <div className="card">
        <div className="card-brand">
          <Wordmark />
        </div>
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
        <div className="card-brand">
          <Wordmark />
        </div>
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
  const [draftName, setDraftName] = useState(CATALOG[0].name)
  // Confirmed additions, shown in "Your Additions" (NOT sorted into the ranked list).
  const [additions, setAdditions] = useState(() => savedSheet?.additions ?? [])
  // --- Edit (step 6) ---
  // Edits overlay: { [item.id]: name }. The sheet's items are never changed.
  const [edits, setEdits] = useState(() => savedSheet?.edits ?? {})
  // The row being edited ({ id }) and the name picked in the dialog so far.
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState(null)
  // Cancel, Escape or backdrop: no change, no event.
  const cancelEdit = () => {
    setEditing(null)
    setEditName(null)
  }
  const imgRef = useRef(null) // the drawing <img> (inside ZoomableImage)
  const viewerRef = useRef(null) // ZoomableImage: zoom, fit, centring (step 8)

  // Legend panel under the drawing (v0.3 step 12). Every sheet opens with it
  // open (Hard rule 8). Closing unmounts it, so it always reopens at fit width.
  // Only the toggle is logged; legend zoom and scroll are not.
  const [legendOpen, setLegendOpen] = useState(true)
  const legendImgRef = useRef(null)
  const toggleLegend = () => {
    const next = !legendOpen
    logEvent({ action: 'legend_toggled', new_value: next ? 'open' : 'closed' })
    setLegendOpen(next)
  }

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
      saveSheetState(sheetId, { statuses, additions, edits, analysed: analysis === 'done' })
    }
  }, [sheetId, statuses, additions, edits, analysis])

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

  // Escape exits placement mode (and clears any draft pin), or closes the edit
  // dialog without changing anything. Logs nothing.
  useEffect(() => {
    if (!placing && !draft && !editing) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (editing) cancelEdit()
      else cancelPlacement()
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
  }

  // Click on the drawing while placing: capture it as the pin, convert to
  // ORIGINAL IMAGE PIXELS (Hard rule 7), open the popover. Suppresses highlight.
  const handleDrawingClick = (e) => {
    if (!placing) return
    const img = imgRef.current
    if (!img) return
    // naturalWidth/naturalHeight-based at any rendered size or zoom (Hard rule 7).
    const { x, y } = clientToImage({
      clientX: e.clientX,
      clientY: e.clientY,
      imageRect: img.getBoundingClientRect(),
      zoom: viewerRef.current.getZoom(),
    })
    setDraft({ x, y })
    setDraftName(CATALOG[0].name)
  }

  // Confirm the popover: append a row to "Your Additions", log add_missing.
  const confirmAddition = () => {
    if (!draft) return
    const { session_label, participant } = getLogContext()
    const id = nextAddId(sheet.id, { sessionLabel: session_label, participant })
    const addition = {
      id,
      name: draftName,
      type: CAT.byName.get(draftName).type,
      x: draft.x,
      y: draft.y,
      unit_price: CAT.byName.get(draftName).unit_price,
    }
    setAdditions((prev) => [...prev, addition])
    logEvent({
      action: 'add_missing',
      item_id: id,
      x: draft.x,
      y: draft.y,
      new_value: draftName,
    })
    // Leave placement mode after a successful add.
    setPlacing(false)
    setDraft(null)
  }

  // Remove a confirmed addition (CLAUDE.md: added rows can be removed, logged).
  const removeAddition = (id) => {
    setAdditions((prev) => prev.filter((a) => a.id !== id))
    logEvent({ action: 'add_removed', item_id: id })
  }

  if (error) {
    return <div className="state error">Could not load sheet: {error}</div>
  }
  if (!sheet) {
    return (
      <div className="state" role="status">
        <div className="spinner" aria-hidden="true" />
        Loading sheet…
      </div>
    )
  }

  // Hard rule 4: sorted by the ORIGINAL confidence, highest first; shown in full.
  // Edits are applied after sorting and never touch id, x, y or confidence, so an
  // edit cannot move a row or its jump target.
  const items = [...sheet.items]
    .sort((a, b) => b.confidence - a.confidence)
    .map((item) => displayItem(item, edits, CAT.byName))

  // Live bid total: sum of unit_price over every detected row that is NOT rejected
  // (untouched rows count, edited rows at their edited price) PLUS every addition.
  const bidTotal = computeBid(items, statuses, additions)

  // --- Edit (step 6) ---
  const editingItem = editing ? items.find((it) => it.id === editing.id) : null
  const startEdit = (item) => {
    setEditing({ id: item.id })
    setEditName(item.name) // the name shown now
  }
  // Log from the handler, NOT inside a state updater (StrictMode runs updaters
  // twice in dev). A no-op logs nothing. The review status is never touched.
  const confirmEdit = () => {
    const original = sheet.items.find((it) => it.id === editing.id)
    const r = applyEdit({ edits, item: original, newName: editName, byName: CAT.byName })
    if (r) {
      logEvent(r.event)
      setEdits(r.edits)
    }
    cancelEdit()
  }

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

  // features.clickToJump: centre the clicked row's item in the drawing view, at
  // the current zoom (the viewer keeps whatever zoom the participant chose).
  const jumpTo = (item) => viewerRef.current?.centerOn(item.x, item.y)

  // The ONE box on the drawing (Hard rule 3): only the selected row's item, only
  // with features.clickToJump. Derived from selectedId, so there can never be two.
  // It scales with zoom (jumpBoxPx image px) but is never under 24 px on screen.
  const selectedItem = FEATURES.clickToJump ? items.find((it) => it.id === selectedId) : null
  const JUMP_BOX_MIN_SCREEN_PX = 24
  const jumpBoxStyle = (zoom) => {
    const img = imgRef.current
    if (!selectedItem || !img?.naturalWidth) return null
    const r = jumpBoxRect({
      x: selectedItem.x,
      y: selectedItem.y,
      zoom,
      size: Number(FEATURES.jumpBoxPx) || 32,
      minScreen: JUMP_BOX_MIN_SCREEN_PX,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    })
    return r && { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }
  }

  // The draft pin and addition dots, at (x*zoom, y*zoom) via the shared conversion.
  const dotStyle = (pt, zoom) => {
    const p = imageToScreen({ x: pt.x, y: pt.y, zoom })
    return { left: `${p.left}px`, top: `${p.top}px` }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Wordmark />
        </div>
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
        {/* Left: drawing, opened at fit width; zoom, pan (ZoomableImage, step 8);
            legend panel below it (step 12) */}
        <section className="drawing-pane">
          <ZoomableImage
            ref={viewerRef}
            imgRef={imgRef}
            src={sheet.image}
            alt={sheet.name}
            className={'drawing-viewer' + (placing ? ' placing' : '')}
            panDisabled={placing}
            onImageClick={handleDrawingClick}
            onLoad={() => setImgLoaded(true)}
            // Step 10: one event per zoom / pan gesture. item_id = how; x,y = centre
            // of the visible drawing in image px; values = zoom % (integer).
            onZoomChange={(e) =>
              logEvent({
                action: 'zoom_changed', item_id: e.how, x: e.center?.x ?? null, y: e.center?.y ?? null,
                old_value: e.oldPct, new_value: e.newPct, client_ts: e.ts,
              })
            }
            onPan={(e) =>
              logEvent({
                action: 'panned', item_id: e.how, x: e.center?.x ?? null, y: e.center?.y ?? null,
                new_value: e.pct, client_ts: e.ts,
              })
            }
          >
            {(zoom) => {
              const box = jumpBoxStyle(zoom)
              return (
                <>
                  {/* Dots ONLY for participant-added items (Hard rule 3). */}
                  {additions.map((a) => (
                    <span key={a.id} className="map-dot" style={dotStyle(a, zoom)} />
                  ))}
                  {draft && <span className="map-dot draft" style={dotStyle(draft, zoom)} />}
                  {/* Click-to-jump: at most one box, on the selected item only (Hard rule 3). */}
                  {box && <span className="jump-box" style={box} aria-hidden="true" />}
                </>
              )
            }}
          </ZoomableImage>

          {/* Legend: one image for all sheets; zoom and scroll only (no boxes,
              dots or Add missing), nothing logged but the toggle. */}
          <div className={'legend-panel' + (legendOpen ? ' open' : '')}>
            <button
              type="button"
              className="legend-toggle"
              aria-expanded={legendOpen}
              aria-controls="legend-viewer"
              onClick={toggleLegend}
            >
              Legend <span aria-hidden="true">{legendOpen ? '▾' : '▸'}</span>
            </button>
            {legendOpen && (
              <div id="legend-viewer" className="legend-body">
                <ZoomableImage imgRef={legendImgRef} src="/legend.png" alt="Electrical legend" className="legend-viewer" />
              </div>
            )}
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
          <div className="list-columns" aria-hidden="true">
            <span className="col-main">Item · Type</span>
            <span className="col-conf">Conf.</span>
            <span className="col-price">Unit price</span>
            <span className="col-actions">Review</span>
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
                    if (FEATURES.clickToJump) jumpTo(item)
                  }}
                >
                  <div className="item-main">
                    <span className="item-name">{item.name}</span>
                    <span className="item-type"> · {item.type}</span>
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
                      <button
                        type="button"
                        className="act edit"
                        title="Edit"
                        aria-label="Edit"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (placing) return
                          startEdit(item)
                        }}
                      >
                        ✎
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
                      <span className="item-name">{a.name}</span>
                      <span className="item-type"> · {a.type}</span>
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
            {/* Placement hint: in the list column, never over the drawing, so no
                symbol is ever covered while placing. The button below is Cancel. */}
            {placing && !draft && (
              <div className="placement-hint" role="status">
                Click on the drawing to place the missing item
              </div>
            )}
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

      {/* Popover after a pin is dropped */}
      {draft && (
        <div className="popover-backdrop" onClick={cancelPlacement}>
          <div className="popover" onClick={(e) => e.stopPropagation()}>
            <div className="popover-title">Add missing item</div>
            <TypeNamePicker name={draftName} onChange={setDraftName} />
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

      {/* Edit dialog (step 6): same picker as Add missing. */}
      {editingItem && (
        <div className="popover-backdrop" onClick={cancelEdit}>
          <div className="popover" onClick={(e) => e.stopPropagation()}>
            <div className="popover-title">Edit item</div>
            <p className="popover-sub">
              Now: {editingItem.name} · {editingItem.type} · {euro(editingItem.unit_price)}
            </p>
            <TypeNamePicker name={editName} onChange={setEditName} />
            <p className="popover-sub">Unit price: {euro(CAT.byName.get(editName).unit_price)}</p>
            <div className="popover-actions">
              <button type="button" className="btn ghost" onClick={cancelEdit}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={confirmEdit}>
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
