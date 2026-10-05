// Import the practice sheet (v0.3 step 14). Local only.
//
//   npm run import-practice
//
// Reads handoff/sheets/practice.png, handoff/baseline_lists/practice.items.csv,
// handoff/catalog.csv and src/config/catalog.json. Runs the same checks as the
// six real sheets (step 1 import, step 4 build), then writes:
//   public/sheets/practice.png        the handoff PNG, byte for byte
//   baseline/practice.baseline.json   the full list (no deletions on practice)
//   public/sheets/practice.json       the participant list: ids P-1..P-29, the
//                                     same confidence rule, order and row format
// No planted errors and no answer key: practice is never scored. If any check
// fails, nothing is written. The same input always gives the same files.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRACTICE, buildBaseline, readCatalog } from './import-lib.js'
import { buildSheet, formatSheet } from './sheet-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHEET = 'practice'

function fail(lines) {
  for (const l of [].concat(lines)) console.error(`import-practice: ${l}`)
  console.error('import-practice: nothing written.')
  process.exit(1)
}

const read = (path, binary = false) => {
  if (!existsSync(path)) fail(`missing file ${path}`)
  return binary ? readFileSync(path) : readFileSync(path, 'utf8')
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const png = read(join(root, 'handoff', 'sheets', 'practice.png'), true)
const { types, errors: catalogErrors } = readCatalog(read(join(root, 'handoff', 'catalog.csv')))
if (catalogErrors.length) fail(catalogErrors)

// Step 1 checks: columns, ids, count, names and types against catalog.csv,
// whole-pixel x,y inside the image.
const imported = buildBaseline({
  sheet: SHEET,
  itemsText: read(join(root, 'handoff', 'baseline_lists', 'practice.items.csv')),
  summary: null,
  png,
  catalog: types,
  expected: PRACTICE,
  idPattern: /^P\d+$/,
  idExample: 'P001',
  requireSummary: false,
})
if (imported.errors.length) fail(imported.errors)
const baseline = imported.baseline

// Step 4 build: the app catalog must be the imported one (same prices as the CSV).
const catalog = JSON.parse(read(join(root, 'src', 'config', 'catalog.json')))
const built = buildSheet({
  sheet: SHEET,
  baseline,
  catalog,
  pngSha: sha256(png),
  expected: PRACTICE,
  prefix: 'P-',
  name: 'Practice Sheet',
})
if (built.errors.length) fail(built.errors)

const pngOut = join(root, 'public', 'sheets', 'practice.png')
writeFileSync(pngOut, png)
if (sha256(readFileSync(pngOut)) !== baseline.image_sha256) fail('public/sheets/practice.png is not byte-identical to the handoff PNG')
mkdirSync(join(root, 'baseline'), { recursive: true })
writeFileSync(join(root, 'baseline', 'practice.baseline.json'), JSON.stringify(baseline, null, 2) + '\n')
writeFileSync(join(root, 'public', 'sheets', 'practice.json'), formatSheet(built.sheet))

const conf = built.sheet.items.map((it) => it.confidence)
console.log(`practice.png: ${baseline.image_size.width}x${baseline.image_size.height}, copied byte for byte (sha256 ${baseline.image_sha256.slice(0, 12)}...)`)
console.log(`baseline/practice.baseline.json: ${baseline.items.length} items`)
console.log(
  `public/sheets/practice.json: ${built.sheet.items.length} items, ids ${built.sheet.items[0].id}..${built.sheet.items.at(-1).id}, ` +
    `confidence ${Math.min(...conf).toFixed(2)}-${Math.max(...conf).toFixed(2)}`,
)
