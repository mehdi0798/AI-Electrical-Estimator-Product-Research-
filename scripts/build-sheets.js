// Build the participant sheets from the baselines (v0.2 step 4). Local only.
//
//   npm run build-sheets
//   node scripts/build-sheets.js [--baseline-dir baseline] [--sheets-dir public/sheets]
//                                [--catalog src/config/catalog.json]
//
// Reads baseline/sheetN.baseline.json, src/config/catalog.json and the PNGs in
// public/sheets/. Writes public/sheets/sheet1.json ... sheet6.json with NO planted
// errors. All six are checked first; if any check fails, NOTHING is written.
// practice.json is never touched. Output has no timestamp, so the same input
// always gives the same files.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPECTED } from './import-lib.js'
import { buildSheet, formatSheet } from './sheet-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(lines) {
  for (const l of [].concat(lines)) console.error(`build-sheets: ${l}`)
  console.error('build-sheets: nothing written.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opts = {
  baselineDir: join(root, 'baseline'),
  sheetsDir: join(root, 'public', 'sheets'),
  catalog: join(root, 'src', 'config', 'catalog.json'),
}
for (let i = 0; i < args.length; i++) {
  const value = args[i + 1]
  if (args[i] === '--baseline-dir') opts.baselineDir = resolve(value ?? fail('--baseline-dir needs a value'))
  else if (args[i] === '--sheets-dir') opts.sheetsDir = resolve(value ?? fail('--sheets-dir needs a value'))
  else if (args[i] === '--catalog') opts.catalog = resolve(value ?? fail('--catalog needs a value'))
  else fail(`unknown argument ${args[i]}`)
  i++
}

// After step 7 the public sheets carry the planted errors; rebuilding the
// unplanted lists over them would silently remove every manipulation.
if (opts.sheetsDir === join(root, 'public', 'sheets') && existsSync(join(root, 'answer-key'))) {
  fail('answer-key/ exists: the public sheets are planted (step 7). Use npm run plant instead.')
}

const read = (path, binary = false) => {
  if (!existsSync(path)) fail(`missing file ${path}`)
  return binary ? readFileSync(path) : readFileSync(path, 'utf8')
}

const catalog = JSON.parse(read(opts.catalog))

// Check all six before writing any.
const results = []
const errors = []
for (const sheet of Object.keys(EXPECTED)) {
  const r = buildSheet({
    sheet,
    baseline: JSON.parse(read(join(opts.baselineDir, `${sheet}.baseline.json`))),
    catalog,
    pngSha: createHash('sha256').update(read(join(opts.sheetsDir, `${sheet}.png`), true)).digest('hex'),
  })
  errors.push(...r.errors)
  results.push(r.sheet)
}
if (errors.length) fail(errors)

let total = 0
for (const s of results) {
  writeFileSync(join(opts.sheetsDir, `${s.id}.json`), formatSheet(s))
  total += s.items.length
  const conf = s.items.map((it) => it.confidence)
  console.log(
    `${s.id}: ${String(s.items.length).padStart(2)} items, ids ${s.items[0].id}..${s.items.at(-1).id}, ` +
      `confidence ${Math.min(...conf).toFixed(2)}-${Math.max(...conf).toFixed(2)}`,
  )
}
console.log(`Wrote ${results.length} sheets (${total} items) to ${opts.sheetsDir}`)
