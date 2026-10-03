// Tests for the participant sheets (v0.2 step 4). Run: node scripts/build-sheets.test.js
// Checks public/sheets/sheet1..6.json against the baselines and the catalog.
// Refusal cases use temp folders; baseline/, public/ and src/config/ are only read.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED } from './import-lib.js'
import { buildSheet, confidenceFor, formatSheet, sortForDisplay } from './sheet-lib.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const SHEETS = Object.keys(EXPECTED)
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const CATALOG = readJson(join(root, 'src', 'config', 'catalog.json'))
const BY_NAME = new Map(CATALOG.map((e) => [e.name, e]))
const baseline = (s) => readJson(join(root, 'baseline', `${s}.baseline.json`))
const pngSha = (dir, s) => sha(readFileSync(join(dir, `${s}.png`)))
// Since step 7 public/sheets/ holds the PLANTED lists (tested in plant.test.js).
// These step 4 tests check the unplanted builder output, built here in memory.
const sheetText = (s) => {
  const r = buildSheet({ sheet: s, baseline: baseline(s), catalog: CATALOG, pngSha: pngSha(join(root, 'public', 'sheets'), s) })
  assert.deepEqual(r.errors, [])
  return formatSheet(r.sheet)
}

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

console.log('public/sheets/sheet1..6.json')

test('the unplanted build is byte-stable (same input, same file)', () => {
  for (const s of SHEETS) assert.equal(sheetText(s), sheetText(s), s)
})

test('build-sheets refuses to overwrite the planted public sheets once answer-key/ exists', () => {
  const r = spawnSync(process.execPath, [join(here, 'build-sheets.js')], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /answer-key\/ exists/)
})

test('312 items: counts 52/45/55/54/59/47, same name and x,y as the baseline, nothing added or dropped', () => {
  let total = 0
  for (const s of SHEETS) {
    const items = JSON.parse(sheetText(s)).items
    assert.equal(items.length, EXPECTED[s].items, s)
    const key = (it) => `${it.name}|${it.x}|${it.y}`
    assert.deepEqual(items.map(key).sort(), baseline(s).items.map(key).sort(), s)
    total += items.length
  }
  assert.equal(total, 312)
})

test('sheet fields: id, name "Sheet N", image; no placeholder or note fields', () => {
  for (const s of SHEETS) {
    const sheet = JSON.parse(sheetText(s))
    assert.deepEqual(Object.keys(sheet), ['id', 'name', 'image', 'items'])
    assert.equal(sheet.id, s)
    assert.equal(sheet.name, `Sheet ${s.slice(5)}`)
    assert.equal(sheet.image, `/sheets/${s}.png`)
  }
})

test('items carry ONLY id, name, type, x, y, confidence, unit_price; no researcher-only text', () => {
  for (const s of SHEETS) {
    for (const it of JSON.parse(sheetText(s)).items) {
      assert.deepEqual(Object.keys(it), ['id', 'name', 'type', 'x', 'y', 'confidence', 'unit_price'])
    }
    const text = sheetText(s)
    assert.doesNotMatch(text, /"B\d{3}"|description|label|where|status|sha256|sure|check:/, s)
  }
})

test('x,y are whole original-image pixels inside the image', () => {
  for (const s of SHEETS) {
    const { width, height } = EXPECTED[s]
    for (const it of JSON.parse(sheetText(s)).items) {
      assert.ok(Number.isInteger(it.x) && Number.isInteger(it.y), `${s} ${it.id}`)
      assert.ok(it.x >= 0 && it.y >= 0 && it.x < width && it.y < height, `${s} ${it.id}`)
    }
  }
})

test('type and unit_price are exactly the catalog entry for the name', () => {
  for (const s of SHEETS) {
    for (const it of JSON.parse(sheetText(s)).items) {
      const e = BY_NAME.get(it.name)
      assert.ok(e, `${s} ${it.id}: "${it.name}" not in catalog`)
      assert.equal(it.type, e.type, `${s} ${it.id}`)
      assert.equal(it.unit_price, e.unit_price, `${s} ${it.id}`)
    }
  }
})

test('ids are S<n>-1..N in list order: one prefix, no gap, no duplicate', () => {
  for (const s of SHEETS) {
    const items = JSON.parse(sheetText(s)).items
    assert.deepEqual(items.map((it) => it.id), items.map((_, i) => `S${s.slice(5)}-${i + 1}`), s)
  }
})

test('list order: confidence highest first, ties top-to-bottom then left-to-right', () => {
  for (const s of SHEETS) {
    const items = JSON.parse(sheetText(s)).items
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1]
      const b = items[i]
      assert.ok(
        a.confidence > b.confidence || (a.confidence === b.confidence && (a.y < b.y || (a.y === b.y && a.x <= b.x))),
        `${s}: ${a.id} before ${b.id}`,
      )
    }
    // The app's stable sort keeps the file order.
    assert.deepEqual([...items].sort((a, b) => b.confidence - a.confidence), items)
  }
})

