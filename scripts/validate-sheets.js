// Validate authored sheets against their answer keys. Local tool only.
//
//   node scripts/validate-sheets.js [--sheets-dir public/sheets] [--key-dir answer-key]
//
// Checks every <id>.json in the sheets dir (practice.json and sheet1..6.json)
// against <key-dir>/<id>.key.json. See scripts/validate-lib.js for the checks.
// Exits 1 if any sheet has an error; warnings alone exit 0.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pngSize, validateSheet } from './validate-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(msg) {
  console.error(`validate-sheets.js: ${msg}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const opts = { sheetsDir: join(root, 'public', 'sheets'), keyDir: join(root, 'answer-key') }
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--sheets-dir') opts.sheetsDir = resolve(args[++i] ?? fail('--sheets-dir needs a value'))
  else if (a === '--key-dir') opts.keyDir = resolve(args[++i] ?? fail('--key-dir needs a value'))
  else fail(`unknown argument ${a}`)
}

// The site root that sheet.image paths ("/sheets/sheet1.png") are relative to.
const publicDir = dirname(opts.sheetsDir)

let files
try {
  files = readdirSync(opts.sheetsDir).filter((f) => f.endsWith('.json'))
} catch (err) {
  fail(`cannot read sheets directory ${opts.sheetsDir}: ${err.message}`)
}
if (files.length === 0) fail(`no sheet JSON files in ${opts.sheetsDir}`)
// practice first, then sheet1..sheetN in numeric order
files.sort((a, b) =>
  a === 'practice.json' ? -1 : b === 'practice.json' ? 1 : a.localeCompare(b, undefined, { numeric: true }),
)

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

console.log(`Sheets: ${opts.sheetsDir}`)
console.log(`Keys:   ${opts.keyDir}${existsSync(opts.keyDir) ? '' : '  (directory does not exist)'}`)
console.log('')

let errorCount = 0
let warningCount = 0
const imageBySheet = new Map()

for (const f of files) {
  const id = f.replace(/\.json$/, '')
  const errors = []
  const warnings = []

  let sheet = null
  try {
    sheet = readJson(join(opts.sheetsDir, f))
  } catch (err) {
    errors.push(`cannot parse ${f}: ${err.message}`)
  }

  if (sheet) {
    if (sheet.id !== undefined && sheet.id !== id) {
      errors.push(`sheet id "${sheet.id}" does not match its file name (${f})`)
    }

    let imageSize = null
    if (typeof sheet.image === 'string' && sheet.image) {
      const imgPath = join(publicDir, sheet.image.replace(/^\/+/, ''))
      try {
        imageSize = pngSize(readFileSync(imgPath))
        imageBySheet.set(id, sheet.image)
      } catch (err) {
        errors.push(`image ${sheet.image}: ${err.code === 'ENOENT' ? 'file not found' : err.message}`)
      }
    }

    let key = null
    const keyPath = join(opts.keyDir, `${id}.key.json`)
    if (existsSync(keyPath)) {
      try {
        key = readJson(keyPath)
      } catch (err) {
        errors.push(`cannot parse ${id}.key.json: ${err.message}`)
      }
    }

    const r = validateSheet({ sheet, key, imageSize, isPractice: id === 'practice' })
    errors.push(...r.errors)
    warnings.push(...r.warnings)
  }

  errorCount += errors.length
  warningCount += warnings.length
  console.log(`${(errors.length ? 'FAIL' : 'ok').padEnd(4)} ${id}`)
  for (const e of errors) console.log(`       ERROR   ${e}`)
  for (const w of warnings) console.log(`       warning ${w}`)
}

// Cross-sheet: practice must have its own drawing.
const practiceImage = imageBySheet.get('practice')
for (const [id, img] of imageBySheet) {
  if (id !== 'practice' && img === practiceImage) {
    console.log(`       warning practice uses the same image as ${id} (${img})`)
    warningCount++
  }
}

console.log('')
console.log(`${files.length} sheets checked: ${errorCount} errors, ${warningCount} warnings`)
process.exit(errorCount ? 1 : 0)
