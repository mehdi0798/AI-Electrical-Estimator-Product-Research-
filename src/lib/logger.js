import { supabase, isSupabaseConfigured } from './supabase'

// Never-lose event logger (Hard rule 5). The event_log table is the only source
// of scoring, so no event may be dropped:
//
//   1. Every event is written to a localStorage queue FIRST (synchronously).
//   2. A flush inserts queued events into Supabase.
//   3. An event is removed from the queue ONLY after its insert is confirmed.
//   4. The queue is retried on an interval and on page load.
//   5. The UI never awaits the network — logEvent returns immediately.
//   6. No event is ever SENT without participant and session_label. An event
//      missing either (refused at logEvent, or found in the queue left over from
//      an older build) is moved to a quarantine key: kept for the researcher to
//      inspect, never sent, never discarded.

const QUEUE_KEY = 'voltra_event_queue'
const QUARANTINE_KEY = 'voltra_event_quarantine'
const RETRY_MS = 4000
const TABLE = 'event_log'

// The DB columns we send. Anything else on a queued entry (e.g. _qid) is local
// bookkeeping and must be stripped before insert — PostgREST rejects unknown
// columns.
const ROW_FIELDS = [
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

// Shared context merged into every event. Step 5's start screen fills
// participant / session_label via setLogContext; practice logs with sheet =
// 'practice' per the spec until then.
let context = {
  session_label: null,
  participant: null,
  sheet: 'practice',
}

let flushing = false
let intervalStarted = false

export function setLogContext(partial) {
  context = { ...context, ...partial }
}

export function getLogContext() {
  return context
}

// --- localStorage helpers (defensive: never throw out of the logger) ---

function readList(key) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // If localStorage is unavailable we cannot persist; the in-flight flush
    // still tries to insert, but we have no durable fallback. Nothing to do.
  }
}

const readQueue = () => readList(QUEUE_KEY)
const writeQueue = (queue) => writeList(QUEUE_KEY, queue)

const lacksContext = (entry) => !entry.participant || !entry.session_label

// Park entries that must not be sent. They stay in localStorage, stamped with
// why, so nothing is ever lost.
function quarantine(entries, reason) {
  if (entries.length === 0) return
  const stamped = entries.map((e) => ({ ...e, _reason: reason, _quarantined_at: Date.now() }))
  writeList(QUARANTINE_KEY, [...readList(QUARANTINE_KEY), ...stamped])
}

// Move any queued entry that lacks participant or session_label (e.g. left over
// from an older build) into quarantine, so it is never sent and can never block
// a batch insert. Quarantine is written first: if we died in between, the entry
// would exist in both places rather than in neither.
function sweepQueue() {
  const queue = readQueue()
  const bad = queue.filter(lacksContext)
  if (bad.length === 0) return
  quarantine(bad, 'queued without participant or session_label')
  writeQueue(queue.filter((e) => !lacksContext(e)))
}

function newQid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toRow(entry) {
  const row = {}
  for (const key of ROW_FIELDS) {
    if (entry[key] !== undefined) row[key] = entry[key]
  }
  return row
}

// Public API ----------------------------------------------------------------

// Enqueue an event and kick a non-blocking flush. Returns synchronously.
// `partial` carries action + any of item_id/x/y/old_value/new_value/client_ts.
export function logEvent(partial) {
  const entry = {
    _qid: newQid(),
    ...context,
    client_ts: Date.now(),
    ...partial,
  }
  if (lacksContext(entry)) {
    // A programming error under the current flow (the review screen only mounts
    // after the start screen sets the context). Keep the event, never send it.
    // eslint-disable-next-line no-console
    console.error('[logger] event has no participant/session_label; quarantined:', entry)
    quarantine([entry], 'logged without participant or session_label')
    return
  }
  const queue = readQueue()
  queue.push(entry)
  writeQueue(queue)
  // Fire and forget — the UI never waits on the network.
  void flush()
}

// Insert queued events; remove each from the queue only after Supabase confirms.
export async function flush() {
  if (flushing) return
  sweepQueue() // before the configured check, so stale entries are parked either way
  if (!isSupabaseConfigured) return // keep events queued until env is set
  const batch = readQueue()
  if (batch.length === 0) return

  flushing = true
  try {
    const { error } = await supabase.from(TABLE).insert(batch.map(toRow))
    if (error) {
      // Leave the queue intact; the interval / next event retries.
      // eslint-disable-next-line no-console
      console.warn('[logger] insert failed, will retry:', error.message)
      return
    }
    // Success: drop exactly the sent entries. Re-read first, because new events
    // may have been enqueued while the insert was in flight.
    const sent = new Set(batch.map((e) => e._qid))
    writeQueue(readQueue().filter((e) => !sent.has(e._qid)))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[logger] flush threw, will retry:', err?.message ?? err)
  } finally {
    flushing = false
  }
}

// Start the retry loop and attempt an immediate flush of anything left from a
// previous page load. Call once at app startup.
export function startLogger() {
  void flush()
  if (intervalStarted) return
  intervalStarted = true
  setInterval(() => void flush(), RETRY_MS)
  // Opportunistic flushes on reconnect / tab return.
  window.addEventListener('online', () => void flush())
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush()
  })
}
