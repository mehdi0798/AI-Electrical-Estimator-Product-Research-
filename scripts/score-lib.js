// Pure scoring logic for the study. No file or network access here, so it can be
// tested with plain data. scripts/score.js is the CLI wrapper.
//
// Input events are rows of the Supabase `event_log` table (see
// supabase/migrations/0001_event_log.sql). Answer keys come from answer-key/.
// This file is run locally by the researcher and is never bundled into the
// participant app (Hard rule 6).

// --- CSV parsing -------------------------------------------------------------

// Minimal RFC-4180 parser: quoted fields, "" escapes, commas and newlines inside
// quotes, CRLF or LF, optional UTF-8 BOM. Returns an array of string arrays.
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

const REQUIRED_COLUMNS = [
  'session_label',
  'participant',
  'sheet',
  'action',
  'item_id',
  'x',
  'y',
  'old_value',
  'new_value',
  'client_ts',
]

const blankToNull = (s) => (s === undefined || s === '' ? null : s)
const numOrNull = (s) => {
  const v = blankToNull(s)
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// CSV text -> event objects (in file order). Throws if a required column is missing.
export function parseEvents(csvText) {
  const rows = parseCsv(csvText)
  if (rows.length === 0) throw new Error('CSV is empty')
  const header = rows[0].map((h) => h.trim())
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c))
  if (missing.length) {
    throw new Error(`CSV is missing required column(s): ${missing.join(', ')}`)
  }
  const col = Object.fromEntries(header.map((h, i) => [h, i]))
  return rows.slice(1).map((r, n) => ({
    row: n + 2, // 1-based line number in the file, for messages
    session: blankToNull(r[col.session_label]),
    participant: blankToNull(r[col.participant]),
    sheet: blankToNull(r[col.sheet]),
    action: blankToNull(r[col.action]),
    item_id: blankToNull(r[col.item_id]),
    x: numOrNull(r[col.x]),
    y: numOrNull(r[col.y]),
    old_value: blankToNull(r[col.old_value]),
    new_value: blankToNull(r[col.new_value]),
    client_ts: numOrNull(r[col.client_ts]),
  }))
}

// --- Cleaning and run-level checks ------------------------------------------

