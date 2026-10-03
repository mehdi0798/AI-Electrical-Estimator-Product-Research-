// Tests for scripts/validate-sheets.js. Run: node scripts/validate-sheets.test.js
// Fixtures are built in memory / a temp dir; nothing here is real study content.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { displayOrder, pngSize, validateSheet } from './validate-lib.js'

const here = dirname(fileURLToPath(import.meta.url))

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

// Minimal PNG: signature + IHDR with the given size (enough for pngSize).
function fakePng(width, height) {
  const buf = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

const SIZE = { width: 1000, height: 500 }

// A valid sheet: S9-3 is the phantom (OVER), D1 the deleted item (UNDER).
function validSheet() {
  return {
    id: 'sheet9',
    name: 'Fixture',
    image: '/sheets/sheet9.png',
    items: [
      { id: 'S9-1', name: 'Duplex Receptacle', type: 'Placeholder', x: 10, y: 10, confidence: 0.95, unit_price: 18.5 },
      { id: 'S9-2', name: 'Exit Sign', type: 'Placeholder', x: 20, y: 20, confidence: 0.9, unit_price: 64 },
      { id: 'S9-3', name: 'LED Downlight', type: 'Placeholder', x: 30, y: 30, confidence: 0.85, unit_price: 48 },
      { id: 'S9-4', name: 'Junction Box', type: 'Placeholder', x: 40, y: 40, confidence: 0.8, unit_price: 9.5 },
      { id: 'S9-5', name: 'Data Outlet', type: 'Placeholder', x: 50, y: 50, confidence: 0.75, unit_price: 42 },
      { id: 'S9-6', name: 'Wall Pack', type: 'Placeholder', x: 60, y: 60, confidence: 0.7, unit_price: 140 },
    ],
  }
}
function validKey() {
  return {
    manipulations: [
      { id: 'S9-3', direction: 'OVER', x: 30, y: 30, cost: 48, pair_id: 'P1' },
      { id: 'D1', direction: 'UNDER', x: 100, y: 100, cost: 18.5, pair_id: 'P1' },
    ],
  }
}
const run = (sheet, key = validKey(), { isPractice = false, imageSize = SIZE } = {}) =>
  validateSheet({ sheet, key, imageSize, isPractice })
const hasError = (r, re) => r.errors.some((e) => re.test(e))

console.log('helpers')

test('pngSize reads width/height and rejects non-PNG data', () => {
  assert.deepEqual(pngSize(fakePng(1307, 486)), { width: 1307, height: 486 })
  assert.throws(() => pngSize(Buffer.from('not a png at all, really not')), /not a PNG/)
})

test('displayOrder matches the app: confidence desc, ties keep file order', () => {
  const items = [
    { id: 'a', confidence: 0.5 },
    { id: 'b', confidence: 0.9 },
    { id: 'c', confidence: 0.5 },
  ]
  assert.deepEqual(displayOrder(items).map((i) => i.id), ['b', 'a', 'c'])
})

console.log('sheet checks')

test('a valid sheet and key pass with no errors', () => {
  const r = run(validSheet())
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.warnings, [])
})

test('missing item field is an error', () => {
  const s = validSheet()
  delete s.items[1].name
  assert.ok(hasError(run(s), /item S9-2: missing "name"/))
})

test('missing item type is an error', () => {
  const s = validSheet()
  delete s.items[2].type
  assert.ok(hasError(run(s), /item S9-3: missing "type"/))
})

test('non-text item name is an error', () => {
  const s = validSheet()
  s.items[0].name = 42
  assert.ok(hasError(run(s), /item S9-1: "name" must be text/))
})

test('missing sheet field and missing manipulation field are errors', () => {
  const s = validSheet()
  delete s.name
  const k = validKey()
  delete k.manipulations[1].pair_id
  const r = run(s, k)
  assert.ok(hasError(r, /sheet is missing "name"/))
  assert.ok(hasError(r, /manipulation D1: missing "pair_id"/))
})

