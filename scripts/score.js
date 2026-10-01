// Local scoring script (v0.1 step 6a). Run by the researcher, never shipped.
//
//   node scripts/score.js <events.csv> [--session <label>] [--out <file.csv>]
//                         [--config <file>] [--key-dir <dir>]
//
// Reads the CSV exported from the Supabase `event_log` table, the answer keys in
// answer-key/, and the RADIUS from scoring.config.json (there is no default in
// code). Prints a per-participant, per-sheet report and writes one CSV row per
// manipulation.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatReport,
  manipulationsCsv,
  parseEvents,
  scoreAll,
  validateConfig,
  validateKey,
} from './score-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(msg) {
  console.error(`score.js: ${msg}`)
  process.exit(1)
}

// --- args ---
const args = process.argv.slice(2)
let csvPath = null
const opts = {
  session: null,
  out: 'manipulations.csv',
  config: join(root, 'scoring.config.json'),
  keyDir: join(root, 'answer-key'),
}
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--session') opts.session = args[++i]
  else if (a === '--out') opts.out = args[++i]
  else if (a === '--config') opts.config = resolve(args[++i])
  else if (a === '--key-dir') opts.keyDir = resolve(args[++i])
  else if (a.startsWith('--')) fail(`unknown option ${a}`)
  else if (csvPath === null) csvPath = a
  else fail(`unexpected argument ${a}`)
}
if (!csvPath) {
  fail('usage: node scripts/score.js <events.csv> [--session <label>] [--out <file.csv>]')
}
for (const [name, v] of Object.entries(opts)) {
  if (v === undefined) fail(`option --${name} needs a value`)
}

// --- load inputs ---
let radius
try {
  radius = validateConfig(JSON.parse(readFileSync(opts.config, 'utf8'))).radius
} catch (err) {
  fail(`cannot use config ${opts.config}: ${err.message}`)
}

let events
try {
  events = parseEvents(readFileSync(resolve(csvPath), 'utf8'))
} catch (err) {
  fail(`cannot read ${csvPath}: ${err.message}`)
}

// Answer keys: <sheet>.key.json, e.g. sheet3.key.json -> sheet "sheet3".
const keys = new Map()
let keyFiles
try {
  keyFiles = readdirSync(opts.keyDir).filter((f) => f.endsWith('.key.json'))
} catch (err) {
  fail(`cannot read answer-key directory ${opts.keyDir}: ${err.message}`)
}
for (const f of keyFiles) {
  const sheet = f.replace(/\.key\.json$/, '')
  try {
    keys.set(sheet, validateKey(JSON.parse(readFileSync(join(opts.keyDir, f), 'utf8')), f))
  } catch (err) {
    fail(err.message)
  }
}
if (keys.size === 0) fail(`no *.key.json files found in ${opts.keyDir}`)

// --- score ---
const { results, skipped } = scoreAll(events, keys, radius, { session: opts.session })
process.stdout.write(formatReport(results, skipped, radius))

writeFileSync(opts.out, manipulationsCsv(results))
console.log(`Wrote ${opts.out}`)