// Drop rows that are exact duplicates of an earlier row: same session, participant,
// sheet, action, item_id, x, y, old_value, new_value AND client_ts. (The row id and
// server_ts are not compared.) Rows that differ even by 1 ms in client_ts are kept.
export function dedupeEvents(events) {
  const seen = new Set()
  const kept = []
  for (const e of events) {
    const key = JSON.stringify([
      e.session, e.participant, e.sheet, e.action, e.item_id,
      e.x, e.y, e.old_value, e.new_value, e.client_ts,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(e)
  }
  return { events: kept, dropped: events.length - kept.length }
}

// Session labels present in the events, with event counts. A blank label shows as "(blank)".
export function sessionLabelCounts(events) {
  const counts = new Map()
  for (const e of events) {
    const label = e.session ?? '(blank)'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// Message for `--session X` when X matches no events.
export function noSessionMessage(session, events) {
  const lines = [`no events found for session label ${JSON.stringify(session)}.`]
  const counts = sessionLabelCounts(events)
  lines.push('Session labels in this file:')
  if (counts.length === 0) lines.push('  (the file has no events)')
  for (const c of counts) lines.push(`  ${c.label}  (${c.count} events)`)
  lines.push('No output written.')
  return lines.join('\n')
}

// Message for when events were found but no sheet could be scored (only practice,
// or only sheets with no answer key).
export function nothingScoredMessage({ session, events, keys }) {
  const selected = session !== null ? events.filter((e) => e.session === session) : events
  const sheets = [...new Set(selected.map((e) => e.sheet ?? '(blank)'))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const describe = (s) =>
    s === 'practice' ? 'practice (never scored)' : keys.has(s) ? s : `${s} (no answer key)`
  const scope = session !== null ? `session ${JSON.stringify(session)}` : 'this file'
  return [
    `${scope} has ${selected.length} events but no sheet could be scored.`,
    `Sheets seen: ${sheets.map(describe).join(', ') || '(none)'}`,
    `Answer keys loaded for: ${[...keys.keys()].sort().join(', ') || '(none)'}`,
    'No output written.',
  ].join('\n')
}

// Run-level warnings: a session_started logged more than once for the same session
// and participant means the session was restarted, reloaded, or open in two tabs, so
// events from separate runs are mixed together.
export function runWarnings(events, { session = null } = {}) {
  const starts = new Map()
  for (const e of events) {
    if (e.action !== 'session_started') continue
    if (session !== null && e.session !== session) continue
    const k = JSON.stringify([e.session, e.participant])
    starts.set(k, (starts.get(k) ?? 0) + 1)
  }
  const out = []
  for (const [k, n] of starts) {
    if (n <= 1) continue
    const [s, p] = JSON.parse(k)
    out.push(
      `session ${s ?? '(blank)'} | participant ${p ?? '(blank)'}: session_started logged ${n} times ` +
        '(restart, reload or a second tab; events from separate runs are mixed)',
    )
  }
  return out
}

// --- Config and key validation ----------------------------------------------

// RADIUS has no default in code: it must be set in scoring.config.json.
export function validateConfig(cfg) {
  const r = cfg?.radius
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) {
    throw new Error(
      'scoring config must contain a positive numeric "radius" (image pixels); got ' +
        JSON.stringify(r),
    )
  }
  return { radius: r }
}

export function validateKey(key, label) {
  if (!key || !Array.isArray(key.manipulations)) {
    throw new Error(`${label}: answer key must have a "manipulations" array`)
  }
  const seen = new Set()
  for (const m of key.manipulations) {
    if (!m.id) throw new Error(`${label}: manipulation without an id`)
    if (seen.has(m.id)) throw new Error(`${label}: duplicate manipulation id ${m.id}`)
    seen.add(m.id)
    if (m.direction !== 'UNDER' && m.direction !== 'OVER') {
      throw new Error(`${label}: ${m.id} has direction ${JSON.stringify(m.direction)}`)
    }
    if (
      m.direction === 'UNDER' &&
      !(Number.isFinite(m.x) && Number.isFinite(m.y))
    ) {
      throw new Error(`${label}: UNDER ${m.id} needs numeric x and y`)
    }
  }
  return key
}

// --- Scoring one sheet -------------------------------------------------------

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)

// Score one participant's events on one sheet.
//   events: that participant/session/sheet's events (any order; sorted here)
//   key:    the sheet's answer key { manipulations: [...] }
//   radius: image pixels
//
// Answer-key convention: an OVER manipulation's `id` is the phantom row's item id
// in the list; an UNDER manipulation's `id` is the deleted item's id (it has no
// row, so it never appears in the log).
export function scoreSheet(events, key, radius) {
  // Order by client timestamp; Array.sort is stable, so ties keep file order.
  const ordered = [...events].sort(
    (a, b) => (a.client_ts ?? 0) - (b.client_ts ?? 0),
  )

  const warnings = []

  // Final status per list row. Replay new_value, NOT the action name: toggling a
  // status off logs action 'rejected' (the status undone) with new_value null.
  const finalStatus = new Map() // item_id -> 'accepted' | 'rejected' (absent = untouched)
  // add_missing records, in order. add_removed marks the latest live add with that id.
  const adds = []
  let opened = 0
  let resumed = 0
  let confirmedBid = null
  let confirmedCount = 0
  let prevAction = null

  for (const e of ordered) {
    switch (e.action) {
      case 'sheet_opened':
        // A resume (features.resume) logs session_resumed instead of sheet_opened.
        // Defensively, an open right after a resume is not counted as a re-open.
        if (prevAction !== 'session_resumed') opened++
        break
      case 'session_resumed':
        resumed++
        break
      case 'accepted':
      case 'rejected':
        if (e.item_id) {
          if (e.new_value === 'accepted' || e.new_value === 'rejected') {
            finalStatus.set(e.item_id, e.new_value)
          } else {
            finalStatus.delete(e.item_id) // toggled back to untouched
          }
        }
        break
      case 'add_missing':
        adds.push({ id: e.item_id, x: e.x, y: e.y, type: e.new_value, removed: false })
        break
      case 'add_removed': {
        const live = [...adds].reverse().find((a) => a.id === e.item_id && !a.removed)
        if (live) live.removed = true
        else warnings.push(`add_removed for ${e.item_id} with no matching add (row ${e.row})`)
        break
      }
      case 'confirmed': {
        confirmedCount++
        const n = Number(e.new_value)
        confirmedBid = e.new_value !== null && Number.isFinite(n) ? n : null
        break
      }
      default:
        break // row_clicked, submitted, cancelled, session_started: not scored
    }
    prevAction = e.action
  }

  if (opened > 1) {
    warnings.push(`sheet opened ${opened} times (page reload?) - check this session by hand`)
  }
  const addUses = new Map()
  for (const a of adds) addUses.set(a.id, (addUses.get(a.id) ?? 0) + 1)
  for (const [id, n] of addUses) {
    if (n > 1) {
      warnings.push(
        `${id} used by ${n} add_missing events (id reused: two tabs or a restart); ` +
          'each is scored, but an add_removed may match the wrong one',
      )
    }
  }
  if (confirmedCount === 0) warnings.push('sheet was never confirmed')

  // --- OVER: phantom caught iff its final status is rejected ---
  const overs = key.manipulations
    .filter((m) => m.direction === 'OVER')
    .map((m) => ({ m, caught: finalStatus.get(m.id) === 'rejected' }))

  // --- UNDER: match live adds to deleted items, one-to-one, nearest pair first ---
  const unders = key.manipulations.filter((m) => m.direction === 'UNDER')
  const liveAdds = adds.filter((a) => !a.removed)

  const pairs = []
  liveAdds.forEach((a, ai) => {
    unders.forEach((u, ui) => {
      const d = dist(a.x, a.y, u.x, u.y)
      if (d <= radius) pairs.push({ ai, ui, d })
    })
  })
  pairs.sort((p, q) => p.d - q.d || p.ai - q.ai || p.ui - q.ui)
  const addMatch = new Map() // live-add index -> under index
  const underMatch = new Map() // under index -> live-add index
  for (const p of pairs) {
    if (addMatch.has(p.ai) || underMatch.has(p.ui)) continue
    addMatch.set(p.ai, p.ui)
    underMatch.set(p.ui, p.ai)
  }

  // Per-add report. Distance to the nearest deleted item is reported for every
  // live add (matched or not) and, for removed adds, for completeness.
  const addReport = adds.map((a) => {
    let nearest = null
    for (const u of unders) {
      const d = dist(a.x, a.y, u.x, u.y)
      if (nearest === null || d < nearest.d) nearest = { id: u.id, d }
    }
    const liveIdx = a.removed ? -1 : liveAdds.indexOf(a)
    const matchedIdx = liveIdx >= 0 ? addMatch.get(liveIdx) : undefined
    return {
      id: a.id,
      x: a.x,
      y: a.y,
      type: a.type,
      removed: a.removed,
      nearestId: nearest?.id ?? null,
      nearestDist: nearest?.d ?? null,
      matchedId: matchedIdx !== undefined ? unders[matchedIdx].id : null,
      // Within radius of a deleted item that a nearer add already claimed.
      duplicateOf:
        liveIdx >= 0 && matchedIdx === undefined
          ? (pairs.find((p) => p.ai === liveIdx)
              ? unders[pairs.find((p) => p.ai === liveIdx).ui].id
              : null)
          : null,
    }
  })

  const underResults = unders.map((u, ui) => ({
    m: u,
    caught: underMatch.has(ui),
    byAdd: underMatch.has(ui) ? liveAdds[underMatch.get(ui)].id : null,
  }))

  const phantomIds = new Set(overs.map((o) => o.m.id))
  const realRejected = [...finalStatus.entries()]
    .filter(([id, s]) => s === 'rejected' && !phantomIds.has(id))
    .map(([id]) => id)

  return {
    overs,
    unders: underResults,
    addReport,
    unmatchedAdds: addReport.filter((a) => !a.removed && a.matchedId === null),
    realRejected,
    confirmedBid,
    resumed,
    warnings,
  }
}

// --- Whole run ---------------------------------------------------------------

// Group events by (session, participant, sheet) and score every real sheet that
// has an answer key. `keys` is a Map of sheet id -> key. Practice is skipped.
export function scoreAll(events, keys, radius, { session = null } = {}) {
  const groups = new Map()
  for (const e of events) {
    if (!e.sheet || e.sheet === 'practice') continue
    if (session !== null && e.session !== session) continue
    const gk = JSON.stringify([e.session, e.participant, e.sheet])
    if (!groups.has(gk)) groups.set(gk, [])
    groups.get(gk).push(e)
  }

  const results = []
  const skipped = []
  for (const [gk, evs] of groups) {
    const [sess, participant, sheet] = JSON.parse(gk)
    const key = keys.get(sheet)
    if (!key) {
      skipped.push({ session: sess, participant, sheet })
      continue
    }
    results.push({ session: sess, participant, sheet, ...scoreSheet(evs, key, radius) })
  }
  // Stable, readable order.
  results.sort(
    (a, b) =>
      String(a.session).localeCompare(String(b.session)) ||
      String(a.participant).localeCompare(String(b.participant)) ||
      a.sheet.localeCompare(b.sheet, undefined, { numeric: true }),
  )
  return { results, skipped }
}

// --- Output ------------------------------------------------------------------

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// One row per manipulation per scored sheet.
export function manipulationsCsv(results) {
  const header = [
    'participant',
    'session',
    'sheet',
    'manipulation_id',
    'direction',
    'pair_id',
    'cost',
    'caught',
  ]
  const lines = [header.join(',')]
  for (const r of results) {
    for (const o of [...r.overs, ...r.unders]) {
      const m = o.m
      lines.push(
        [r.participant, r.session, r.sheet, m.id, m.direction, m.pair_id, m.cost, o.caught]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return lines.join('\n') + '\n'
}

const px = (d) => (d === null ? 'n/a' : `${d.toFixed(1)}px`)

// Human-readable report for the terminal.
export function formatReport(results, skipped, radius, { dropped = 0, runWarnings = [] } = {}) {
  const out = []
  out.push(`Scoring radius: ${radius} image pixels (from scoring config)`)
  out.push(`Exact duplicate rows dropped: ${dropped}`)
  if (runWarnings.length) {
    out.push('Run warnings:')
    for (const w of runWarnings) out.push(`  WARNING: ${w}`)
  }
  out.push('')

  let overCaught = 0
  let overTotal = 0
  let underCaught = 0
  let underTotal = 0

  for (const r of results) {
    out.push(`== session ${r.session} | participant ${r.participant} | ${r.sheet} ==`)
    out.push(
      r.confirmedBid === null
        ? '  Final confirmed bid: none (not confirmed)'
        : `  Final confirmed bid: EUR ${r.confirmedBid.toFixed(2)}`,
    )

    const oc = r.overs.filter((o) => o.caught).length
    const uc = r.unders.filter((u) => u.caught).length
    overCaught += oc
    overTotal += r.overs.length
    underCaught += uc
    underTotal += r.unders.length

    out.push(`  OVER caught ${oc}/${r.overs.length}`)
    for (const o of r.overs) {
      out.push(`    ${o.m.id}  ${o.caught ? 'CAUGHT (rejected)' : 'missed'}`)
    }
    out.push(`  UNDER caught ${uc}/${r.unders.length}`)
    for (const u of r.unders) {
      out.push(`    ${u.m.id}  ${u.caught ? `CAUGHT by ${u.byAdd}` : 'missed'}`)
    }

    out.push(`  add_missing clicks (${r.addReport.length}):`)
    if (r.addReport.length === 0) out.push('    none')
    for (const a of r.addReport) {
      const near =
        a.nearestId === null
          ? 'no deleted items on this sheet'
          : `nearest deleted ${a.nearestId} at ${px(a.nearestDist)}`
      let verdict
      if (a.removed) verdict = 'removed by participant (not scored)'
      else if (a.matchedId) verdict = `-> matched ${a.matchedId}`
      else if (a.duplicateOf) verdict = `-> no match (${a.duplicateOf} already caught by a nearer add)`
      else verdict = '-> no match (outside radius)'
      out.push(`    ${a.id} at (${a.x}, ${a.y})  ${near}  ${verdict}`)
    }

    if (r.resumed) out.push(`  Resumed after reload: ${r.resumed} time(s) (state restored, not a warning)`)
    out.push(`  Real items rejected: ${r.realRejected.length}`)
    out.push(`  add_missing matching no deleted item: ${r.unmatchedAdds.length}`)
    for (const w of r.warnings) out.push(`  WARNING: ${w}`)
    out.push('')
  }

  for (const s of skipped) {
    out.push(
      `Skipped (no answer key): session ${s.session} | participant ${s.participant} | ${s.sheet}`,
    )
  }
  if (skipped.length) out.push('')

  out.push('Totals across all scored sheets')
  out.push(`  OVER caught:  ${overCaught}/${overTotal}`)
  out.push(`  UNDER caught: ${underCaught}/${underTotal}`)
  return out.join('\n') + '\n'
}
