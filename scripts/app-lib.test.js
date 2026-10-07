// Tests for the participant app's plain-JS modules in src/lib (no React, no
// browser). Run: node scripts/app-lib.test.js

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import FEATURES from '../src/config/features.json' with { type: 'json' }
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
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  fitWidthZoom,
  clientToImage,
  imageToScreen,
  jumpBoxRect,
  screenToImage,
  isAtScroll,
  scrollToCenter,
  stepZoom,
  viewportCenterImage,
  visibleImageCenter,
  zoomAroundPoint,
} from '../src/lib/geometry.js'
import { createGesture, createScrollFilter, zoomPercent } from '../src/lib/gestures.js'
import { applyEdit, bidTotal, catalogIndex, displayItem } from '../src/lib/edits.js'
import CATALOG from '../src/config/catalog.json' with { type: 'json' }
import { NAME_FR, TYPE_FR, nameLabel, sheetLabel, typeLabel } from '../src/lib/fr.js'

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
  const imageRect = { left: -200 + 16, top: 70 }
  assert.deepEqual(clientToImage({ clientX: 16 + 30, clientY: 70 + 456, imageRect, zoom: 1 }), { x: 230, y: 456 })
})

test('the shared conversion: imageToScreen and screenToImage are exact inverses at 25%-400%', () => {
  for (const zoom of [0.25, 0.4, 0.68, 1, 1.25, 2, 3.1, 4]) {
    for (const p of [{ x: 0, y: 0 }, { x: 37, y: 512 }, { x: 2018, y: 718 }, { x: 1099.5, y: 3.25 }]) {
      const sc = imageToScreen({ ...p, zoom })
      assert.ok(Math.abs(sc.left - p.x * zoom) < 1e-9 && Math.abs(sc.top - p.y * zoom) < 1e-9)
      const back = screenToImage({ ...sc, zoom })
      assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9, `zoom ${zoom} ${JSON.stringify(p)}`)
    }
  }
})

test('clientToImage rounds to whole image pixels and ignores pane offset and scroll', () => {
  // Drawn image at 200%, its top-left 50 px left of / 30 px above the viewport edge.
  const imageRect = { left: -50, top: -30 }
  assert.deepEqual(clientToImage({ clientX: -50 + 201, clientY: -30 + 99, imageRect, zoom: 2 }), { x: 101, y: 50 }) // 100.5 -> 101, 49.5 -> 50
  assert.deepEqual(clientToImage({ clientX: -50 + 200.9, clientY: -30 + 98.9, imageRect, zoom: 2 }), { x: 100, y: 49 })
})

test('scrollToCenter centres a point, and clamps at the image edges', () => {
  const base = { zoom: 1, naturalWidth: 1307, naturalHeight: 486, viewWidth: 400, viewHeight: 300 }
  assert.deepEqual(scrollToCenter({ ...base, x: 650, y: 243 }), { left: 450, top: 93 })
  assert.deepEqual(scrollToCenter({ ...base, x: 10, y: 10 }), { left: 0, top: 0 })
  assert.deepEqual(scrollToCenter({ ...base, x: 1300, y: 480 }), { left: 907, top: 186 })
  // A view bigger than the image can't scroll at all.
  assert.deepEqual(scrollToCenter({ ...base, viewWidth: 2000, viewHeight: 900, x: 650, y: 243 }), { left: 0, top: 0 })
})

test('jumpBoxRect: one square box centred on the item, clipped to the image', () => {
  const nat = { naturalWidth: 1000, naturalHeight: 500 }
  assert.deepEqual(jumpBoxRect({ x: 500, y: 250, size: 50, zoom: 1, ...nat }), { left: 475, top: 225, width: 50, height: 50 })
  assert.deepEqual(jumpBoxRect({ x: 10, y: 10, size: 50, zoom: 1, ...nat }), { left: 0, top: 0, width: 35, height: 35 })
})

test('jumpBoxRect: scales with zoom (size x zoom), never under minScreen px on screen', () => {
  const nat = { naturalWidth: 2019, naturalHeight: 719 }
  assert.deepEqual(jumpBoxRect({ x: 500, y: 300, size: 32, zoom: 2, minScreen: 24, ...nat }), { left: 968, top: 568, width: 64, height: 64 })
  assert.deepEqual(jumpBoxRect({ x: 500, y: 300, size: 32, zoom: 1, minScreen: 24, ...nat }), { left: 484, top: 284, width: 32, height: 32 })
  // At 40% the box would be 12.8 px; it is held at 24 px, still centred on the item.
  const low = jumpBoxRect({ x: 500, y: 300, size: 32, zoom: 0.4, minScreen: 24, ...nat })
  assert.ok(Math.abs(low.width - 24) < 1e-9 && Math.abs(low.height - 24) < 1e-9)
  assert.ok(Math.abs(low.left + 12 - 200) < 1e-9 && Math.abs(low.top + 12 - 120) < 1e-9)
})

