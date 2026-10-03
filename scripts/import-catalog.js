// Build the app catalog from the handoff (v0.2 step 3). Local only.
//
//   npm run import-catalog
//   node scripts/import-catalog.js [--handoff-dir handoff] [--out src/config/catalog.json]
//
// Reads handoff/catalog.csv (the authoritative names, types and prices) and
// writes src/config/catalog.json with ONLY name, type and unit_price. If any
// check fails, nothing is written.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog, formatCatalog } from './import-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(lines) {
  for (const l of [].concat(lines)) console.error(`import-catalog: ${l}`)
  console.error('import-catalog: nothing written.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opts = {
  handoffDir: join(root, 'handoff'),
  out: join(root, 'src', 'config', 'catalog.json'),
}
for (let i = 0; i < args.length; i++) {
  const value = args[i + 1]
  if (args[i] === '--handoff-dir') opts.handoffDir = resolve(value ?? fail('--handoff-dir needs a value'))
  else if (args[i] === '--out') opts.out = resolve(value ?? fail('--out needs a value'))
  else fail(`unknown argument ${args[i]}`)
  i++
}

const csvPath = join(opts.handoffDir, 'catalog.csv')
if (!existsSync(csvPath)) fail(`missing file ${csvPath}`)
const { catalog, errors } = buildCatalog(readFileSync(csvPath, 'utf8'))
if (errors.length) fail(errors)

writeFileSync(opts.out, formatCatalog(catalog))
const types = new Set(catalog.map((e) => e.type))
console.log(`Wrote ${catalog.length} names in ${types.size} types to ${opts.out}`)
