// Tests for the planted sheets and answer keys (v0.2 step 7).
// Run: node scripts/plant.test.js
// Checks public/sheets/sheet1..6.json and answer-key/ against the plan, the
// baselines and the catalog. Refusal cases run in memory or in temp folders.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED } from './import-lib.js'
import { EXCLUDED, RULES, formatKey, plantSheet } from './plant-lib.js'
import { buildSheet, confidenceFor, formatSheet } from './sheet-lib.js'
import { validateSheet } from './validate-lib.js'
import { scoreSheet } from './score-lib.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const SHEETS = Object.keys(EXPECTED)
const text = (...p) => readFileSync(join(root, ...p), 'utf8')
const json = (...p) => JSON.parse(text(...p))
const sha = (x) => createHash('sha256').update(x).digest('hex')
const CATALOG = json('src', 'config', 'catalog.json')
const PRICE = new Map(CATALOG.map((e) => [e.name, e.unit_price]))
const PLAN = json('planting', 'plan.json')
const base = (s) => json('baseline', `${s}.baseline.json`)
const sheetOf = (s) => json('public', 'sheets', `${s}.json`)
const keyOf = (s) => json('answer-key', `${s}.key.json`)
const unplanted = (s) => buildSheet({ sheet: s, baseline: base(s), catalog: CATALOG, pngSha: base(s).image_sha256 }).sheet
const pos = (it) => `${it.name}|${it.x}|${it.y}`

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

console.log('planted sheets and answer keys')

test('sheet and key files are exactly what plant.js writes; key hashes match the files', () => {
  const planText = readFileSync(join(root, 'planting', 'plan.json'))
  for (const s of SHEETS) {
    const r = plantSheet({ sheet: s, baseline: base(s), catalog: CATALOG, plan: PLAN[s] })
    assert.deepEqual(r.errors, [])
    const st = formatSheet(r.sheet)
    assert.equal(st, text('public', 'sheets', `${s}.json`), s)
    const k = formatKey(r.key, { sheet: sha(st), baseline: sha(readFileSync(join(root, 'baseline', `${s}.baseline.json`))), plan: sha(planText) })
    assert.equal(k, text('answer-key', `${s}.key.json`), s)
  }
})

test('exactly 2 UNDER + 2 OVER per sheet (12 + 12), one of each per pair, at the same price', () => {
  let u = 0, o = 0
  for (const s of SHEETS) {
    const m = keyOf(s).manipulations
    assert.equal(m.filter((x) => x.direction === 'UNDER').length, 2, s)
    assert.equal(m.filter((x) => x.direction === 'OVER').length, 2, s)
    for (const pid of new Set(m.map((x) => x.pair_id))) {
      const pr = m.filter((x) => x.pair_id === pid)
      assert.deepEqual(pr.map((x) => x.direction).sort(), ['OVER', 'UNDER'], `${s} ${pid}`)
      assert.equal(pr[0].cost, pr[1].cost, `${s} ${pid}: price`)
      for (const x of pr) assert.equal(x.cost, PRICE.get(x.name), `${s} ${x.id}: catalog price`)
    }
    u += 2; o += 2
  }
  assert.equal(u, 12); assert.equal(o, 12)
})

test('counts unchanged (52/45/55/54/59/47); every other real row is identical to the unplanted step 4 row', () => {
  for (const s of SHEETS) {
    const items = sheetOf(s).items
    assert.equal(items.length, EXPECTED[s].items, s)
    const m = keyOf(s).manipulations
    const overIds = new Set(m.filter((x) => x.direction === 'OVER').map((x) => x.id))
    const deleted = new Set(m.filter((x) => x.direction === 'UNDER').map((x) => `${x.name}|${x.x}|${x.y}`))
    const strip = ({ id, ...rest }) => rest
    const expected = unplanted(s).items.filter((it) => !deleted.has(pos(it))).map(strip)
    const real = items.filter((it) => !overIds.has(it.id)).map(strip)
    assert.deepEqual(real.slice().sort((a, b) => pos(a).localeCompare(pos(b))), expected.slice().sort((a, b) => pos(a).localeCompare(pos(b))), s)
  }
})