test('jumpBoxRect: no box for a point outside the image', () => {
  const nat = { naturalWidth: 1000, naturalHeight: 500 }
  assert.equal(jumpBoxRect({ x: 1000, y: 10, size: 50, zoom: 1, ...nat }), null)
  assert.equal(jumpBoxRect({ x: 10, y: -1, size: 50, zoom: 1, ...nat }), null)
})

console.log('click-to-jump on the six real sheets (v0.2 step 5)')

// The drawing pane's visible size (clientWidth x clientHeight, scrollbars
// excluded), measured in the built app at the two screen sizes in CLAUDE.md.
const PANES = { '1920x1080': { viewWidth: 1386, viewHeight: 990 }, '1366x768': { viewWidth: 832, viewHeight: 678 } }
const REAL = [1, 2, 3, 4, 5, 6].map((n) => {
  const sheet = JSON.parse(readFileSync(new URL(`../public/sheets/sheet${n}.json`, import.meta.url), 'utf8'))
  const png = readFileSync(new URL(`../public${sheet.image}`, import.meta.url))
  // naturalWidth/naturalHeight straight from the PNG header, never hardcoded.
  return { ...sheet, naturalWidth: png.readUInt32BE(16), naturalHeight: png.readUInt32BE(20) }
})
const BOX = FEATURES.jumpBoxPx
// The box at zoom 1 (screen px = image px), as in step 5.
const boxAt = (s, it) => jumpBoxRect({ x: it.x, y: it.y, size: BOX, zoom: 1, naturalWidth: s.naturalWidth, naturalHeight: s.naturalHeight })
const EPS = 1e-9

test('jumpBoxPx is 32', () => assert.equal(BOX, 32))

test('all 312 items: after the jump the item and its whole box are inside the visible pane', () => {
  let n = 0
  for (const s of REAL) {
    for (const [screen, pane] of Object.entries(PANES)) {
      for (const it of s.items) {
        const { left, top } = scrollToCenter({ x: it.x, y: it.y, zoom: 1, naturalWidth: s.naturalWidth, naturalHeight: s.naturalHeight, ...pane })
        const b = boxAt(s, it)
        const at = `${screen} ${s.id} ${it.id}`
        assert.ok(b, at)
        const bl = b.left
        const bt = b.top
        const br = bl + b.width
        const bb = bt + b.height
        // The box contains the item and stays on the image.
        assert.ok(bl <= it.x + EPS && it.x <= br + EPS && bt <= it.y + EPS && it.y <= bb + EPS, at)
        assert.ok(bl >= -EPS && bt >= -EPS && br <= s.naturalWidth + EPS && bb <= s.naturalHeight + EPS, at)
        // Item and whole box inside the visible part of the pane.
        assert.ok(bl >= left - EPS && br <= left + pane.viewWidth + EPS, `${at}: box x ${bl}-${br}, view ${left}+${pane.viewWidth}`)
        assert.ok(bt >= top - EPS && bb <= top + pane.viewHeight + EPS, `${at}: box y ${bt}-${bb}, view ${top}+${pane.viewHeight}`)
        n++
      }
    }
  }
  assert.equal(n, 312 * 2)
})

test('all 312 items: an unclipped box is centred on the item to within 1 image pixel', () => {
  for (const s of REAL) {
    for (const it of s.items) {
      const b = boxAt(s, it)
      const cx = b.left + b.width / 2
      const cy = b.top + b.height / 2
      const clipped = it.x < BOX / 2 || it.y < BOX / 2 || it.x > s.naturalWidth - BOX / 2 || it.y > s.naturalHeight - BOX / 2
      if (!clipped) assert.ok(Math.abs(cx - it.x) <= 1 && Math.abs(cy - it.y) <= 1, `${s.id} ${it.id}: centre ${cx},${cy}`)
    }
  }
})

