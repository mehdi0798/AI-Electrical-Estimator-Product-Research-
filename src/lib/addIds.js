// Ids for participant-added items: ADD-<sheet>-<n>.
//
// n comes from a counter kept in localStorage per session + participant + sheet,
// and each call reads, increments and writes it synchronously. So an id is never
// reused across a page reload, a remount, or a second tab of the same session
// (tabs share localStorage). A per-component counter restarted at 1 in every app
// instance, which produced duplicate ids when two tabs were open.
//
// If localStorage is unavailable we fall back to an in-memory counter (unique
// within this page only).

const memoryCounters = new Map()

export function nextAddId(sheetId, { sessionLabel, participant }) {
  const key = `voltra_add_counter:${sessionLabel}|${participant}|${sheetId}`
  let n
  try {
    n = (Number(localStorage.getItem(key)) || 0) + 1
    localStorage.setItem(key, String(n))
  } catch {
    n = (memoryCounters.get(key) ?? 0) + 1
  }
  memoryCounters.set(key, n)
  return `ADD-${sheetId}-${n}`
}
