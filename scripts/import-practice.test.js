// Tests for the practice sheet import (v0.3 step 14). Run: node scripts/import-practice.test.js

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRACTICE, buildBaseline, readCatalog } from './import-lib.js'
import { buildSheet, confidenceFor, formatSheet, sortForDisplay } from './sheet-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...p) => readFileSync(join(root, ...p))
const text = (...p) => readFileSync(join(root, ...p), 'utf8')
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

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

const CSV = text('handoff', 'baseline_lists', 'practice.items.csv')
const PNG = read('handoff', 'sheets', 'practice.png')
const TYPES = readCatalog(text('handoff', 'catalog.csv')).types
const CATALOG = JSON.parse(text('src', 'config', 'catalog.json'))
const OPTS = { expected: PRACTICE, idPattern: /^P\d+$/, idExample: 'P001', requireSummary: false }
const importPractice = (itemsText = CSV, png = PNG) =>
  buildBaseline({ sheet: 'practice', itemsText, summary: null, png, catalog: TYPES, ...OPTS })
const SHEET = JSON.parse(text('public', 'sheets', 'practice.json'))
const BASELINE = JSON.parse(text('baseline', 'practice.baseline.json'))

console.log('practice files')

test('public/sheets/practice.png is the handoff PNG, byte for byte', () => {
  assert.ok(read('public', 'sheets', 'practice.png').equals(PNG))
})

test('the handoff list passes the step 1 checks: 29 items, 892x645, names in the catalog', () => {
  const r = importPractice()
  assert.deepEqual(r.errors, [])
  assert.equal(r.baseline.items.length, 29)
  assert.deepEqual(r.baseline.image_size, { width: 892, height: 645 })
})

test('baseline/practice.baseline.json is exactly what the import writes', () => {
  assert.equal(text('baseline', 'practice.baseline.json'), JSON.stringify(importPractice().baseline, null, 2) + '\n')
  assert.equal(BASELINE.image_sha256, sha256(PNG))
})

test('practice.json is exactly what the build writes (no hand edits)', () => {
  const r = buildSheet({ sheet: 'practice', baseline: BASELINE, catalog: CATALOG, pngSha: sha256(PNG), expected: PRACTICE, prefix: 'P-', name: 'Practice Sheet' })
  assert.deepEqual(r.errors, [])
  assert.equal(formatSheet(r.sheet), text('public', 'sheets', 'practice.json'))
})

test('same row look as sheets 1-6: same fields, ids P-1..P-29 with no gap, own image', () => {
  assert.equal(SHEET.id, 'practice')
  assert.equal(SHEET.image, '/sheets/practice.png')
  assert.deepEqual(SHEET.items.map((it) => it.id), Array.from({ length: 29 }, (_, i) => `P-${i + 1}`))
  for (const it of SHEET.items) assert.deepEqual(Object.keys(it), ['id', 'name', 'type', 'x', 'y', 'confidence', 'unit_price'])
})

test('same confidence rule (0.70-0.99) and same order: confidence, highest first', () => {
  for (const it of SHEET.items) {
    assert.equal(it.confidence, confidenceFor('practice', it), it.id)
    assert.ok(it.confidence >= 0.7 && it.confidence <= 0.99, it.id)
  }
  assert.deepEqual(SHEET.items.map((it) => it.id), sortForDisplay(SHEET.items).map((it) => it.id))
})

test('every row matches a handoff symbol (name, x, y), with the catalog type and price', () => {
  const byName = new Map(CATALOG.map((e) => [e.name, e]))
  const fromCsv = BASELINE.items.map((it) => `${it.name}|${it.x}|${it.y}`).sort()
  assert.deepEqual(SHEET.items.map((it) => `${it.name}|${it.x}|${it.y}`).sort(), fromCsv)
  for (const it of SHEET.items) {
    assert.equal(it.type, byName.get(it.name).type, it.id)
    assert.equal(it.unit_price, byName.get(it.name).unit_price, it.id)
    assert.ok(it.x >= 0 && it.y >= 0 && it.x < 892 && it.y < 645, it.id)
  }
})

test('no answer key for practice (never planted, never scored)', () => {
  assert.equal(existsSync(join(root, 'answer-key', 'practice.key.json')), false)
})

console.log('practice import refusals')

const lines = CSV.trimEnd().split('\n')
test('a B id, a missing row, an unknown name or a point off the image is refused', () => {
  const swap = (i, from, to) => lines.map((l, k) => (k === i ? l.replace(from, to) : l)).join('\n')
  assert.match(importPractice(swap(1, 'P001', 'B001')).errors.join('\n'), /id must look like P001/)
  assert.match(importPractice(lines.slice(0, -1).join('\n')).errors.join('\n'), /28 items, CLAUDE.md table says 29|28 items/)
  assert.match(importPractice(swap(1, 'B-NL,Light', 'B-XX,Light')).errors.join('\n'), /not in catalog.csv/)
  assert.match(importPractice(swap(1, ',91,104,', ',892,104,')).errors.join('\n'), /outside the image/)
})

test('a different image is refused', () => {
  assert.match(importPractice(CSV, read('public', 'sheets', 'sheet1.png')).errors.join('\n'), /892x645/)
})

console.log(`\n${passed} tests passed`)
