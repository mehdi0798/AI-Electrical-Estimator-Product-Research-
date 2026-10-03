// Import the verified handoff lists as baseline files (v0.2 step 1). Local only.
//
//   npm run import-baselines
//   node scripts/import-baselines.js [--handoff-dir handoff] [--sheets-dir public/sheets]
//                                    [--out-dir baseline]
//
// Reads handoff/baseline_lists/sheetN.items.csv, handoff/catalog.csv,
// handoff/sheets_summary.csv and the PNGs already copied to public/sheets/.
// Writes baseline/sheetN.baseline.json for sheets 1-6. All six are checked first;
// if any check fails, NOTHING is written. Output has no timestamp, so the same
// input always gives the same files.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED, buildBaseline, csvObjects, readCatalog } from './import-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(lines) {
  for (const l of [].concat(lines)) console.error(`import-baselines: ${l}`)
  console.error('import-baselines: nothing written.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opts = {
  handoffDir: join(root, 'handoff'),
  sheetsDir: join(root, 'public', 'sheets'),
  outDir: join(root, 'baseline'),
}
for (let i = 0; i < args.length; i++) {
  const value = args[i + 1]
  if (args[i] === '--handoff-dir') opts.handoffDir = resolve(value ?? fail('--handoff-dir needs a value'))
  else if (args[i] === '--sheets-dir') opts.sheetsDir = resolve(value ?? fail('--sheets-dir needs a value'))
  else if (args[i] === '--out-dir') opts.outDir = resolve(value ?? fail('--out-dir needs a value'))
  else fail(`unknown argument ${args[i]}`)
  i++
}

const read = (path, binary = false) => {
  if (!existsSync(path)) fail(`missing file ${path}`)
  return binary ? readFileSync(path) : readFileSync(path, 'utf8')
}

const { types: catalog, errors: catalogErrors } = readCatalog(read(join(opts.handoffDir, 'catalog.csv')))
if (catalogErrors.length) fail(catalogErrors)

const summaryRows = csvObjects(read(join(opts.handoffDir, 'sheets_summary.csv'))).records
const summaryBySheet = Object.fromEntries(summaryRows.map((r) => [`sheet${r.sheet}`, r]))

// Check all six before writing any.
const results = []
const errors = []
for (const sheet of Object.keys(EXPECTED)) {
  const r = buildBaseline({
    sheet,
    itemsText: read(join(opts.handoffDir, 'baseline_lists', `${sheet}.items.csv`)),
    summary: summaryBySheet[sheet],
    png: read(join(opts.sheetsDir, `${sheet}.png`), true),
    catalog,
  })
  errors.push(...r.errors)
  results.push(r.baseline)
}
if (errors.length) fail(errors)

mkdirSync(opts.outDir, { recursive: true })
let total = 0
for (const b of results) {
  writeFileSync(join(opts.outDir, `${b.sheet}.baseline.json`), JSON.stringify(b, null, 2) + '\n')
  total += b.items.length
  console.log(
    `${b.sheet}: ${String(b.items.length).padStart(2)} items, ` +
      `${b.image_size.width}x${b.image_size.height}, all x,y inside the image`,
  )
}
console.log(`Wrote ${results.length} baselines (${total} items) to ${opts.outDir}`)
