// Turn the handoff item lists into baseline files (v0.2 step 1). Pure checks and
// conversion; scripts/import-baselines.js does the file reading and writing.
//
// A baseline is the FULL TRUTH for one sheet, before any error is planted. It
// contains the items that will later be deleted, so it must never be read by the
// participant app (Hard rule 6). x,y are original image pixels (Hard rule 7).

import { createHash } from 'node:crypto'
import { parseCsv } from './score-lib.js'
import { pngSize } from './validate-lib.js'

// The CLAUDE.md sheet table. The import refuses to run if the handoff disagrees.
export const EXPECTED = {
  sheet1: { items: 52, width: 1100, height: 433 },
  sheet2: { items: 45, width: 1100, height: 542 },
  sheet3: { items: 55, width: 2019, height: 719 },
  sheet4: { items: 54, width: 1100, height: 683 },
  sheet5: { items: 59, width: 1302, height: 706 },
  sheet6: { items: 47, width: 1100, height: 1148 },
}

// The practice sheet (v0.3 step 14): supplied by the researcher with 29 items on
// an 892 x 645 drawing. Not in sheets_summary.csv; ids P001...; never scored.
export const PRACTICE = { items: 29, width: 892, height: 645 }

export const ITEM_COLUMNS = ['id', 'name', 'type', 'description', 'label', 'where', 'x', 'y', 'status']

