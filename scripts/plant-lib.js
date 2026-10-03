// Plant the study errors (v0.2 step 7). Pure functions; scripts/plant.js does the
// file reading and writing. Local tool only, never bundled into the participant
// app (Hard rule 6).
//
// Per sheet: 2 pairs. Each pair is one UNDER (a baseline item whose row is
// removed; its symbol stays on the drawing) and one OVER (a phantom row at a
// spot where no such item exists), at exactly the same catalog price.
// Kept rows are built exactly as in step 4 (sheet-lib.js). Phantoms get their
// confidence from the same seeded rule. Ids are assigned AFTER planting, in list
// order, so no gap shows (Hard rule 1).

import { EXPECTED } from './import-lib.js'
import { confidenceFor, idPrefix, sortForDisplay } from './sheet-lib.js'

// Ambiguous close pairs found in step 5: never planted.
export const EXCLUDED = { sheet3: ['B054', 'B055'], sheet4: ['B041', 'B042'] }

// Placement rules (same on every sheet). Distances in original image pixels.
export const RULES = {
  pairs: 2,
  underMinNeighbour: 60, // UNDER: nearest other listed symbol (2 x scoring RADIUS 30)
  overNeighbour: [45, 90], // OVER: nearest listed symbol (busy area, but its own spot)
  overMinSameName: 60, // OVER: nearest real item of the same name
  overMinToUnder: 150, // OVER: from each deleted item on the sheet
  overMinApart: 300, // the two phantoms on a sheet: different areas
  edge: 40, // OVER: from the image edge
  midList: 0.1, // OVER: not in the top or bottom 10 % of the list
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Returns { sheet, key, errors }; sheet and key are null on any error.
//   plan: { pairs: [ { pair_id, under: 'B0xx', over: { name, x, y } } ] }
export function plantSheet({ sheet, baseline, catalog, plan }) {
  const errors = []
  const err = (m) => errors.push(`${sheet}: ${m}`)
  const exp = EXPECTED[sheet]
  if (!exp) return { sheet: null, key: null, errors: [`${sheet}: unknown sheet`] }
  if (baseline.items?.length !== exp.items) err(`baseline has ${baseline.items?.length} items, expected ${exp.items}`)
  const { width: W, height: H } = baseline.image_size
  const byName = new Map(catalog.map((e) => [e.name, e]))
  const pairs = plan?.pairs ?? []
  if (pairs.length !== RULES.pairs) err(`${pairs.length} pairs, expected ${RULES.pairs}`)
  if (new Set(pairs.map((p) => p.pair_id)).size !== pairs.length) err('pair_id used twice')

  const unders = pairs.map((p) => baseline.items.find((i) => i.id === p.under))
  pairs.forEach((p, k) => {
    if (!unders[k]) err(`pair ${p.pair_id}: UNDER ${p.under} is not in the baseline`)
    if ((EXCLUDED[sheet] ?? []).includes(p.under)) err(`pair ${p.pair_id}: ${p.under} is an excluded ambiguous item`)
  })
  if (new Set(pairs.map((p) => p.under)).size !== pairs.length) err('the same item is deleted twice')
  if (errors.length) return { sheet: null, key: null, errors }

  const kept = baseline.items.filter((i) => !unders.includes(i))
  const row = (it) => {
    const e = byName.get(it.name)
    return { name: it.name, type: e?.type, x: it.x, y: it.y, confidence: confidenceFor(sheet, it), unit_price: e?.unit_price }
  }
  const phantoms = pairs.map((p) => ({ ...row(p.over), pair_id: p.pair_id }))

  pairs.forEach((p, k) => {
    const u = unders[k]
    const o = p.over
    const at = `pair ${p.pair_id}`
    // UNDER
    const uNear = Math.min(...[...kept, ...phantoms].map((x) => dist(x, u)))
    if (uNear < RULES.underMinNeighbour) err(`${at}: UNDER ${u.id} is ${uNear.toFixed(0)} px from the nearest listed symbol (min ${RULES.underMinNeighbour})`)
    if (!kept.some((x) => x.name === u.name)) err(`${at}: deleting ${u.id} removes every "${u.name}" row`)
    // OVER
    const e = byName.get(o.name)
    if (!e) { err(`${at}: OVER name "${o.name}" is not in the catalog`); return }
    if (e.unit_price !== byName.get(u.name).unit_price) err(`${at}: price differs (UNDER ${u.name} €${byName.get(u.name).unit_price}, OVER ${o.name} €${e.unit_price})`)
    if (!kept.some((x) => x.name === o.name)) err(`${at}: OVER name "${o.name}" has no real item on this sheet`)
    if (!Number.isInteger(o.x) || !Number.isInteger(o.y)) err(`${at}: OVER x,y must be whole image pixels`)
    if (o.x < RULES.edge || o.y < RULES.edge || o.x > W - RULES.edge || o.y > H - RULES.edge) err(`${at}: OVER (${o.x}, ${o.y}) is within ${RULES.edge} px of the image edge`)
    const near = Math.min(...kept.map((x) => dist(x, o)))
    if (near < RULES.overNeighbour[0] || near > RULES.overNeighbour[1]) err(`${at}: OVER nearest listed symbol ${near.toFixed(0)} px (allowed ${RULES.overNeighbour.join('-')})`)
    const same = Math.min(Infinity, ...kept.filter((x) => x.name === o.name).map((x) => dist(x, o)))
    if (same < RULES.overMinSameName) err(`${at}: OVER is ${same.toFixed(0)} px from a real "${o.name}" (min ${RULES.overMinSameName})`)
    for (const d of unders) if (dist(d, o) < RULES.overMinToUnder) err(`${at}: OVER is ${dist(d, o).toFixed(0)} px from deleted ${d.id} (min ${RULES.overMinToUnder})`)
  })
  if (phantoms.length === 2 && dist(phantoms[0], phantoms[1]) < RULES.overMinApart) err(`the two phantoms are ${dist(phantoms[0], phantoms[1]).toFixed(0)} px apart (min ${RULES.overMinApart})`)
  if (errors.length) return { sheet: null, key: null, errors }

  // Sort, then give ids in list order: S<n>-1..N, no gap.
  const prefix = idPrefix(sheet)
  const ordered = sortForDisplay([...kept.map(row), ...phantoms]).map((it, i) => ({ ...it, id: `${prefix}${i + 1}` }))
  const N = ordered.length
  if (N !== exp.items) err(`planted list has ${N} rows, expected ${exp.items}`)
  const positions = []
  for (const p of phantoms) {
    const pos = ordered.findIndex((r) => r.pair_id === p.pair_id) + 1
    positions.push(pos)
    if (pos === N) err(`pair ${p.pair_id}: phantom is the last row (Hard rule 2)`)
    if (pos <= Math.ceil(N * RULES.midList) || pos > Math.floor(N * (1 - RULES.midList))) err(`pair ${p.pair_id}: phantom at list position ${pos}/${N} is not mid-list`)
  }
  if (positions.length === 2 && Math.abs(positions[0] - positions[1]) === 1) err('the two phantoms are next to each other in the list')
  if (errors.length) return { sheet: null, key: null, errors }

  const items = ordered.map(({ id, name, type, x, y, confidence, unit_price }) => ({ id, name, type, x, y, confidence, unit_price }))
  const manipulations = pairs.flatMap((p, k) => {
    const u = unders[k]
    const ph = ordered.find((r) => r.pair_id === p.pair_id)
    const price = byName.get(u.name).unit_price
    return [
      { id: u.id, direction: 'UNDER', x: u.x, y: u.y, cost: price, pair_id: p.pair_id, name: u.name, type: u.type },
      { id: ph.id, direction: 'OVER', x: ph.x, y: ph.y, cost: ph.unit_price, pair_id: p.pair_id, name: ph.name, type: ph.type, confidence: ph.confidence, list_position: ordered.indexOf(ph) + 1 },
    ]
  })
  return {
    sheet: { id: sheet, name: `Sheet ${sheet.replace(/^sheet/, '')}`, image: `/sheets/${sheet}.png`, items },
    key: { sheet, manipulations },
    errors,
  }
}

// One manipulation per line; hashes tie the key to the exact files it was made from.
export function formatKey(key, hashes) {
  const m = (x) => '    ' + JSON.stringify(x).replace(/,"/g, ', "').replace(/":/g, '": ')
  return (
    '{\n' +
    `  "_note": "ANSWER KEY - researcher only. Never in public/ or src/, never shipped (Hard rule 6).",\n` +
    `  "sheet": ${JSON.stringify(key.sheet)},\n` +
    `  "sheet_json_sha256": ${JSON.stringify(hashes.sheet)},\n` +
    `  "baseline_sha256": ${JSON.stringify(hashes.baseline)},\n` +
    `  "plan_sha256": ${JSON.stringify(hashes.plan)},\n` +
    '  "manipulations": [\n' +
    key.manipulations.map(m).join(',\n') +
    '\n  ]\n}\n'
  )
}
