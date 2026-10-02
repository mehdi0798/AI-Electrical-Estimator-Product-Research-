// Saved session state for "resume after reload or closed tab" (features.resume).
// Same browser only: the state lives in this origin's localStorage.
//
// Shape:
//   { v, session_label, participant, order, index, phase: 'review' | 'between',
//     sheets: { [sheetId]: { statuses, additions, analysed } } }
//
// Plain functions with an injectable storage so they can be tested in Node.
// Every read/write is defensive: storage failures never break the app.

export const SESSION_KEY = 'voltra_session_state'
const VERSION = 1
const PHASES = ['review', 'between']

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function isValid(s) {
  return (
    s &&
    s.v === VERSION &&
    typeof s.session_label === 'string' &&
    s.session_label !== '' &&
    typeof s.participant === 'string' &&
    s.participant !== '' &&
    Array.isArray(s.order) &&
    s.order.length > 0 &&
    Number.isInteger(s.index) &&
    s.index >= 0 &&
    s.index < s.order.length &&
    PHASES.includes(s.phase) &&
    s.sheets !== null &&
    typeof s.sheets === 'object'
  )
}

// The saved state, or null if there is none or it is unusable.
export function loadSession(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return isValid(s) ? s : null
  } catch {
    return null
  }
}

function write(state, storage) {
  try {
    storage?.setItem(SESSION_KEY, JSON.stringify(state))
  } catch {
    /* storage full or unavailable: resume will not be possible, nothing else breaks */
  }
}

// Start a fresh saved session (overwrites any previous one).
export function startSavedSession({ session_label, participant, order }, storage = defaultStorage()) {
  const state = { v: VERSION, session_label, participant, order, index: 0, phase: 'review', sheets: {} }
  write(state, storage)
  return state
}

// Update position (index/phase) without touching per-sheet state.
export function savePosition({ index, phase }, storage = defaultStorage()) {
  const s = loadSession(storage)
  if (!s) return
  write({ ...s, index, phase }, storage)
}

// Merge a patch into one sheet's saved state.
export function saveSheetState(sheetId, patch, storage = defaultStorage()) {
  const s = loadSession(storage)
  if (!s) return
  write({ ...s, sheets: { ...s.sheets, [sheetId]: { ...s.sheets[sheetId], ...patch } } }, storage)
}

export function loadSheetState(sheetId, storage = defaultStorage()) {
  return loadSession(storage)?.sheets?.[sheetId] ?? null
}

export function clearSession(storage = defaultStorage()) {
  try {
    storage?.removeItem(SESSION_KEY)
  } catch {
    /* nothing to do */
  }
}