test('confidence: the seeded sha256 rule, in [0.70, 0.99], 2 decimals', () => {
  for (const s of SHEETS) {
    for (const it of JSON.parse(sheetText(s)).items) {
      // Recomputed here independently of sheet-lib.js.
      const d = createHash('sha256').update(`voltra-v0.2|${s}|${it.name}|${it.x}|${it.y}`).digest()
      const want = Math.round((0.7 + (d.readUInt32BE(0) / 2 ** 32) * 0.29) * 100) / 100
      assert.equal(it.confidence, want, `${s} ${it.id}`)
      assert.ok(it.confidence >= 0.7 && it.confidence <= 0.99, `${s} ${it.id}`)
      assert.equal(Math.round(it.confidence * 100) / 100, it.confidence)
    }
  }
})

test('confidence depends only on the item: removing one leaves all others unchanged', () => {
  const s = 'sheet3'
  const b = baseline(s)
  const full = buildSheet({ sheet: s, baseline: b, catalog: CATALOG, pngSha: b.image_sha256 })
  const conf = new Map(full.sheet.items.map((it) => [`${it.name}|${it.x}|${it.y}`, it.confidence]))
  const fewer = b.items.slice(1)
  for (const it of fewer) assert.equal(confidenceFor(s, it), conf.get(`${it.name}|${it.x}|${it.y}`))
})

test('sortForDisplay does not depend on input order', () => {
  const items = JSON.parse(sheetText('sheet5')).items
  assert.deepEqual(sortForDisplay([...items].reverse()), items)
})

console.log('buildSheet refusals')

function tinyBaseline(mutate = (it) => it) {
  const b = baseline('sheet1')
  return { ...b, items: b.items.map((it, i) => mutate({ ...it }, i)) }
}
const run = (b, pngShaOverride) =>
  buildSheet({ sheet: 'sheet1', baseline: b, catalog: CATALOG, pngSha: pngShaOverride ?? b.image_sha256 })

test('a name missing from the catalog is refused', () => {
  const r = run(tinyBaseline((it, i) => (i === 0 ? { ...it, name: 'ZZ' } : it)))
  assert.equal(r.sheet, null)
  assert.match(r.errors.join('\n'), /name "ZZ" is not in the catalog/)
})

test('a type that disagrees with the catalog is refused', () => {
  const r = run(tinyBaseline((it, i) => (i === 0 ? { ...it, type: 'Switch' } : it)))
  assert.match(r.errors.join('\n'), /type "Switch" but the catalog gives/)
})

test('a wrong item count is refused', () => {
  const b = tinyBaseline()
  b.items.pop()
  assert.match(run(b).errors.join('\n'), /51 items, expected 52/)
})

test('x,y outside the image or not whole pixels is refused', () => {
  assert.match(run(tinyBaseline((it, i) => (i === 0 ? { ...it, x: 1100 } : it))).errors.join('\n'), /outside the image/)
  assert.match(run(tinyBaseline((it, i) => (i === 0 ? { ...it, y: 10.5 } : it))).errors.join('\n'), /whole image pixels/)
})

test('a PNG that differs from the baseline is refused', () => {
  assert.match(run(tinyBaseline(), 'f'.repeat(64)).errors.join('\n'), /does not match the baseline's image_sha256/)
})

console.log('CLI')

test('one bad baseline: exit 1, NOTHING written, practice.json untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'build-sheets-'))
  try {
    const bdir = join(dir, 'baseline')
    const sdir = join(dir, 'sheets')
    mkdirSync(bdir)
    mkdirSync(sdir)
    for (const s of SHEETS) {
      copyFileSync(join(root, 'baseline', `${s}.baseline.json`), join(bdir, `${s}.baseline.json`))
      copyFileSync(join(root, 'public', 'sheets', `${s}.png`), join(sdir, `${s}.png`))
    }
    writeFileSync(join(sdir, 'practice.json'), 'PRACTICE')
    const cli = () =>
      spawnSync(process.execPath, [join(here, 'build-sheets.js'), '--baseline-dir', bdir, '--sheets-dir', sdir], { encoding: 'utf8' })

    const good = cli()
    assert.equal(good.status, 0, good.stderr)
    assert.match(good.stdout, /Wrote 6 sheets \(312 items\)/)
    for (const s of SHEETS) assert.equal(readFileSync(join(sdir, `${s}.json`), 'utf8'), sheetText(s))
    for (const s of SHEETS) rmSync(join(sdir, `${s}.json`))

    const b6 = readJson(join(bdir, 'sheet6.baseline.json'))
    b6.items[3].name = 'ZZ'
    writeFileSync(join(bdir, 'sheet6.baseline.json'), JSON.stringify(b6))
    const bad = cli()
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /sheet6: item B004: name "ZZ" is not in the catalog/)
    assert.match(bad.stderr, /nothing written/)
    assert.deepEqual(readdirSync(sdir).filter((f) => f.endsWith('.json')), ['practice.json'])
    assert.equal(readFileSync(join(sdir, 'practice.json'), 'utf8'), 'PRACTICE')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

console.log(`\n${passed} tests passed`)