// CSV text -> array of objects keyed by the (trimmed) header.
export function csvObjects(text) {
  const rows = parseCsv(text)
  if (rows.length === 0) return { header: [], records: [] }
  const header = rows[0].map((h) => h.trim())
  const records = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
  return { header, records }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const isWholeNumber = (s) => /^\d+$/.test(s)

// catalog.csv -> Map(name -> type). Errors if a name is listed twice.
export function readCatalog(text) {
  const { header, records } = csvObjects(text)
  const errors = []
  for (const col of ['name', 'type']) if (!header.includes(col)) errors.push(`catalog.csv: missing column "${col}"`)
  const types = new Map()
  for (const r of records) {
    if (!r.name) errors.push('catalog.csv: a row has no name')
    else if (types.has(r.name)) errors.push(`catalog.csv: name "${r.name}" listed twice`)
    else types.set(r.name, r.type)
  }
  return { types, errors }
}

// The nine item types (CLAUDE.md, "Decisions already made").
export const TYPES = [
  'Light fixture',
  'Track light head',
  'Exit sign',
  'Ceiling fan',
  'Receptacle',
  'Switch',
  'Sensor',
  'Junction box',
  'Panelboard',
]

// catalog.csv -> the app catalog (v0.2 step 3): [{ name, type, unit_price }] in
// CSV order. ONLY these three fields: count_all_sheets and sheets are baseline
// truth and must never ship (Hard rule 6). Prices are taken as given: a price
// that would not read back as the exact CSV text is refused, never reformatted.
// Returns { catalog, errors }; catalog is null on any error.
export function buildCatalog(text) {
  const { header, records } = csvObjects(text)
  const errors = []
  for (const col of ['name', 'type', 'unit_price']) {
    if (!header.includes(col)) errors.push(`catalog.csv: missing column "${col}"`)
  }
  if (errors.length) return { catalog: null, errors }
  const seen = new Set()
  const catalog = records.map((r, i) => {
    const at = `catalog.csv: row ${i + 2}${r.name ? ` (${r.name})` : ''}`
    if (!r.name) errors.push(`${at}: no name`)
    else if (seen.has(r.name)) errors.push(`${at}: name listed twice`)
    seen.add(r.name)
    if (!TYPES.includes(r.type)) errors.push(`${at}: type "${r.type}" is not one of the nine types`)
    const price = Number(r.unit_price)
    if (!/^\d+(\.\d+)?$/.test(r.unit_price) || !(price > 0) || String(price) !== r.unit_price) {
      errors.push(`${at}: unit_price "${r.unit_price}" is not a plain positive number`)
    }
    return { name: r.name, type: r.type, unit_price: price }
  })
  if (catalog.length === 0) errors.push('catalog.csv: no rows')
  return { catalog: errors.length ? null : catalog, errors }
}

// One entry per line, no timestamp: the same CSV always gives the same file.
export function formatCatalog(catalog) {
  const line = (e) =>
    `  { "name": ${JSON.stringify(e.name)}, "type": ${JSON.stringify(e.type)}, "unit_price": ${e.unit_price} }`
  return `[\n${catalog.map(line).join(',\n')}\n]\n`
}

// Build one baseline. Returns { baseline, errors }; baseline is null on any error.
//   sheet:      'sheet1' ... 'sheet6'
//   itemsText:  contents of baseline_lists/<sheet>.items.csv
//   summary:    the sheets_summary.csv row { items, image_width, image_height, image_sha256 }
//   png:        Buffer of the PNG in public/sheets/ (already copied)
//   catalog:    Map(name -> type) from readCatalog
// Practice (step 14) passes expected = PRACTICE, idPattern = /^P\d+$/,
// idExample = 'P001' and requireSummary = false; every other check is the same.
export function buildBaseline({
  sheet, itemsText, summary, png, catalog,
  expected = EXPECTED[sheet], idPattern = /^B\d+$/, idExample = 'B001', requireSummary = true,
}) {
  const errors = []
  const where = (msg) => errors.push(`${sheet}: ${msg}`)
  if (!expected) where('not one of sheet1..sheet6')

  // Image: size and fingerprint must match the summary (and the CLAUDE.md table).
  let size = null
  let imageSha = null
  try {
    size = pngSize(png)
    imageSha = sha256(png)
  } catch (err) {
    where(`image: ${err.message}`)
  }
  if (size && summary) {
    if (size.width !== Number(summary.image_width) || size.height !== Number(summary.image_height)) {
      where(`image is ${size.width}x${size.height}, summary says ${summary.image_width}x${summary.image_height}`)
    }
    if (imageSha !== summary.image_sha256) where('image sha256 does not match sheets_summary.csv')
  }
  if (size && expected && (size.width !== expected.width || size.height !== expected.height)) {
    where(`image is ${size.width}x${size.height}, CLAUDE.md table says ${expected.width}x${expected.height}`)
  }
  if (!summary && requireSummary) where('no row in sheets_summary.csv')

  // Items
  const { header, records } = csvObjects(itemsText)
  const missingCols = ITEM_COLUMNS.filter((c) => !header.includes(c))
  if (missingCols.length) {
    where(`items CSV is missing column(s): ${missingCols.join(', ')}`)
    return { baseline: null, errors }
  }
  if (summary && records.length !== Number(summary.items)) {
    where(`${records.length} items, summary says ${summary.items}`)
  }
  if (expected && records.length !== expected.items) {
    where(`${records.length} items, CLAUDE.md table says ${expected.items}`)
  }

  const seen = new Set()
  const items = records.map((r, i) => {
    const at = `row ${i + 2} (${r.id || 'no id'})`
    if (!idPattern.test(r.id)) where(`${at}: id must look like ${idExample}`)
    else if (seen.has(r.id)) where(`${at}: duplicate id`)
    seen.add(r.id)
    if (!r.name) where(`${at}: no name`)
    else if (!catalog.has(r.name)) where(`${at}: name "${r.name}" is not in catalog.csv`)
    else if (catalog.get(r.name) !== r.type) {
      where(`${at}: type "${r.type}" but catalog.csv gives "${r.name}" type "${catalog.get(r.name)}"`)
    }
    if (!isWholeNumber(r.x) || !isWholeNumber(r.y)) {
      where(`${at}: x,y must be whole image pixels, got (${r.x}, ${r.y})`)
    } else if (size && (Number(r.x) >= size.width || Number(r.y) >= size.height)) {
      where(`${at}: (${r.x}, ${r.y}) is outside the image (${size.width}x${size.height})`)
    }
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      label: r.label,
      where: r.where,
      x: Number(r.x),
      y: Number(r.y),
      status: r.status,
    }
  })

  if (errors.length) return { baseline: null, errors }
  return {
    baseline: {
      sheet,
      image: `/sheets/${sheet}.png`,
      image_size: { width: size.width, height: size.height },
      image_sha256: imageSha,
      items,
    },
    errors,
  }
}
