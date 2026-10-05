// Gesture bookkeeping for zoom and pan logging (v0.3 step 10). Plain functions
// with an injectable clock and timers, so they are tested in Node.
//
// One participant gesture logs exactly ONE event (CLAUDE.md, step 10):
//   - a burst of wheel ticks (ctrl+wheel zoom, or plain-wheel / scrollbar
//     scrolling) ends when no tick has arrived for `quietMs`;
//   - scrolls the app makes itself (re-centring after a zoom, click-to-jump,
//     fit) are not participant pans and are filtered out.

// A debounced gesture. tick(startValue) on every event of the gesture: the value
// from the FIRST tick is kept as the gesture's start. When `quietMs` pass without
// a tick, onEnd(startValue, lastTickTime) is called once. lastTickTime is when the
// gesture really ended (its last tick), used as the event's client_ts.
export function createGesture({
  quietMs = 300,
  onEnd,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = () => Date.now(),
}) {
  let start
  let lastAt
  let active = false
  let timer = null
  const flush = () => {
    if (!active) return
    clearTimer(timer)
    timer = null
    active = false
    const s = start
    start = undefined
    onEnd(s, lastAt)
  }
  return {
    tick(startValue) {
      if (!active) {
        active = true
        start = startValue
      }
      lastAt = now()
      clearTimer(timer)
      timer = setTimer(flush, quietMs)
    },
    flush, // end the gesture now (e.g. when the drawing is unmounted)
    cancel() {
      clearTimer(timer)
      timer = null
      active = false
      start = undefined
    },
    get active() {
      return active
    },
  }
}

// Tells the app's own scrolls from the participant's. expect(target) after the
// app sets a scroll position; scroll events are "programmatic" until the view
// reaches `target` or `ms` pass, whichever comes first. Arrival must be exact
// (tol 0.5 px): a smooth scroll eases out in sub-2 px steps, and those last
// frames are still the app's.
// clear() when the participant shows intent (wheel, scrollbar press, key), so a
// pending expectation can never swallow their own scrolling.
export function createScrollFilter({ tol = 0.5, maxMs = 1500, now = () => Date.now() } = {}) {
  let pending = null // { target, until }
  return {
    expect(target, ms = maxMs) {
      pending = { target, until: now() + ms }
    },
    // Call on each scroll event with the current scroll position.
    isProgrammatic(pos) {
      if (!pending) return false
      if (now() > pending.until) {
        pending = null
        return false
      }
      if (Math.abs(pos.left - pending.target.left) <= tol && Math.abs(pos.top - pending.target.top) <= tol) {
        pending = null // arrived: this is the last event of the app's scroll
      }
      return true
    },
    clear() {
      pending = null
    },
  }
}

// Zoom as logged: an integer percent (100% = one image pixel per screen pixel).
export const zoomPercent = (zoom) => Math.round(zoom * 100)