test('32 px box: on the real sheets only the two sheet 4 items 12 px apart share a box', () => {
  const shared = []
  for (const s of REAL) {
    for (const a of s.items) {
      if (s.items.some((b) => b !== a && Math.abs(a.x - b.x) < BOX / 2 && Math.abs(a.y - b.y) < BOX / 2)) shared.push(`${s.id} ${a.id}`)
    }
  }
  assert.equal(shared.length, 2, shared.join(', '))
  assert.ok(shared.every((id) => id.startsWith('sheet4 ')), shared.join(', '))
})

console.log('edit action (v0.2 step 6)')

const CAT = catalogIndex(CATALOG)
// The list exactly as the app builds it: sorted by ORIGINAL confidence, then the
// edits overlay applied (App.jsx ReviewScreen).
const view = (items, edits) =>
  [...items].sort((a, b) => b.confidence - a.confidence).map((it) => displayItem(it, edits, CAT.byName))
const ITEM = { id: 'S9-4', name: 'D2', type: 'Light fixture', x: 120, y: 340, confidence: 0.83, unit_price: 320 }
const edit = (edits, newName, item = ITEM) => applyEdit({ edits, item, newName, byName: CAT.byName })

test('catalog index: 9 types, 38 names, in catalog order, nothing hardcoded', () => {
  assert.equal(CAT.types.length, 9)
  assert.deepEqual([...CAT.namesByType.values()].flat().sort(), CATALOG.map((e) => e.name).sort())
  assert.equal(CAT.types[0], CATALOG[0].type)
  for (const [type, names] of CAT.namesByType) for (const n of names) assert.equal(CAT.byName.get(n).type, type)
})

test('an edit sets the catalog name, type and price; id, x, y, confidence untouched; one event', () => {
  const r = edit({}, 'Duplex receptacle')
  assert.deepEqual(r.edits, { 'S9-4': 'Duplex receptacle' })
  assert.deepEqual(r.event, { action: 'edited', item_id: 'S9-4', old_value: 'D2', new_value: 'Duplex receptacle' })
  const shown = displayItem(ITEM, r.edits, CAT.byName)
  assert.deepEqual(shown, { ...ITEM, name: 'Duplex receptacle', type: 'Receptacle', unit_price: 140 })
  assert.equal(ITEM.name, 'D2') // the original item is never changed
})

test('no-op (the name already shown): no change, no event', () => {
  assert.equal(edit({}, 'D2'), null)
  assert.equal(edit({ 'S9-4': 'E1' }, 'E1'), null)
})

test('a name not in the catalog is refused', () => {
  assert.throws(() => edit({}, 'Lamp'), /not in the catalog/)
})

test('editing back to the original name removes the overlay entry', () => {
  const r = edit({ 'S9-4': 'E1', 'S9-7': 'H' }, 'D2')
  assert.deepEqual(r.edits, { 'S9-7': 'H' })
  assert.deepEqual(r.event, { action: 'edited', item_id: 'S9-4', old_value: 'E1', new_value: 'D2' })
})

test('chain D2 -> E1 -> D2: each change logs once, old_value = the name shown just before', () => {
  let edits = {}
  const events = []
  for (const n of ['E1', 'E1', 'D2', 'D2']) {
    const r = edit(edits, n)
    if (r) {
      edits = r.edits
      events.push(r.event)
    }
  }
  assert.deepEqual(events, [
    { action: 'edited', item_id: 'S9-4', old_value: 'D2', new_value: 'E1' },
    { action: 'edited', item_id: 'S9-4', old_value: 'E1', new_value: 'D2' },
  ])
  assert.deepEqual(edits, {})
})

test('editing never changes the review status (accepted, rejected, unreviewed)', () => {
  const items = [ITEM, { ...ITEM, id: 'S9-5', x: 10 }, { ...ITEM, id: 'S9-6', x: 20 }]
  const statuses = { 'S9-4': 'accepted', 'S9-5': 'rejected' } // S9-6 unreviewed
  const frozen = JSON.stringify(statuses)
  let edits = {}
  for (const it of items) edits = applyEdit({ edits, item: it, newName: 'H', byName: CAT.byName }).edits
  // applyEdit has no access to statuses: it cannot accept, reject, delete or add.
  assert.equal(JSON.stringify(statuses), frozen)
  assert.equal(statuses['S9-4'], 'accepted')
  assert.equal(statuses['S9-5'], 'rejected')
  assert.equal(statuses['S9-6'], undefined)
  assert.equal(view(items, edits).length, 3)
})