test('UNDER (Hard rule 1): no row for the deleted item, ids S<n>-1..N with no gap, symbol still on the PNG', () => {
  for (const s of SHEETS) {
    const items = sheetOf(s).items
    assert.deepEqual(items.map((it) => it.id), items.map((_, i) => `S${s.slice(5)}-${i + 1}`), s)
    const b = base(s)
    for (const m of keyOf(s).manipulations.filter((x) => x.direction === 'UNDER')) {
      const bi = b.items.find((i) => i.id === m.id)
      assert.ok(bi && bi.x === m.x && bi.y === m.y && bi.name === m.name, `${s} ${m.id}`)
      assert.ok(!items.some((it) => it.x === m.x && it.y === m.y), `${s} ${m.id}: a row sits at the deleted x,y`)
      assert.ok(items.some((it) => it.name === m.name), `${s} ${m.id}: "${m.name}" disappeared from the list`)
      assert.ok(!(EXCLUDED[s] ?? []).includes(m.id), `${s} ${m.id}: excluded item planted`)
      const near = Math.min(...items.map((it) => Math.hypot(it.x - m.x, it.y - m.y)))
      assert.ok(near >= RULES.underMinNeighbour, `${s} ${m.id}: nearest listed ${near.toFixed(0)} px`)
    }
    // The PNG is the byte-for-byte step 1 image.
    assert.equal(sha(readFileSync(join(root, 'public', 'sheets', `${s}.png`))), b.image_sha256, `${s}.png`)
  }
})

test('OVER (Hard rule 2): phantom rows look exactly like real rows, mid-list, never last, not adjacent', () => {
  for (const s of SHEETS) {
    const items = sheetOf(s).items
    const N = items.length
    const real = items.filter((it) => !keyOf(s).manipulations.some((m) => m.direction === 'OVER' && m.id === it.id))
    const lo = Math.min(...real.map((r) => r.confidence)), hi = Math.max(...real.map((r) => r.confidence))
    const ps = []
    for (const m of keyOf(s).manipulations.filter((x) => x.direction === 'OVER')) {
      const i = items.findIndex((it) => it.id === m.id)
      const it = items[i]
      ps.push(i + 1)
      assert.deepEqual(Object.keys(it), ['id', 'name', 'type', 'x', 'y', 'confidence', 'unit_price'], `${s} ${m.id}`)
      assert.equal(it.type, CATALOG.find((e) => e.name === it.name).type)
      assert.equal(it.unit_price, PRICE.get(it.name))
      assert.equal(it.confidence, confidenceFor(s, it), `${s} ${m.id}: same seeded confidence rule`)
      assert.ok(it.confidence >= lo && it.confidence <= hi, `${s} ${m.id}: confidence in the real range`)
      assert.ok(i + 1 < N, `${s} ${m.id}: last row`)
      assert.ok(i + 1 > Math.ceil(N * 0.1) && i + 1 <= Math.floor(N * 0.9), `${s} ${m.id}: position ${i + 1}/${N}`)
      assert.ok(real.some((r) => r.name === it.name), `${s} ${m.id}: name has a real item on the sheet`)
      assert.deepEqual([m.x, m.y, m.cost, m.name], [it.x, it.y, it.unit_price, it.name])
    }
    assert.notEqual(Math.abs(ps[0] - ps[1]), 1, `${s}: phantoms adjacent`)
  }
})

test('the planted sheets pass the validator with no errors and no warnings', () => {
  for (const s of SHEETS) {
    const png = readFileSync(join(root, 'public', 'sheets', `${s}.png`))
    const r = validateSheet({ sheet: sheetOf(s), key: keyOf(s), imageSize: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, isPractice: false })
    assert.deepEqual(r, { errors: [], warnings: [] }, s)
  }
})

