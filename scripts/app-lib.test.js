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

console.log(`\n${passed} tests passed`)
