// Tests for All marks on (Feature 1): ringCircle, src/lib/marks.js and
// src/config/markStyles.js (no React, no browser). Run: node scripts/marks.test.js

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { imageToScreen, ringCircle } from '../src/lib/geometry.js'
import { buildMarks, diamondPoints, drawOrder, filterByType, markLabel, typeCounts } from '../src/lib/marks.js'
import { catalogIndex } from '../src/lib/edits.js'
import { RING_DIAMETER, RING_MIN_SCREEN, TYPE_COLORS } from '../src/config/markStyles.js'
import CATALOG from '../src/config/catalog.json' with { type: 'json' }

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

const { byName } = catalogIndex(CATALOG)

const items = [
  { id: 'S1-1', name: 'E2', type: 'Light fixture', x: 120, y: 340, confidence: 0.95, unit_price: 195 },
  { id: 'S1-2', name: 'Duplex receptacle', type: 'Receptacle', x: 800, y: 50, confidence: 0.8, unit_price: 140 },
  { id: 'S1-3', name: 'D', type: 'Light fixture', x: 1500, y: 900, confidence: 0.6, unit_price: 420 },
  { id: 'S1-4', name: 'Occupancy sensor', type: 'Sensor', x: 30, y: 30, confidence: 0.4, unit_price: 210 },
]
const additions = [
  { id: 'ADD-1', name: 'E2-NL', type: 'Light fixture', x: 400, y: 410, unit_price: 195 },
]
const statuses = { 'S1-1': 'accepted', 'S1-2': 'rejected' }
const edits = { 'S1-3': 'Single pole wall switch' }
const marks = buildMarks({ items, statuses, additions, edits, byName })

console.log('ringCircle')

test('centre lands on the item x,y at zoom 0.5, 1 and 2 (±0.5 px)', () => {
  for (const zoom of [0.5, 1, 2]) {
    for (const it of items) {
      const c = ringCircle({ x: it.x, y: it.y, zoom, diameter: RING_DIAMETER, minScreen: RING_MIN_SCREEN })
      const p = imageToScreen({ x: it.x, y: it.y, zoom })
      assert.ok(Math.abs(c.cx - p.left) <= 0.5, `cx at zoom ${zoom}`)
      assert.ok(Math.abs(c.cy - p.top) <= 0.5, `cy at zoom ${zoom}`)
    }
  }
})

test('r is never below 8 screen px', () => {
  for (const zoom of [0.25, 0.5, 1, 2, 4]) {
    const c = ringCircle({ x: 10, y: 10, zoom, diameter: RING_DIAMETER, minScreen: RING_MIN_SCREEN })
    assert.ok(c.r >= 8, `r=${c.r} at zoom ${zoom}`)
  }
})

test('r scales with zoom above the minimum', () => {
  assert.equal(ringCircle({ x: 0, y: 0, zoom: 2, diameter: 24, minScreen: 16 }).r, 24)
  assert.equal(ringCircle({ x: 0, y: 0, zoom: 0.25, diameter: 24, minScreen: 16 }).r, 8)
})

console.log('buildMarks')

test('one mark per row and per addition', () => {
  assert.equal(marks.length, items.length + additions.length)
  assert.deepEqual(marks.map((m) => m.id), ['S1-1', 'S1-2', 'S1-3', 'S1-4', 'ADD-1'])
  assert.equal(marks.filter((m) => m.kind === 'row').length, items.length)
  assert.equal(marks.filter((m) => m.kind === 'added').length, additions.length)
})

test('a rejected row keeps a mark with status rejected', () => {
  const m = marks.find((m) => m.id === 'S1-2')
  assert.ok(m)
  assert.equal(m.status, 'rejected')
  assert.equal(m.x, 800)
  assert.equal(m.y, 50)
})

test('accepted and undecided statuses', () => {
  assert.equal(marks.find((m) => m.id === 'S1-1').status, 'accepted')
  assert.equal(marks.find((m) => m.id === 'S1-4').status, 'undecided')
})

