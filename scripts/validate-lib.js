// Pure checks for authored sheets against their answer keys. No file access here;
// scripts/validate-sheets.js is the CLI wrapper. Local tool only, never bundled
// into the participant app (Hard rule 6).
//
// The checks protect the Hard rules:
//   1  every UNDER (deleted item) has no row; item ids have no gap hinting at it
//   2  every OVER (phantom) is a real-looking row: present, never the last row,
//      confidence inside the range of the real rows
//   7  every x,y is inside the image, in original image pixels

// --- PNG size (from the IHDR chunk) -------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function pngSize(buf) {
  const ok =
    buf &&
    buf.length >= 24 &&
    PNG_SIGNATURE.every((b, i) => buf[i] === b) &&
    buf.toString('ascii', 12, 16) === 'IHDR'
  if (!ok) throw new Error('not a PNG file')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

// --- Display order -------------------------------------------------------------

// Same order the app shows (Hard rule 4): confidence, highest first. Array.sort is
// stable, so ties keep file order, exactly as in the app.
export function displayOrder(items) {
  return [...items].sort((a, b) => b.confidence - a.confidence)
}

// --- Helpers -------------------------------------------------------------------

const isStr = (v) => typeof v === 'string' && v.trim() !== ''
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

const ITEM_FIELDS = ['id', 'type', 'room', 'x', 'y', 'confidence', 'unit_price']
const MANIP_FIELDS = ['id', 'direction', 'x', 'y', 'cost', 'pair_id']

function checkInside(where, x, y, size, errors) {
  if (!size || !isNum(x) || !isNum(y)) return
  if (x < 0 || y < 0 || x >= size.width || y >= size.height) {
    errors.push(`${where}: (${x}, ${y}) is outside the image (${size.width}x${size.height})`)
  }
}

// Ids ending in a number (S1-1, S1-2, ...) must run 1..N with no gap per prefix.
// A gap (S1-4, S1-6) would hint that S1-5 was deleted.
function checkIdSequence(items, errors, warnings) {
  const groups = new Map()
  const unpatterned = []
  for (const it of items) {
    const m = isStr(it.id) ? /^(.*?)(\d+)$/.exec(it.id) : null
    if (!m) {
      unpatterned.push(it.id)
      continue
    }
    if (!groups.has(m[1])) groups.set(m[1], [])
    groups.get(m[1]).push(Number(m[2]))
  }
  if (unpatterned.length) {
    warnings.push(`ids not ending in a number, gap check skipped for: ${unpatterned.join(', ')}`)
  }
  if (groups.size > 1) {
    warnings.push(`items use ${groups.size} id prefixes (${[...groups.keys()].join(', ')}); a mixed prefix may stand out`)
  }
  for (const [prefix, nums] of groups) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b)
    const missing = []
    for (let n = 1; n <= sorted[sorted.length - 1]; n++) {
      if (!sorted.includes(n)) missing.push(`${prefix}${n}`)
    }
    if (missing.length) {
      errors.push(`id gap (hints at a deletion): missing ${missing.join(', ')}`)
    }
  }
}

// --- Sheet check ---------------------------------------------------------------