test('x,y outside the image is an error, for items and manipulations', () => {
  const s = validSheet()
  s.items[0].x = 1000 // width is 1000, so valid x is 0..999
  const k = validKey()
  k.manipulations[1].y = -1
  const r = run(s, k)
  assert.ok(hasError(r, /item S9-1: \(1000, 10\) is outside the image/))
  assert.ok(hasError(r, /manipulation D1: \(100, -1\) is outside the image/))
})

test('duplicate item ids are an error', () => {
  const s = validSheet()
  s.items[5].id = 'S9-5'
  assert.ok(hasError(run(s), /duplicate item ids: S9-5/))
})

test('an id gap that hints at a deletion is an error', () => {
  const s = validSheet()
  s.items.splice(3, 1) // remove S9-4
  assert.ok(hasError(run(s), /id gap .*missing S9-4/))
})

test('ids must start at 1 (a missing first id is a gap too)', () => {
  const s = validSheet()
  s.items.shift() // remove S9-1
  const k = validKey()
  assert.ok(hasError(run(s, k), /missing S9-1/))
})

test('OVER whose id is not in items is an error', () => {
  const k = validKey()
  k.manipulations[0].id = 'S9-99'
  assert.ok(hasError(run(validSheet(), k), /OVER S9-99: no row with this id/))
})

