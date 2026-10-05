// Build participant sheets from the baselines (v0.2 step 4). Pure functions;
// scripts/build-sheets.js does the file reading and writing. Local tool only,
// never bundled into the participant app (Hard rule 6).
//
// A participant item keeps only what a participant may see:
//   { id, name, type, x, y, confidence, unit_price }
// The baseline's id (B001...), description, label, where and status stay behind.

import { createHash } from 'node:crypto'
import { EXPECTED } from './import-lib.js'

// --- Confidence ------------------------------------------------------------------
// One fixed, seeded rule, identical for all sheets (CLAUDE.md step 4):
//   u          = first 4 bytes of sha256("voltra-v0.2|<sheet>|<name>|<x>|<y>") / 2^32
//   confidence = round(LOW + u * (HIGH - LOW), 2)
// It depends only on the item itself: no random generator, no clock, no file order.
// So deleting an item (UNDER) never changes another item's value, and a phantom
// (OVER) gets its value from the same rule as the real rows (Hard rule 2).
export const CONFIDENCE_SEED = 'voltra-v0.2'
export const CONFIDENCE_LOW = 0.7
export const CONFIDENCE_HIGH = 0.99

export function confidenceFor(sheet, { name, x, y }) {
  const digest = createHash('sha256').update(`${CONFIDENCE_SEED}|${sheet}|${name}|${x}|${y}`).digest()
  const u = digest.readUInt32BE(0) / 2 ** 32
  return Math.round((CONFIDENCE_LOW + u * (CONFIDENCE_HIGH - CONFIDENCE_LOW)) * 100) / 100
}

// --- Order and ids -----------------------------------------------------------------
// Hard rule 4: confidence, highest first. Ties: top to bottom, then left to right,
// then name, so the order never depends on the input order. The app's sort is
// stable, so it shows exactly this order.
export function sortForDisplay(items) {
  return [...items].sort(
    (a, b) => b.confidence - a.confidence || a.y - b.y || a.x - b.x || a.name.localeCompare(b.name),
  )
}

// Ids follow the final list order: S<n>-1 ... S<n>-N, one prefix, no gap (Hard rule 1).
export const idPrefix = (sheet) => `S${sheet.replace(/^sheet/, '')}-`

// --- Build one sheet ---------------------------------------------------------------
//   sheet:    'sheet1' ... 'sheet6'
//   baseline: parsed baseline/<sheet>.baseline.json
//   catalog:  parsed src/config/catalog.json
//   pngSha:   sha256 (hex) of public/sheets/<sheet>.png as it is now
// Practice (step 14) passes expected = PRACTICE, prefix = 'P-' and its own name;
// the checks, confidence rule, order and row format are the same.
// Returns { sheet, errors }; sheet is null on any error.
export function buildSheet({
  sheet, baseline, catalog, pngSha,
  expected = EXPECTED[sheet], prefix = idPrefix(sheet), name = `Sheet ${sheet.replace(/^sheet/, '')}`,
}) {
  const errors = []
  const err = (msg) => errors.push(`${sheet}: ${msg}`)
  if (!expected) return { sheet: null, errors: [`${sheet}: not one of ${Object.keys(EXPECTED).join(', ')}`] }

  if (baseline.sheet !== sheet) err(`baseline says sheet "${baseline.sheet}"`)
  const image = `/sheets/${sheet}.png`
  if (baseline.image !== image) err(`baseline image "${baseline.image}", expected "${image}"`)
  const { width, height } = baseline.image_size ?? {}
  if (width !== expected.width || height !== expected.height) {
    err(`baseline image size ${width}x${height}, expected ${expected.width}x${expected.height}`)
  }
  if (pngSha !== baseline.image_sha256) err(`public${image} does not match the baseline's image_sha256`)

  const items = baseline.items ?? []
  if (items.length !== expected.items) err(`${items.length} items, expected ${expected.items}`)

  const byName = new Map(catalog.map((e) => [e.name, e]))
  const seenPos = new Set()
  const built = items.map((it) => {
    const at = `item ${it.id}`
    const entry = byName.get(it.name)
    if (!entry) err(`${at}: name "${it.name}" is not in the catalog`)
    else if (entry.type !== it.type) err(`${at}: type "${it.type}" but the catalog gives "${entry.type}"`)
    if (!Number.isInteger(it.x) || !Number.isInteger(it.y)) err(`${at}: x,y must be whole image pixels`)
    else if (it.x < 0 || it.y < 0 || it.x >= width || it.y >= height) {
      err(`${at}: (${it.x}, ${it.y}) is outside the image (${width}x${height})`)
    }
    const pos = `${it.name}|${it.x}|${it.y}`
    if (seenPos.has(pos)) err(`${at}: another item has the same name and x,y`)
    seenPos.add(pos)
    return {
      name: it.name,
      type: entry?.type,
      x: it.x,
      y: it.y,
      confidence: confidenceFor(sheet, it),
      unit_price: entry?.unit_price,
    }
  })
  if (errors.length) return { sheet: null, errors }

  const ordered = sortForDisplay(built).map((it, i) => ({ id: `${prefix}${i + 1}`, ...it }))
  return {
    sheet: { id: sheet, name, image, items: ordered },
    errors,
  }
}

// One item per line, no timestamp: the same input always gives the same file.
export function formatSheet(s) {
  const item = (it) =>
    `    { "id": ${JSON.stringify(it.id)}, "name": ${JSON.stringify(it.name)}, ` +
    `"type": ${JSON.stringify(it.type)}, "x": ${it.x}, "y": ${it.y}, ` +
    `"confidence": ${it.confidence}, "unit_price": ${it.unit_price} }`
  return (
    '{\n' +
    `  "id": ${JSON.stringify(s.id)},\n` +
    `  "name": ${JSON.stringify(s.name)},\n` +
    `  "image": ${JSON.stringify(s.image)},\n` +
    '  "items": [\n' +
    s.items.map(item).join(',\n') +
    '\n  ]\n}\n'
  )
}