// sheet:      the parsed sheetN.json
// key:        the parsed answer key, or null if there is none
// imageSize:  { width, height } of the sheet's PNG, or null if unreadable
// isPractice: true for the practice sheet
// Returns { errors, warnings } (arrays of strings).
export function validateSheet({ sheet, key, imageSize, isPractice }) {
  const errors = []
  const warnings = []

  // Sheet fields
  for (const f of ['id', 'name', 'image']) {
    if (!isStr(sheet?.[f])) errors.push(`sheet is missing "${f}"`)
  }
  const items = Array.isArray(sheet?.items) ? sheet.items : null
  if (!items) {
    errors.push('sheet is missing an "items" array')
    return { errors, warnings }
  }
  if (items.length === 0) errors.push('sheet has no items')
  if (sheet._placeholder) warnings.push('sheet is marked _placeholder (not real study content)')

  // Item fields
  items.forEach((it, i) => {
    const where = `item ${isStr(it?.id) ? it.id : `#${i + 1}`}`
    for (const f of ITEM_FIELDS) {
      if (it?.[f] === undefined || it?.[f] === null || it?.[f] === '') {
        errors.push(`${where}: missing "${f}"`)
      }
    }
    for (const f of ['id', 'type', 'room']) {
      if (it?.[f] !== undefined && typeof it[f] !== 'string') errors.push(`${where}: "${f}" must be text`)
    }
    for (const f of ['x', 'y', 'unit_price']) {
      if (it?.[f] !== undefined && !isNum(it[f])) errors.push(`${where}: "${f}" must be a number`)
    }
    if (isNum(it?.confidence) && (it.confidence <= 0 || it.confidence > 1)) {
      errors.push(`${where}: confidence ${it.confidence} must be in (0, 1]`)
    } else if (it?.confidence !== undefined && !isNum(it.confidence)) {
      errors.push(`${where}: "confidence" must be a number`)
    }
    checkInside(where, it?.x, it?.y, imageSize, errors)
  })

  // Item ids: unique, no gap
  const idCount = new Map()
  for (const it of items) if (isStr(it?.id)) idCount.set(it.id, (idCount.get(it.id) ?? 0) + 1)
  const dupes = [...idCount].filter(([, n]) => n > 1).map(([id]) => id)
  if (dupes.length) errors.push(`duplicate item ids: ${dupes.join(', ')}`)
  checkIdSequence(items.filter((it) => isStr(it?.id)), errors, warnings)

  // Answer key
  if (isPractice) {
    if (key && Array.isArray(key.manipulations) && key.manipulations.length > 0) {
      errors.push(`practice must have no manipulations, found ${key.manipulations.length}`)
    }
    return { errors, warnings }
  }
  if (!key) {
    errors.push('no answer key for this sheet')
    return { errors, warnings }
  }
  if (!Array.isArray(key.manipulations)) {
    errors.push('answer key has no "manipulations" array')
    return { errors, warnings }
  }
  const manips = key.manipulations
  if (manips.length === 0) warnings.push('answer key has no manipulations')

  manips.forEach((m, i) => {
    const where = `manipulation ${isStr(m?.id) ? m.id : `#${i + 1}`}`
    for (const f of MANIP_FIELDS) {
      if (m?.[f] === undefined || m?.[f] === null || m?.[f] === '') {
        errors.push(`${where}: missing "${f}"`)
      }
    }
    if (m?.direction !== undefined && m.direction !== 'UNDER' && m.direction !== 'OVER') {
      errors.push(`${where}: direction must be UNDER or OVER, got ${JSON.stringify(m.direction)}`)
    }
    for (const f of ['x', 'y', 'cost']) {
      if (m?.[f] !== undefined && m?.[f] !== null && !isNum(m[f])) errors.push(`${where}: "${f}" must be a number`)
    }
    checkInside(where, m?.x, m?.y, imageSize, errors)
  })

  const manipIdCount = new Map()
  for (const m of manips) if (isStr(m?.id)) manipIdCount.set(m.id, (manipIdCount.get(m.id) ?? 0) + 1)
  const manipDupes = [...manipIdCount].filter(([, n]) => n > 1).map(([id]) => id)
  if (manipDupes.length) errors.push(`duplicate manipulation ids: ${manipDupes.join(', ')}`)

  const byId = new Map(items.filter((it) => isStr(it?.id)).map((it) => [it.id, it]))
  const overs = manips.filter((m) => m?.direction === 'OVER')
  const unders = manips.filter((m) => m?.direction === 'UNDER')
  const overIds = new Set(overs.map((m) => m.id))

  // OVER: a phantom row that looks exactly like a real one (Hard rule 2)
  const realItems = items.filter((it) => !overIds.has(it?.id))
  const realConf = realItems.map((it) => it?.confidence).filter(isNum)
  const minReal = realConf.length ? Math.min(...realConf) : null
  const maxReal = realConf.length ? Math.max(...realConf) : null
  const order = displayOrder(items.filter((it) => isNum(it?.confidence)))
  const lastId = order.length ? order[order.length - 1].id : null

  for (const m of overs) {
    const it = byId.get(m.id)
    if (!it) {
      errors.push(`OVER ${m.id}: no row with this id in items`)
      continue
    }
    if (m.id === lastId) errors.push(`OVER ${m.id}: is the last row in the list (Hard rule 2)`)
    if (minReal === null) {
      errors.push(`OVER ${m.id}: no real rows to compare confidence with`)
    } else if (isNum(it.confidence) && (it.confidence < minReal || it.confidence > maxReal)) {
      errors.push(
        `OVER ${m.id}: confidence ${it.confidence} is outside the real rows' range ` +
          `${minReal}-${maxReal} (Hard rule 2)`,
      )
    }
    if (isNum(m.cost) && isNum(it.unit_price) && m.cost !== it.unit_price) {
      warnings.push(`OVER ${m.id}: key cost ${m.cost} differs from the row's unit_price ${it.unit_price}`)
    }
    if (isNum(m.x) && isNum(m.y) && (m.x !== it.x || m.y !== it.y)) {
      warnings.push(`OVER ${m.id}: key x,y (${m.x}, ${m.y}) differs from the row's (${it.x}, ${it.y})`)
    }
  }

  // UNDER: a deleted item has no row at all (Hard rule 1)
  for (const m of unders) {
    if (byId.has(m.id)) errors.push(`UNDER ${m.id}: a row with this id is still in items (Hard rule 1)`)
  }

  // Pairs: exactly one UNDER and one OVER per pair_id
  const pairs = new Map()
  for (const m of manips) {
    if (!isStr(m?.pair_id)) continue
    if (!pairs.has(m.pair_id)) pairs.set(m.pair_id, { UNDER: [], OVER: [] })
    if (m.direction === 'UNDER' || m.direction === 'OVER') pairs.get(m.pair_id)[m.direction].push(m.id)
  }
  for (const [pid, p] of pairs) {
    if (p.UNDER.length !== 1 || p.OVER.length !== 1) {
      errors.push(
        `pair ${pid}: needs exactly one UNDER and one OVER, has ${p.UNDER.length} UNDER ` +
          `(${p.UNDER.join(', ') || '-'}) and ${p.OVER.length} OVER (${p.OVER.join(', ') || '-'})`,
      )
    }
  }

  return { errors, warnings }
}
