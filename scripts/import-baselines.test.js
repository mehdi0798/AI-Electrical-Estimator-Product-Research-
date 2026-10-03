// Tests for the baseline import (v0.2 step 1). Run: node scripts/import-baselines.test.js
// All fixtures are generated in a temp folder; the real handoff/ and baseline/
// are never touched.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED, buildBaseline, readCatalog } from './import-lib.js'

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

// Minimal PNG (signature + IHDR); the bytes after the size make each one unique.
function fakePng(w, h, salt = '') {
  const b = Buffer.alloc(40 + salt.length)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  b.write(salt, 40, 'ascii')
  return b
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

const CATALOG = 'name,type,description,count_all_sheets,sheets,unit_price\n' +
  'E2,Light fixture,"Light fixture, type E2",1,1,210\n' +
  'Duplex receptacle,Receptacle,"Duplex receptacle, wall",1,1,85\n'
const HEADER = 'id,name,type,description,label,where,x,y,status'

// n valid rows inside a w x h image. Descriptions contain commas (quoted).
function itemsCsv(n, w, h, mutate = (rows) => rows) {
  const rows = []
  for (let i = 1; i <= n; i++) {
    const even = i % 2 === 0
    rows.push({
      id: `B${String(i).padStart(3, '0')}`,
      name: even ? 'Duplex receptacle' : 'E2',
      type: even ? 'Receptacle' : 'Light fixture',
      description: even ? '"Duplex receptacle, wall"' : '"Light fixture, type E2"',
      label: even ? '' : 'E2',
      where: `"Room A, row ${i}"`,
      x: String((i * 7) % w),
      y: String((i * 5) % h),
      status: 'sure',
    })
  }
  return [HEADER, ...mutate(rows).map((r) => HEADER.split(',').map((k) => r[k]).join(','))].join('\n') + '\n'
}

// A complete fake handoff + public/sheets for all six sheets.
function makeHandoff(dir, { mutateSheet1 = (r) => r, sheet1Png, summaryEdit = (s) => s } = {}) {
  const handoff = join(dir, 'handoff')
  const sheets = join(dir, 'public-sheets')
  mkdirSync(join(handoff, 'baseline_lists'), { recursive: true })
  mkdirSync(sheets, { recursive: true })
  writeFileSync(join(handoff, 'catalog.csv'), CATALOG)
  const summary = ['sheet,items,image_width,image_height,image_sha256']
  for (const [sheet, e] of Object.entries(EXPECTED)) {
    const png = sheet === 'sheet1' && sheet1Png ? sheet1Png : fakePng(e.width, e.height, sheet)
    writeFileSync(join(sheets, `${sheet}.png`), png)
    const realPng = fakePng(e.width, e.height, sheet)
    writeFileSync(
      join(handoff, 'baseline_lists', `${sheet}.items.csv`),
      itemsCsv(e.items, e.width, e.height, sheet === 'sheet1' ? mutateSheet1 : (r) => r),
    )
    summary.push(summaryEdit([sheet.slice(5), e.items, e.width, e.height, sha(realPng)], sheet).join(','))
  }
  writeFileSync(join(handoff, 'sheets_summary.csv'), summary.join('\n') + '\n')
  return { handoff, sheets, out: join(dir, 'baseline') }
}

const runCli = ({ handoff, sheets, out }) =>
  spawnSync(
    process.execPath,
    [join(here, 'import-baselines.js'), '--handoff-dir', handoff, '--sheets-dir', sheets, '--out-dir', out],
    { encoding: 'utf8' },
  )

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'import-test-'))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const catalog = readCatalog(CATALOG).types
const s1 = EXPECTED.sheet1
const png1 = fakePng(s1.width, s1.height, 'sheet1')
const summary1 = { items: String(s1.items), image_width: String(s1.width), image_height: String(s1.height), image_sha256: sha(png1) }
const build = (itemsText, extra = {}) =>
  buildBaseline({ sheet: 'sheet1', itemsText, summary: summary1, png: png1, catalog, ...extra })

console.log('buildBaseline')

test('a good list becomes a baseline: all fields, whole-pixel x,y, quoted commas kept', () => {
  const { baseline, errors } = build(itemsCsv(s1.items, s1.width, s1.height))
  assert.deepEqual(errors, [])
  assert.equal(baseline.sheet, 'sheet1')
  assert.equal(baseline.image, '/sheets/sheet1.png')
  assert.deepEqual(baseline.image_size, { width: 1100, height: 433 })
  assert.equal(baseline.image_sha256, sha(png1))
  assert.equal(baseline.items.length, 52)
  assert.deepEqual(baseline.items[0], {
    id: 'B001', name: 'E2', type: 'Light fixture', description: 'Light fixture, type E2',
    label: 'E2', where: 'Room A, row 1', x: 7, y: 5, status: 'sure',
  })
  assert.deepEqual(Object.keys(baseline), ['sheet', 'image', 'image_size', 'image_sha256', 'items'])
})

