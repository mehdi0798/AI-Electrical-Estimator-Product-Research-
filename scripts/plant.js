// Plant the study errors (v0.2 step 7). Local only.
//
//   npm run plant
//   node scripts/plant.js [--plan planting/plan.json] [--baseline-dir baseline]
//                         [--sheets-dir public/sheets] [--key-dir answer-key]
//
// Reads the plan, the baselines and src/config/catalog.json. Writes
// public/sheets/sheet1..6.json (participant lists, errors planted) and
// answer-key/sheet1..6.key.json. All six are checked first; if any check fails,
// NOTHING is written. practice.json is never touched. Run `npm run validate` after.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED } from './import-lib.js'
import { formatKey, plantSheet } from './plant-lib.js'
import { formatSheet } from './sheet-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha = (x) => createHash('sha256').update(x).digest('hex')

function fail(lines) {
  for (const l of [].concat(lines)) console.error(`plant: ${l}`)
  console.error('plant: nothing written.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opts = {
  plan: join(root, 'planting', 'plan.json'),
  baselineDir: join(root, 'baseline'),
  sheetsDir: join(root, 'public', 'sheets'),
  keyDir: join(root, 'answer-key'),
  catalog: join(root, 'src', 'config', 'catalog.json'),
}
const flags = { '--plan': 'plan', '--baseline-dir': 'baselineDir', '--sheets-dir': 'sheetsDir', '--key-dir': 'keyDir', '--catalog': 'catalog' }
for (let i = 0; i < args.length; i += 2) {
  if (!flags[args[i]]) fail(`unknown argument ${args[i]}`)
  if (args[i + 1] === undefined) fail(`${args[i]} needs a value`)
  opts[flags[args[i]]] = resolve(args[i + 1])
}
const read = (p) => {
  if (!existsSync(p)) fail(`missing file ${p}`)
  return readFileSync(p)
}

const planText = read(opts.plan)
const plan = JSON.parse(planText)
const catalog = JSON.parse(read(opts.catalog))
const out = []
const errors = []
for (const sheet of Object.keys(EXPECTED)) {
  const baselineText = read(join(opts.baselineDir, `${sheet}.baseline.json`))
  const baseline = JSON.parse(baselineText)
  const png = read(join(opts.sheetsDir, `${sheet}.png`))
  if (sha(png) !== baseline.image_sha256) errors.push(`${sheet}: ${sheet}.png does not match the baseline's image_sha256`)
  const r = plantSheet({ sheet, baseline, catalog, plan: plan[sheet] })
  errors.push(...r.errors)
  if (r.sheet) {
    const sheetText = formatSheet(r.sheet)
    const keyText = formatKey(r.key, { sheet: sha(sheetText), baseline: sha(baselineText), plan: sha(planText) })
    out.push({ sheet, sheetText, keyText, r })
  }
}
if (errors.length) fail(errors)

mkdirSync(opts.keyDir, { recursive: true })
for (const { sheet, sheetText, keyText, r } of out) {
  writeFileSync(join(opts.sheetsDir, `${sheet}.json`), sheetText)
  writeFileSync(join(opts.keyDir, `${sheet}.key.json`), keyText)
  const overs = r.key.manipulations.filter((m) => m.direction === 'OVER')
  console.log(`${sheet}: ${r.sheet.items.length} rows; UNDER ${r.key.manipulations.filter((m) => m.direction === 'UNDER').map((m) => m.id).join(', ')}; OVER ${overs.map((m) => `${m.id} at ${m.list_position}/${r.sheet.items.length}`).join(', ')}`)
}
console.log(`Wrote ${out.length} sheets to ${opts.sheetsDir} and ${out.length} answer keys to ${opts.keyDir}. Now run: npm run validate`)
