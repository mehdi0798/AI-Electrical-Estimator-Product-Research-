// Tests for the participant app's plain-JS modules in src/lib (no React, no
// browser). Run: node scripts/app-lib.test.js

import assert from 'node:assert/strict'
import {
  SESSION_KEY,
  clearSession,
  loadSession,
  loadSheetState,
  savePosition,
  saveSheetState,
  startSavedSession,
} from '../src/lib/sessionStore.js'
import {
  ZOOM_LEVELS,
  boxPercent,
  clientToImage,
  nextZoom,
  scrollToCenter,
  viewportCenterImage,
} from '../src/lib/geometry.js'

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err) {
    console.error(`  FAIL ${name}`)
    throw err
  }
}

// In-memory stand-in for localStorage.
function fakeStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  }
}
// A storage whose every call throws (private mode, blocked site data).
const brokenStorage = {
  getItem() { throw new Error('blocked') },
  setItem() { throw new Error('blocked') },
  removeItem() { throw new Error('blocked') },
}

const ORDER = ['practice', 'sheet1', 'sheet2']

console.log('sessionStore (features.resume)')

test('nothing saved -> null', () => {
  assert.equal(loadSession(fakeStorage()), null)
})

test('start, then load returns a fresh session at practice', () => {
  const st = fakeStorage()
  startSavedSession({ session_label: 'p1', participant: 'A', order: ORDER }, st)
  const s = loadSession(st)
  assert.equal(s.session_label, 'p1')
  assert.equal(s.participant, 'A')
  assert.deepEqual(s.order, ORDER)
  assert.equal(s.index, 0)
  assert.equal(s.phase, 'review')
  assert.deepEqual(s.sheets, {})
})

test('sheet state and position are saved independently', () => {
  const st = fakeStorage()
  startSavedSession({ session_label: 'p1', participant: 'B', order: ORDER }, st)
  saveSheetState('practice', { statuses: { 'P-1': 'rejected' } }, st)
  saveSheetState('practice', { additions: [{ id: 'ADD-practice-1', x: 5, y: 6 }] }, st)
  savePosition({ index: 1, phase: 'review' }, st)
  saveSheetState('sheet1', { statuses: { 'S1-2': 'accepted' } }, st)
  savePosition({ index: 1, phase: 'between' }, st)

  const s = loadSession(st)
  assert.equal(s.index, 1)
  assert.equal(s.phase, 'between')
  // patches merge; a position save never drops sheet state
  assert.deepEqual(loadSheetState('practice', st), {
    statuses: { 'P-1': 'rejected' },
    additions: [{ id: 'ADD-practice-1', x: 5, y: 6 }],
  })
  assert.deepEqual(loadSheetState('sheet1', st), { statuses: { 'S1-2': 'accepted' } })
  assert.equal(loadSheetState('sheet2', st), null)
})

test('starting a new session replaces the old one completely', () => {
  const st = fakeStorage()
  startSavedSession({ session_label: 'old', participant: 'A', order: ORDER }, st)
  saveSheetState('practice', { statuses: { 'P-1': 'rejected' } }, st)
  startSavedSession({ session_label: 'new', participant: 'B', order: ORDER }, st)
  assert.equal(loadSession(st).session_label, 'new')
  assert.equal(loadSheetState('practice', st), null)
})

test('clearSession removes it (finished or discarded sessions do not resume)', () => {
  const st = fakeStorage()
  startSavedSession({ session_label: 'p1', participant: 'A', order: ORDER }, st)
  clearSession(st)
  assert.equal(loadSession(st), null)
})

test('saves without a session are ignored (nothing to attach them to)', () => {
  const st = fakeStorage()
  saveSheetState('practice', { statuses: { 'P-1': 'rejected' } }, st)
  savePosition({ index: 1, phase: 'review' }, st)
  assert.equal(st._map.size, 0)
})

test('corrupt, wrong-version or out-of-range saved data is ignored', () => {
  const st = fakeStorage()
  const good = { v: 1, session_label: 's', participant: 'A', order: ORDER, index: 0, phase: 'review', sheets: {} }
  const cases = [
    'not json',
    JSON.stringify({ ...good, v: 2 }),
    JSON.stringify({ ...good, session_label: '' }),
    JSON.stringify({ ...good, participant: null }),
    JSON.stringify({ ...good, index: 3 }),
    JSON.stringify({ ...good, phase: 'end' }),
    JSON.stringify({ ...good, order: [] }),
  ]
  for (const raw of cases) {
    st.setItem(SESSION_KEY, raw)
    assert.equal(loadSession(st), null, raw)
  }
  st.setItem(SESSION_KEY, JSON.stringify(good))
  assert.ok(loadSession(st))
})

test('a storage that throws never breaks the app', () => {
  assert.equal(loadSession(brokenStorage), null)
  assert.doesNotThrow(() => startSavedSession({ session_label: 's', participant: 'A', order: ORDER }, brokenStorage))
  assert.doesNotThrow(() => saveSheetState('practice', {}, brokenStorage))
  assert.doesNotThrow(() => savePosition({ index: 0, phase: 'review' }, brokenStorage))
  assert.doesNotThrow(() => clearSession(brokenStorage))
})

console.log('geometry (Hard rule 7, click-to-jump)')

test('clientToImage at native size matches the v0.1 maths', () => {
  // Image 1307x486 at native size, scrolled so its left edge is 200px off-screen.
  const rect = { left: -200 + 16, top: 70, width: 1307, height: 486 }
  assert.deepEqual(
    clientToImage({ clientX: 16 + 30, clientY: 70 + 456, rect, naturalWidth: 1307, naturalHeight: 486 }),
    { x: 230, y: 456 },
  )
})

test('scrollToCenter centres a point, and clamps at the image edges', () => {
  const base = { zoom: 1, naturalWidth: 1307, naturalHeight: 486, viewWidth: 400, viewHeight: 300 }
  assert.deepEqual(scrollToCenter({ ...base, x: 650, y: 243 }), { left: 450, top: 93 })
  assert.deepEqual(scrollToCenter({ ...base, x: 10, y: 10 }), { left: 0, top: 0 })
  assert.deepEqual(scrollToCenter({ ...base, x: 1300, y: 480 }), { left: 907, top: 186 })
  // A view bigger than the image can't scroll at all.
  assert.deepEqual(scrollToCenter({ ...base, viewWidth: 2000, viewHeight: 900, x: 650, y: 243 }), { left: 0, top: 0 })
})

test('boxPercent: one square box centred on the item, clipped to the image', () => {
  const b = boxPercent({ x: 500, y: 250, size: 50, naturalWidth: 1000, naturalHeight: 500 })
  assert.deepEqual(b, { left: '47.5%', top: '45%', width: '5%', height: '10%' })
  const corner = boxPercent({ x: 10, y: 10, size: 50, naturalWidth: 1000, naturalHeight: 500 })
  assert.deepEqual(corner, { left: '0%', top: '0%', width: '3.5%', height: '7%' })
})

test('boxPercent: no box for a point outside the image', () => {
  assert.equal(boxPercent({ x: 1000, y: 10, size: 50, naturalWidth: 1000, naturalHeight: 500 }), null)
  assert.equal(boxPercent({ x: 10, y: -1, size: 50, naturalWidth: 1000, naturalHeight: 500 }), null)
})

console.log(`\n${passed} tests passed`)