test('wrong item count is refused (summary and CLAUDE.md table)', () => {
  const { baseline, errors } = build(itemsCsv(s1.items, s1.width, s1.height, (r) => r.slice(1)))
  assert.equal(baseline, null)
  assert.ok(errors.some((e) => /51 items, summary says 52/.test(e)))
  assert.ok(errors.some((e) => /51 items, CLAUDE.md table says 52/.test(e)))
})

test('x,y outside the image, or not whole pixels, is refused', () => {
  const rows = (r) => {
    r[0].x = String(s1.width) // valid x is 0..1099
    r[1].y = '12.5'
    r[2].x = '-3'
    return r
  }
  const { baseline, errors } = build(itemsCsv(s1.items, s1.width, s1.height, rows))
  assert.equal(baseline, null)
  assert.ok(errors.some((e) => /B001.*\(1100, 5\) is outside the image \(1100x433\)/.test(e)))
  assert.ok(errors.some((e) => /B002.*whole image pixels/.test(e)))
  assert.ok(errors.some((e) => /B003.*whole image pixels/.test(e)))
})

test('a name missing from the catalog, or a type that disagrees with it, is refused', () => {
  const rows = (r) => {
    r[0].name = 'E9'
    r[1].type = 'Light fixture' // Duplex receptacle is a Receptacle
    return r
  }
  const { errors } = build(itemsCsv(s1.items, s1.width, s1.height, rows))
  assert.ok(errors.some((e) => /B001.*"E9" is not in catalog.csv/.test(e)))
  assert.ok(errors.some((e) => /B002.*type "Light fixture" but catalog.csv gives "Duplex receptacle" type "Receptacle"/.test(e)))
})

test('duplicate or malformed ids are refused', () => {
  const rows = (r) => {
    r[1].id = 'B001'
    r[2].id = 'X3'
    return r
  }
  const { errors } = build(itemsCsv(s1.items, s1.width, s1.height, rows))
  assert.ok(errors.some((e) => /duplicate id/.test(e)))
  assert.ok(errors.some((e) => /X3.*id must look like B001/.test(e)))
})

test('image size or sha256 different from the summary is refused', () => {
  const other = fakePng(s1.width, s1.height, 'changed bytes')
  assert.ok(build(itemsCsv(52, 1100, 433), { png: other }).errors.some((e) => /sha256 does not match/.test(e)))
  const resized = fakePng(1000, 433, 'sheet1')
  const r = build(itemsCsv(52, 1000, 433), { png: resized })
  assert.ok(r.errors.some((e) => /image is 1000x433, summary says 1100x433/.test(e)))
  assert.ok(r.errors.some((e) => /CLAUDE.md table says 1100x433/.test(e)))
})

test('a missing column is refused', () => {
  const text = itemsCsv(52, 1100, 433).replace('status', 'state')
  assert.ok(build(text).errors.some((e) => /missing column\(s\): status/.test(e)))
})

test('the catalog must not list a name twice', () => {
  assert.ok(readCatalog(CATALOG + 'E2,Light fixture,,1,1,99\n').errors.some((e) => /"E2" listed twice/.test(e)))
})

console.log('CLI')

test('good handoff: writes all six baselines; a second run gives identical files', () => {
  withTemp((dir) => {
    const paths = makeHandoff(dir)
    const r = runCli(paths)
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(readdirSync(paths.out).sort(), Object.keys(EXPECTED).map((s) => `${s}.baseline.json`))
    for (const [sheet, e] of Object.entries(EXPECTED)) {
      const b = JSON.parse(readFileSync(join(paths.out, `${sheet}.baseline.json`), 'utf8'))
      assert.equal(b.items.length, e.items)
    }
    assert.match(r.stdout, /Wrote 6 baselines \(312 items\)/)
    const first = readFileSync(join(paths.out, 'sheet3.baseline.json'), 'utf8')
    assert.equal(runCli(paths).status, 0)
    assert.equal(readFileSync(join(paths.out, 'sheet3.baseline.json'), 'utf8'), first)
  })
})

test('one bad sheet: exit 1 and NOTHING is written, not even the good sheets', () => {
  withTemp((dir) => {
    const paths = makeHandoff(dir, {
      mutateSheet1: (r) => {
        r[5].x = '5000'
        return r
      },
    })
    const r = runCli(paths)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /sheet1: row 7 \(B006\): \(5000, .*\) is outside the image/)
    assert.match(r.stderr, /nothing written/)
    assert.equal(existsSync(paths.out), false)
  })
})

test('a PNG that differs from the summary stops the whole import', () => {
  withTemp((dir) => {
    const paths = makeHandoff(dir, { sheet1Png: fakePng(1100, 433, 're-encoded') })
    const r = runCli(paths)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /sheet1: image sha256 does not match sheets_summary.csv/)
    assert.equal(existsSync(paths.out), false)
  })
})

console.log(`\n${passed} tests passed`)