test('bid: edited rows count at the edited price; a rejected row stays out whatever its name', () => {
  const items = [ITEM, { ...ITEM, id: 'S9-5', x: 10 }, { ...ITEM, id: 'S9-6', x: 20 }]
  const statuses = { 'S9-5': 'rejected' }
  const adds = [{ unit_price: 95 }]
  assert.equal(bidTotal(view(items, {}), statuses, adds), 320 + 320 + 95)
  const edits = { 'S9-4': 'FE', 'S9-5': 'IN-FAN' } // 3800 and 680
  assert.equal(bidTotal(view(items, edits), statuses, adds), 3800 + 320 + 95)
})

test('all 312 real items: editing every row keeps id, x, y, confidence, order and jump target', () => {
  let n = 0
  for (const s of REAL) {
    const before = view(s.items, {})
    let edits = {}
    before.forEach((row, i) => {
      // A different catalog name for each row (never its own).
      const others = CATALOG.filter((e) => e.name !== row.name)
      const newName = others[i % others.length].name
      const original = s.items.find((it) => it.id === row.id)
      const r = applyEdit({ edits, item: original, newName, byName: CAT.byName })
      assert.deepEqual(r.event, { action: 'edited', item_id: row.id, old_value: row.name, new_value: newName })
      edits = r.edits
    })
    const after = view(s.items, edits)
    const keep = (r) => ({ id: r.id, x: r.x, y: r.y, confidence: r.confidence })
    assert.deepEqual(after.map(keep), before.map(keep), s.id)
    after.forEach((row, i) => {
      const e = CAT.byName.get(row.name)
      assert.notEqual(row.name, before[i].name, `${s.id} ${row.id}`)
      assert.equal(row.type, e.type)
      assert.equal(row.unit_price, e.unit_price)
      // The jump target is the row's x,y: same box as before the edit.
      assert.deepEqual(boxAt(s, row), boxAt(s, before[i]))
      n++
    })
    // The sheet file's items are untouched.
    assert.deepEqual(s.items.map((it) => it.name), JSON.parse(readFileSync(new URL(`../public/sheets/${s.id}.json`, import.meta.url), 'utf8')).items.map((it) => it.name))
  }
  assert.equal(n, 312)
})

console.log('zoom (features.zoom, Hard rule 7)')

const ZOOMS = [0.25, 0.32, 0.5, 0.68, 1, 1.25, 1.5625, 2, 4]

test('the same image point gives the same x,y at every zoom and scroll', () => {
  const nw = 1307
  const nh = 486
  const point = { x: 30, y: 456 } // D2 in the self-test key
  for (const zoom of [...ZOOMS, 0.317]) {
    for (const [scrollLeft, scrollTop] of [[0, 0], [123, 45], [900, 300]]) {
      // The image box on screen: scrolled, scaled by zoom, offset by the pane.
      const imageRect = { left: 16 - scrollLeft, top: 70 - scrollTop, width: nw * zoom, height: nh * zoom }
      // Where that image point is on screen.
      const clientX = imageRect.left + point.x * zoom
      const clientY = imageRect.top + point.y * zoom
      assert.deepEqual(
        clientToImage({ clientX, clientY, imageRect, zoom }),
        point,
        `zoom ${zoom}, scroll ${scrollLeft},${scrollTop}`,
      )
    }
  }
})

test('view centre in image px is independent of zoom (centre, then read back)', () => {
  const nw = 4000
  const nh = 3000
  const view = { viewWidth: 600, viewHeight: 400 }
  const p = { x: 1800, y: 1200 }
  for (const zoom of ZOOMS) {
    const { left, top } = scrollToCenter({ ...p, zoom, naturalWidth: nw, naturalHeight: nh, ...view })
    const c = viewportCenterImage({ scrollLeft: left, scrollTop: top, ...view, zoom })
    assert.ok(Math.abs(c.x - p.x) <= 1 && Math.abs(c.y - p.y) <= 1, `zoom ${zoom}: ${JSON.stringify(c)}`)
  }
})

test('viewportCenterImage converts screen scroll to image px', () => {
  assert.deepEqual(
    viewportCenterImage({ scrollLeft: 400, scrollTop: 100, viewWidth: 400, viewHeight: 300, zoom: 2 }),
    { x: 300, y: 125 },
  )
})