test('OVER that is the last row is an error, even with confidence in range', () => {
  const s = validSheet()
  // Phantom S9-6 ties the lowest real row (0.7) but comes after it in the file,
  // so the app shows it last.
  s.items[4].confidence = 0.7
  const k = validKey()
  k.manipulations[0] = { id: 'S9-6', direction: 'OVER', x: 60, y: 60, cost: 140, pair_id: 'P1' }
  const r = run(s, k)
  assert.ok(hasError(r, /OVER S9-6: is the last row/))
  assert.ok(!hasError(r, /outside the real rows' range/))
})

test('OVER confidence above or below the real rows is an error', () => {
  const s = validSheet()
  s.items[2].confidence = 0.99 // above the highest real row (0.95)
  assert.ok(hasError(run(s), /OVER S9-3: confidence 0.99 is outside the real rows' range 0.7-0.95/))
  const s2 = validSheet()
  s2.items[2].confidence = 0.65 // below the lowest real row (0.7); also last row
  assert.ok(hasError(run(s2), /outside the real rows' range/))
})

test('OVER on the range boundary is allowed', () => {
  const s = validSheet()
  s.items[2].confidence = 0.95 // equals the highest real row, not last
  assert.deepEqual(run(s).errors, [])
})

test('OVER cost or x,y differing from its row is a warning', () => {
  const k = validKey()
  k.manipulations[0].cost = 50
  k.manipulations[0].x = 31
  const r = run(validSheet(), k)
  assert.deepEqual(r.errors, [])
  assert.ok(r.warnings.some((w) => /key cost 50 differs/.test(w)))
  assert.ok(r.warnings.some((w) => /key x,y \(31, 30\) differs/.test(w)))
})

test('UNDER whose id still has a row is an error', () => {
  const k = validKey()
  k.manipulations[1].id = 'S9-5'
  assert.ok(hasError(run(validSheet(), k), /UNDER S9-5: a row with this id is still in items/))
})

test('each pair_id needs exactly one UNDER and one OVER', () => {
  const k = validKey()
  k.manipulations.push({ id: 'D2', direction: 'UNDER', x: 200, y: 200, cost: 9.5, pair_id: 'P1' })
  k.manipulations.push({ id: 'D3', direction: 'UNDER', x: 300, y: 300, cost: 9.5, pair_id: 'P2' })
  const r = run(validSheet(), k)
  assert.ok(hasError(r, /pair P1: .*2 UNDER .*1 OVER/))
  assert.ok(hasError(r, /pair P2: .*1 UNDER .*0 OVER/))
})

test('bad direction and duplicate manipulation ids are errors', () => {
  const k = validKey()
  k.manipulations.push({ id: 'D1', direction: 'SIDEWAYS', x: 5, y: 5, cost: 1, pair_id: 'P9' })
  const r = run(validSheet(), k)
  assert.ok(hasError(r, /direction must be UNDER or OVER/))
  assert.ok(hasError(r, /duplicate manipulation ids: D1/))
})

test('practice with manipulations is an error; practice without a key is fine', () => {
  const p = { ...validSheet(), id: 'practice' }
  assert.ok(hasError(run(p, validKey(), { isPractice: true }), /practice must have no manipulations, found 2/))
  assert.deepEqual(run(p, null, { isPractice: true }).errors, [])
  assert.deepEqual(run(p, { manipulations: [] }, { isPractice: true }).errors, [])
})

test('a study sheet without an answer key is an error', () => {
  assert.ok(hasError(run(validSheet(), null), /no answer key for this sheet/))
})

test('a placeholder sheet is a warning', () => {
  const s = { ...validSheet(), _placeholder: true }
  assert.ok(run(s).warnings.some((w) => /_placeholder/.test(w)))
})

console.log('CLI')

function makeSite(dir, { sheets, keys, images }) {
  const sheetsDir = join(dir, 'public', 'sheets')
  const keyDir = join(dir, 'keys')
  mkdirSync(sheetsDir, { recursive: true })
  mkdirSync(keyDir, { recursive: true })
  for (const [id, s] of Object.entries(sheets)) writeFileSync(join(sheetsDir, `${id}.json`), JSON.stringify(s))
  for (const [id, k] of Object.entries(keys)) writeFileSync(join(keyDir, `${id}.key.json`), JSON.stringify(k))
  for (const [name, [w, h]] of Object.entries(images)) writeFileSync(join(sheetsDir, name), fakePng(w, h))
  return { sheetsDir, keyDir }
}
const cli = (sheetsDir, keyDir) =>
  spawnSync(
    process.execPath,
    [join(here, 'validate-sheets.js'), '--sheets-dir', sheetsDir, '--key-dir', keyDir],
    { encoding: 'utf8' },
  )

test('CLI: valid set exits 0; practice reusing a study image is a warning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'validate-test-'))
  try {
    const practice = { id: 'practice', name: 'P', image: '/sheets/sheet9.png', items: validSheet().items }
    const { sheetsDir, keyDir } = makeSite(dir, {
      sheets: { practice, sheet9: validSheet() },
      keys: { sheet9: validKey() },
      images: { 'sheet9.png': [1000, 500] },
    })
    const r = cli(sheetsDir, keyDir)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /ok   practice/)
    assert.match(r.stdout, /ok   sheet9/)
    assert.match(r.stdout, /practice uses the same image as sheet9/)
    assert.match(r.stdout, /2 sheets checked: 0 errors, 1 warnings/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI: errors exit 1; missing image, missing key and id/file mismatch are reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'validate-test-'))
  try {
    const bad = validSheet()
    bad.items.splice(3, 1) // id gap
    const { sheetsDir, keyDir } = makeSite(dir, {
      sheets: {
        sheet9: bad,
        sheet8: { ...validSheet(), id: 'sheet8', image: '/sheets/nope.png' },
        sheet7: { ...validSheet(), id: 'wrong' },
      },
      keys: { sheet9: validKey() },
      images: { 'sheet9.png': [1000, 500] },
    })
    const r = cli(sheetsDir, keyDir)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /FAIL sheet9[\s\S]*id gap/)
    assert.match(r.stdout, /FAIL sheet8[\s\S]*image \/sheets\/nope.png: file not found[\s\S]*no answer key/)
    assert.match(r.stdout, /FAIL sheet7[\s\S]*sheet id "wrong" does not match its file name/)
    // practice first, then numeric order
    assert.ok(r.stdout.indexOf('sheet7') < r.stdout.indexOf('sheet8'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

console.log(`\n${passed} tests passed`)
