import { supabase, isSupabaseConfigured } from './supabase'

// Never-lose event logger (Hard rule 5). The event_log table is the only source
// of scoring, so no event may be dropped:
//
//   1. Every event is written to a localStorage queue FIRST (synchronously).
//   2. A flush inserts queued events into Supabase.
//   3. An event is removed from the queue ONLY after its insert is confirmed.
//   4. The queue is retried on an interval and on page load.
//   5. The UI never awaits the network — logEvent returns immediately.

const QUEUE_KEY = 'voltra_event_queue'
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

// --- localStorage queue helpers (defensive: never throw out of the logger) ---

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // If localStorage is unavailable we cannot persist; the in-flight flush
    // still tries to insert, but we have no durable fallback. Nothing to do.
  }
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
  const queue = readQueue()
  queue.push(entry)
  writeQueue(queue)
  // Fire and forget — the UI never waits on the network.
  void flush()
}

// Insert queued events; remove each from the queue only after Supabase confirms.
export async function flush() {
  if (flushing) return
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