test('zoom range 25%-400%; +/- step x1.25 and stop at the ends', () => {
  assert.equal(ZOOM_MIN, 0.25)
  assert.equal(ZOOM_MAX, 4)
  assert.equal(stepZoom(1, 1), 1.25)
  assert.equal(stepZoom(1, -1), 0.8)
  assert.equal(stepZoom(3.5, 1), 4)
  assert.equal(stepZoom(0.3, -1), 0.25)
  assert.equal(stepZoom(4, 1), 4)
  assert.equal(stepZoom(0.25, -1), 0.25)
  assert.equal(clampZoom(10), 4)
  assert.equal(clampZoom(0.01), 0.25)
})

test('fit width fills the pane width exactly, above 100% too (no cap)', () => {
  for (const [vw, nw] of [[1371, 1100], [817, 2019], [817, 1100], [1371, 2019], [1371, 1302]]) {
    const z = fitWidthZoom({ viewWidth: vw, naturalWidth: nw })
    assert.ok(Math.abs(nw * z - vw) < 1e-9, `${vw}/${nw}`)
  }
  assert.ok(fitWidthZoom({ viewWidth: 1371, naturalWidth: 1100 }) > 1)
})

test('zoomAroundPoint keeps the image point under the anchor fixed', () => {
  const cases = [
    { scrollLeft: 0, scrollTop: 0, offsetX: 200, offsetY: 150, zoom: 0.68, newZoom: 0.85 },
    { scrollLeft: 340, scrollTop: 90, offsetX: 10, offsetY: 400, zoom: 1.25, newZoom: 4 },
    { scrollLeft: 1200, scrollTop: 700, offsetX: 600, offsetY: 300, zoom: 2, newZoom: 0.25 },
  ]
  for (const c of cases) {
    const before = { x: (c.scrollLeft + c.offsetX) / c.zoom, y: (c.scrollTop + c.offsetY) / c.zoom }
    const { left, top } = zoomAroundPoint(c)
    const after = { x: (left + c.offsetX) / c.newZoom, y: (top + c.offsetY) / c.newZoom }
    assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9, JSON.stringify(c))
  }
})

test('isAtScroll tells a settled programmatic scroll from a participant pan', () => {
  assert.equal(isAtScroll({ left: 451, top: 93 }, { left: 450, top: 93 }), true)
  assert.equal(isAtScroll({ left: 470, top: 93 }, { left: 450, top: 93 }), false)
  assert.equal(isAtScroll({ left: 0, top: 0 }, null), false)
})

// --- Step 10: zoom and pan logging (one gesture = one event) ---------------------

// A fake clock and timers, so debounce tests run instantly and exactly.
function fakeTime() {
  let t = 0
  let nextId = 1
  const timers = new Map()
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.set(id, { fn, at: t + ms })
      return id
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const end = t + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        t = due[1].at
        timers.delete(due[0])
        due[1].fn()
      }
      t = end
    },
  }
}
const gesture = (clock, ends) =>
  createGesture({ quietMs: 300, onEnd: (start, ts) => ends.push({ start, ts }), ...clock })

test('a wheel burst (ticks < 300 ms apart) logs once, at its last tick, with its first value', () => {
  const clock = fakeTime()
  const ends = []
  const g = gesture(clock, ends)
  for (let i = 0; i < 20; i++) {
    g.tick(0.5 + i) // only the first tick's value is the gesture's start
    clock.advance(50)
  }
  assert.equal(ends.length, 0) // still going
  clock.advance(300)
  assert.deepEqual(ends, [{ start: 0.5, ts: 950 }])
  clock.advance(5000)
  assert.equal(ends.length, 1) // never twice
})

test('two bursts 400 ms apart log twice; a 299 ms pause stays one gesture', () => {
  const clock = fakeTime()
  const ends = []
  const g = gesture(clock, ends)
  g.tick('a')
  clock.advance(299)
  g.tick('b')
  clock.advance(400) // 300 ms quiet -> end
  g.tick('c')
  clock.advance(400)
  assert.deepEqual(ends.map((e) => e.start), ['a', 'c'])
})

test('flush ends an open gesture now (unmount, other gesture); flush or cancel when idle do nothing', () => {
  const clock = fakeTime()
  const ends = []
  const g = gesture(clock, ends)
  g.flush()
  assert.equal(ends.length, 0)
  g.tick('a')
  assert.equal(g.active, true)
  g.flush()
  assert.equal(g.active, false)
  clock.advance(1000) // the timer was cleared: no second event
  assert.deepEqual(ends.map((e) => e.start), ['a'])
  g.tick('b')
  g.cancel()
  clock.advance(1000)
  assert.equal(ends.length, 1)
})

