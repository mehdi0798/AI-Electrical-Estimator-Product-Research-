// Tests for the app catalog (v0.2 step 3). Run: node scripts/import-catalog.test.js
// Checks src/config/catalog.json against handoff/catalog.csv (the authoritative
// source) and the baselines. Refusal cases use temp files; the real handoff/,
// baseline/ and src/config/ are only read, never written.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED, TYPES, buildCatalog, csvObjects, formatCatalog } from './import-lib.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const CSV_TEXT = readFileSync(join(root, 'handoff', 'catalog.csv'), 'utf8')
const CSV_ROWS = csvObjects(CSV_TEXT).records
const CATALOG_TEXT = readFileSync(join(root, 'src', 'config', 'catalog.json'), 'utf8')
const CATALOG = JSON.parse(CATALOG_TEXT)

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

console.log('src/config/catalog.json vs handoff/catalog.csv')

test('same rows in the same order: name, type and price match the CSV text exactly', () => {
  assert.equal(CATALOG.length, CSV_ROWS.length)
  CATALOG.forEach((e, i) => {
    const r = CSV_ROWS[i]
    assert.equal(e.name, r.name, `row ${i + 2}`)
    assert.equal(e.type, r.type, `row ${i + 2} (${r.name})`)
    assert.equal(typeof e.unit_price, 'number', `row ${i + 2} (${r.name})`)
    assert.equal(String(e.unit_price), r.unit_price, `row ${i + 2} (${r.name}) price`)
  })
})

test('every entry has ONLY name, type and unit_price (no counts, sheets or descriptions)', () => {
  for (const e of CATALOG) assert.deepEqual(Object.keys(e), ['name', 'type', 'unit_price'], e.name)
  assert.doesNotMatch(CATALOG_TEXT, /"(count_all_sheets|sheets|description)"\s*:/)
})

test('39 names (38 on sheets 1-6, plus B for the practice sheet), no duplicates, exactly the nine types', () => {
  assert.equal(CATALOG.length, 39)
  assert.equal(new Set(CATALOG.map((e) => e.name)).size, 39)
  assert.deepEqual([...new Set(CATALOG.map((e) => e.type))].sort(), [...TYPES].sort())
})

test('catalog.json is exactly what the import script writes (no hand edits)', () => {
  const { catalog, errors } = buildCatalog(CSV_TEXT)
  assert.deepEqual(errors, [])
  assert.equal(formatCatalog(catalog), CATALOG_TEXT)
})

test('every name used in a baseline is in the catalog, with the same type', () => {
  const byName = new Map(CATALOG.map((e) => [e.name, e.type]))
  const used = new Set()
  for (const sheet of Object.keys(EXPECTED)) {
    const b = JSON.parse(readFileSync(join(root, 'baseline', `${sheet}.baseline.json`), 'utf8'))
    for (const it of b.items) {
      assert.ok(byName.has(it.name), `${sheet} ${it.id}: "${it.name}" not in the catalog`)
      assert.equal(byName.get(it.name), it.type, `${sheet} ${it.id}: type`)
      used.add(it.name)
    }
  }
  assert.equal(used.size, 38)
})

console.log('buildCatalog refusals')

const HEAD = 'name,type,description,count_all_sheets,sheets,unit_price\n'
const errorsFor = (text) => buildCatalog(text).errors.join('\n')

test('a good CSV keeps only the three fields, prices as numbers', () => {
  const { catalog, errors } = buildCatalog(HEAD + 'E2,Light fixture,"Light fixture, type E2",12,1,195\n')
  assert.deepEqual(errors, [])
  assert.deepEqual(catalog, [{ name: 'E2', type: 'Light fixture', unit_price: 195 }])
})

test('a name listed twice is refused', () => {
  const t = HEAD + 'E2,Light fixture,,1,1,195\nE2,Light fixture,,1,1,195\n'
  assert.match(errorsFor(t), /row 3 \(E2\): name listed twice/)
  assert.equal(buildCatalog(t).catalog, null)
})

test('a missing column is refused', () => {
  assert.match(errorsFor('name,type\nE2,Light fixture\n'), /missing column "unit_price"/)
})

test('a type outside the nine is refused', () => {
  assert.match(errorsFor(HEAD + 'E2,Lamp,,1,1,195\n'), /type "Lamp" is not one of the nine types/)
})

test('a price that is empty, negative, zero, text or would be reformatted is refused', () => {
  for (const bad of ['', '-5', '0', 'abc', '195.50', '0195', ' 1e3']) {
    const t = HEAD + `E2,Light fixture,,1,1,"${bad}"\n`
    assert.match(errorsFor(t), /is not a plain positive number/, JSON.stringify(bad))
  }
})

console.log('CLI')

test('bad CSV: exit 1 and nothing written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-'))
  try {
    writeFileSync(join(dir, 'catalog.csv'), HEAD + 'E2,Lamp,,1,1,195\n')
    const out = join(dir, 'catalog.json')
    const r = spawnSync(process.execPath, [join(here, 'import-catalog.js'), '--handoff-dir', dir, '--out', out], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /nothing written/)
    assert.equal(existsSync(out), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

console.log(`\n${passed} tests passed`)