test('a renamed row shows its new name and type, same place', () => {
  const m = marks.find((m) => m.id === 'S1-3')
  assert.equal(m.name, 'Single pole wall switch')
  assert.equal(m.type, 'Switch')
  assert.equal(m.x, 1500)
  assert.equal(m.y, 900)
  assert.equal(m.confidence, 0.6)
})

test('additions: kind added, status null, confidence null', () => {
  const m = marks.find((m) => m.id === 'ADD-1')
  assert.deepEqual(m, {
    id: 'ADD-1', x: 400, y: 410, kind: 'added', name: 'E2-NL', type: 'Light fixture', confidence: null, status: null,
  })
})

console.log('typeCounts / filterByType / drawOrder')

test('typeCounts adds up to the number of rows', () => {
  const counts = typeCounts(marks)
  assert.equal(counts.reduce((s, c) => s + c.count, 0), items.length)
  assert.deepEqual(counts, [
    { type: 'Light fixture', count: 1 },
    { type: 'Receptacle', count: 1 },
    { type: 'Switch', count: 1 },
    { type: 'Sensor', count: 1 },
  ])
})

test("filterByType('all') returns everything", () => {
  assert.equal(filterByType(marks, 'all'), marks)
  assert.equal(filterByType(items, 'all'), items)
})

test('filterByType(type) keeps only that type, for marks and rows', () => {
  assert.deepEqual(filterByType(marks, 'Light fixture').map((m) => m.id), ['S1-1', 'ADD-1'])
  assert.deepEqual(filterByType(items, 'Light fixture').map((m) => m.id), ['S1-1', 'S1-3'])
})

test('drawOrder: rejected, undecided, accepted, added; input unchanged', () => {
  const before = marks.map((m) => m.id)
  assert.deepEqual(drawOrder(marks).map((m) => m.id), ['S1-2', 'S1-3', 'S1-4', 'S1-1', 'ADD-1'])
  assert.deepEqual(marks.map((m) => m.id), before)
})

test('drawOrder: additions last, rejected first', () => {
  const order = drawOrder(marks)
  assert.equal(order[0].status, 'rejected')
  assert.equal(order[order.length - 1].kind, 'added')
})

console.log('markLabel / diamondPoints')

test('markLabel: accepted row, rejected row, addition', () => {
  assert.equal(markLabel(marks.find((m) => m.id === 'S1-1')), 'E2, Light fixture, accepted')
  assert.equal(markLabel(marks.find((m) => m.id === 'S1-2')), 'Duplex receptacle, Receptacle, rejected')
  assert.equal(markLabel(marks.find((m) => m.id === 'ADD-1')), 'E2-NL, Light fixture, Added by you')
})

test('diamondPoints is centred on the ringCircle centre at zoom 0.5, 1 and 2', () => {
  for (const zoom of [0.5, 1, 2]) {
    const a = additions[0]
    const c = ringCircle({ x: a.x, y: a.y, zoom, diameter: RING_DIAMETER, minScreen: RING_MIN_SCREEN })
    const pts = diamondPoints(c).split(' ').map((p) => p.split(',').map(Number))
    assert.equal(pts.length, 4)
    const mx = pts.reduce((s, p) => s + p[0], 0) / 4
    const my = pts.reduce((s, p) => s + p[1], 0) / 4
    const p = imageToScreen({ x: a.x, y: a.y, zoom })
    assert.ok(Math.abs(mx - p.left) <= 0.5, `x at zoom ${zoom}`)
    assert.ok(Math.abs(my - p.top) <= 0.5, `y at zoom ${zoom}`)
  }
})

console.log('markStyles')

test('every catalog type has a colour', () => {
  for (const type of catalogIndex(CATALOG).types) assert.ok(TYPE_COLORS[type], type)
})

console.log('guard (hard rule 3)')

test('no file in src/ mentions answer-key, baseline/ or handoff', () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
  const src = fileURLToPath(new URL('../src/', import.meta.url))
  const bad = walk(src).filter((p) => /answer-key|baseline\/|handoff/.test(readFileSync(p, 'utf8')))
  assert.deepEqual(bad, [])
})

console.log(`\nmarks: ${passed} passed`)