test('scroll filter: an app scroll is not a pan, the participant scroll after it is', () => {
  const clock = fakeTime()
  const f = createScrollFilter({ now: clock.now })
  assert.equal(f.isProgrammatic({ left: 10, top: 0 }), false) // nothing expected
  f.expect({ left: 400, top: 200 }) // e.g. click-to-jump, smooth scroll
  assert.equal(f.isProgrammatic({ left: 120, top: 60 }), true) // on the way
  assert.equal(f.isProgrammatic({ left: 398.6, top: 199.3 }), true) // ease-out tail, still the app
  assert.equal(f.isProgrammatic({ left: 399.8, top: 200 }), true) // arrived
  assert.equal(f.isProgrammatic({ left: 380, top: 201 }), false) // the participant now
})

test('scroll filter: an expectation expires, and participant intent clears it', () => {
  const clock = fakeTime()
  const f = createScrollFilter({ now: clock.now })
  f.expect({ left: 0, top: 0 }, 300)
  clock.advance(301)
  assert.equal(f.isProgrammatic({ left: 50, top: 0 }), false) // expired: a real scroll
  f.expect({ left: 0, top: 0 }, 300)
  f.clear() // e.g. a plain wheel tick
  assert.equal(f.isProgrammatic({ left: 50, top: 0 }), false)
})

test('zoom is logged as an integer %, 100% = one image px per screen px', () => {
  assert.equal(zoomPercent(1), 100)
  assert.equal(zoomPercent(1100 / 2019), 54) // sheet 3 at a 1100 px pane
  assert.equal(zoomPercent(0.25), 25)
  assert.equal(zoomPercent(4), 400)
  assert.equal(zoomPercent(1.2549), 125)
})

test('visibleImageCenter: centre of the visible image in image px, at any zoom and offset', () => {
  // Image 2000x1000 drawn at zoom 0.5 (1000x500 on screen), scrolled so the view
  // (400x300 at client 100,50) shows screen px 300..700 x 100..400 of it.
  const zoom = 0.5
  const imageRect = { left: 100 - 300, top: 50 - 100, right: 100 - 300 + 1000, bottom: 50 - 100 + 500, width: 1000, height: 500 }
  const viewRect = { left: 100, top: 50, right: 500, bottom: 350 }
  assert.deepEqual(visibleImageCenter({ viewRect, imageRect, zoom }), { x: 1000, y: 500 })
  // A short image centred in a tall pane: the grey above and below is ignored.
  const short = { left: 150, top: 200, right: 450, bottom: 300, width: 300, height: 100 }
  assert.deepEqual(visibleImageCenter({ viewRect: { left: 100, top: 0, right: 500, bottom: 800 }, imageRect: short, zoom: 0.25 }), { x: 600, y: 200 })
  // Matches viewportCenterImage when the image starts at the pane's corner.
  const z = 2
  const c = viewportCenterImage({ scrollLeft: 400, scrollTop: 100, viewWidth: 400, viewHeight: 300, zoom: z })
  const r = { left: -400, top: -100, right: -400 + 4000, bottom: -100 + 2000, width: 4000, height: 2000 }
  assert.deepEqual(visibleImageCenter({ viewRect: { left: 0, top: 0, right: 400, bottom: 300 }, imageRect: r, zoom: z }), c)
})

// --- French version (branch fr): display labels only ------------------------------

test('fr: every catalog type has a French label; every mapped name is a catalog name', () => {
  for (const e of CATALOG) assert.ok(TYPE_FR[e.type], e.type)
  const names = new Set(CATALOG.map((e) => e.name))
  for (const n of Object.keys(NAME_FR)) assert.ok(names.has(n), n)
})

test('fr: word names are translated, drawing tags are shown as printed', () => {
  for (const e of CATALOG) {
    const isTag = /^[A-Z0-9-]+$/.test(e.name)
    if (isTag) assert.equal(nameLabel(e.name), e.name, e.name)
    else assert.notEqual(nameLabel(e.name), e.name, e.name)
  }
  assert.equal(typeLabel('Receptacle'), 'Prise de courant')
  assert.equal(sheetLabel('Sheet 3'), 'Feuille 3')
  assert.equal(sheetLabel('Practice Sheet'), "Feuille d'entraînement")
})

console.log(`\n${passed} tests passed`)