test('scoring with the real keys: reject phantom = caught; add on deleted spot = caught; add on a phantom or real symbol = not', () => {
  const R = 30
  for (const s of SHEETS) {
    const key = keyOf(s)
    const [u1] = key.manipulations.filter((m) => m.direction === 'UNDER')
    const [o1, o2] = key.manipulations.filter((m) => m.direction === 'OVER')
    const realRow = sheetOf(s).items.find((it) => it.id !== o1.id && it.id !== o2.id)
    let t = 1
    const ev = (action, extra) => ({ participant: 'A', session: 'x', sheet: s, action, client_ts: t++, ...extra })
    const events = [
      ev('sheet_opened', {}),
      ev('rejected', { item_id: o1.id, old_value: null, new_value: 'rejected' }),
      ev('edited', { item_id: o2.id, old_value: o2.name, new_value: 'H' }), // edited, not rejected
      ev('add_missing', { item_id: `ADD-${s}-1`, x: u1.x + 29, y: u1.y, new_value: u1.name }),
      ev('add_missing', { item_id: `ADD-${s}-2`, x: o2.x, y: o2.y, new_value: o2.name }),
      ev('add_missing', { item_id: `ADD-${s}-3`, x: realRow.x, y: realRow.y, new_value: realRow.name }),
      ev('confirmed', { item_id: s, new_value: 1 }),
    ]
    const r = scoreSheet(events, key, R)
    const caught = Object.fromEntries([...r.overs.map((o) => [o.m.id, o.caught]), ...r.unders.map((u) => [u.m.id, u.caught])])
    const under = key.manipulations.filter((m) => m.direction === 'UNDER')
    assert.equal(caught[o1.id], true, `${s}: rejected phantom`)
    assert.equal(caught[o2.id], false, `${s}: edited-not-rejected phantom`)
    assert.equal(caught[under[0].id], true, `${s}: add 29 px from the deleted item`)
    assert.equal(caught[under[1].id], false, `${s}: no add near the second deleted item`)
    assert.equal(r.unmatchedAdds.length, 2, `${s}: adds on a phantom / real symbol match nothing`)
  }
})

console.log('plantSheet refusals')

const s5 = (mut) => {
  const plan = JSON.parse(JSON.stringify(PLAN.sheet5))
  mut(plan)
  return plantSheet({ sheet: 'sheet5', baseline: base('sheet5'), catalog: CATALOG, plan }).errors.join('\n')
}
test('different prices in a pair are refused', () => assert.match(s5((p) => (p.pairs[0].over.name = 'D')), /price differs/))
test('a phantom name with no real item on the sheet is refused', () => assert.match(s5((p) => (p.pairs[0].over.name = 'D6')), /no real item on this sheet/))
test('a phantom too close to a deleted item is refused', () => assert.match(s5((p) => Object.assign(p.pairs[0].over, { x: 300, y: 600 })), /from deleted B049/))
test('an excluded ambiguous item is refused', () => {
  const plan = JSON.parse(JSON.stringify(PLAN.sheet4)); plan.pairs[0].under = 'B041'
  assert.match(plantSheet({ sheet: 'sheet4', baseline: base('sheet4'), catalog: CATALOG, plan }).errors.join('\n'), /excluded/)
})
test('a deletion closer than 60 px to another symbol is refused', () => {
  const plan = JSON.parse(JSON.stringify(PLAN.sheet4)); plan.pairs[0].under = 'B022'
  assert.match(plantSheet({ sheet: 'sheet4', baseline: base('sheet4'), catalog: CATALOG, plan }).errors.join('\n'), /from the nearest listed symbol/)
})
test('a phantom outside 45-90 px of its nearest symbol is refused', () => {
  assert.match(s5((p) => Object.assign(p.pairs[1].over, { x: 1166, y: 600 })), /nearest listed symbol 93 px \(allowed 45-90\)/)
})
test('only 1 pair is refused', () => assert.match(s5((p) => p.pairs.pop()), /1 pairs, expected 2/))

console.log('CLI')

test('one bad sheet: exit 1 and NOTHING written (no sheet, no key, practice untouched)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plant-'))
  try {
    const sdir = join(dir, 'sheets'); const kdir = join(dir, 'keys'); mkdirSync(sdir)
    for (const s of SHEETS) copyFileSync(join(root, 'public', 'sheets', `${s}.png`), join(sdir, `${s}.png`))
    writeFileSync(join(sdir, 'practice.json'), 'PRACTICE')
    const bad = JSON.parse(JSON.stringify(PLAN)); bad.sheet6.pairs[0].over.name = 'H'
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(bad))
    const r = spawnSync(process.execPath, [join(here, 'plant.js'), '--plan', join(dir, 'plan.json'), '--sheets-dir', sdir, '--key-dir', kdir], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /nothing written/)
    assert.equal(existsSync(kdir), false)
    assert.deepEqual(readdirSync(sdir).filter((f) => f.endsWith('.json')), ['practice.json'])
    assert.equal(readFileSync(join(sdir, 'practice.json'), 'utf8'), 'PRACTICE')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

console.log(`\n${passed} tests passed`)
