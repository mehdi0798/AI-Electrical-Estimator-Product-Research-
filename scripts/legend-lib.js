// The combined legend (v0.3 step 11): crop boxes and the checks that guard them.
// Plain functions on raw greyscale pixels, tested in Node; build-legend.js does
// the file I/O. Crops only: content is never resized or redrawn.

// A pixel darker than this is ink. The screenshots are lossy WebP, so paper is
// 240-255; the faintest marks (the grey watermark) are about 177.
export const INK = 235

// The two screenshots, top to bottom. All boxes are inclusive, in source pixels,
// measured on the files in handoff/legend/. `junk` = what the crop must remove;
// `edgeLines` = rows allowed to touch the crop's left/right edges (a ruled line
// that is part of the legend itself).
export const LEGEND_SOURCES = [
  {
    file: 'handoff/legend/legend1.webp', // 1158 x 829
    label: 'ELECTRICAL LEGEND',
    crop: { left: 33, top: 11, right: 1021, bottom: 828 },
    junk: [
      { x0: 5, x1: 6, y0: 0, y1: 828, what: 'left frame line' },
      { x0: 1116, x1: 1116, y0: 0, y1: 828, what: 'right frame line' },
      { x0: 1148, x1: 1149, y0: 0, y1: 828, what: 'window frame line' },
      { x0: 1100, x1: 1157, y0: 784, y1: 819, what: '"Activate Windows" watermark' },
    ],
    edgeLines: [{ y0: 64, y1: 66, what: 'ruled line under the title' }],
  },
  {
    file: 'handoff/legend/legend2.webp', // 1087 x 860
    label: 'lighting / equipment legend',
    crop: { left: 13, top: 7, right: 956, bottom: 828 },
    junk: [
      { x0: 0, x1: 1086, y0: 0, y1: 5, what: 'dark bar at the top' },
      { x0: 1079, x1: 1086, y0: 806, y1: 840, what: '"Activate Windows" watermark' },
    ],
    edgeLines: [],
  },
]

export const GAP_PX = 16 // white space between the two crops

const inside = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
const grow = (b, d) => ({ ...b, x0: b.x0 - d, x1: b.x1 + d, y0: b.y0 - d, y1: b.y1 + d })
const cropBox = (c) => ({ x0: c.left, x1: c.right, y0: c.top, y1: c.bottom })

// Check one source against its crop. img = { data, width, height } with ONE byte
// per pixel (greyscale). Returns a list of problems; empty = safe to crop.
export function checkCrop(img, src) {
  const { data, width: W, height: H } = img
  const c = cropBox(src.crop)
  const problems = []
  const g = (x, y) => data[y * W + x]
  if (c.x0 < 0 || c.y0 < 0 || c.x1 >= W || c.y1 >= H || c.x0 > c.x1 || c.y0 > c.y1) {
    return [`crop ${JSON.stringify(src.crop)} is outside the ${W}x${H} image`]
  }
  // 1. Everything to remove lies fully outside the crop.
  for (const j of src.junk) {
    const overlaps = j.x0 <= c.x1 && j.x1 >= c.x0 && j.y0 <= c.y1 && j.y1 >= c.y0
    if (overlaps) problems.push(`the crop keeps the ${j.what}`)
  }
  // 2. Every ink pixel that is not junk lies inside the crop (nothing is cut).
  //    Junk boxes get 1 px of slack for anti-aliasing. A declared ruled line
  //    runs on to the frame, so its ends may fall outside the crop.
  const junk = src.junk.map((j) => grow(j, 1))
  const lineRow = (y) => src.edgeLines.some((l) => y >= l.y0 && y <= l.y1)
  let lost = 0
  let firstLost = null
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g(x, y) >= INK || inside(c, x, y) || lineRow(y) || junk.some((j) => inside(j, x, y))) continue
      lost++
      firstLost ??= [x, y]
    }
  }
  if (lost) problems.push(`the crop would cut content: ${lost} ink px outside it, first at (${firstLost})`)
  // 3. The crop's border is paper, so no symbol or text touches an edge. Only
  //    declared ruled lines may cross the left/right edges.
  const edgeInk = []
  for (let x = c.x0; x <= c.x1; x++) {
    if (g(x, c.y0) < INK) edgeInk.push(`top (${x},${c.y0})`)
    if (g(x, c.y1) < INK) edgeInk.push(`bottom (${x},${c.y1})`)
  }
  for (let y = c.y0; y <= c.y1; y++) {
    if (lineRow(y)) continue
    if (g(c.x0, y) < INK) edgeInk.push(`left (${c.x0},${y})`)
    if (g(c.x1, y) < INK) edgeInk.push(`right (${c.x1},${y})`)
  }
  if (edgeInk.length) problems.push(`ink touches the crop edge at ${edgeInk.slice(0, 5).join(', ')}${edgeInk.length > 5 ? ` (+${edgeInk.length - 5})` : ''}`)
  // 4. No frame line survives: no column inside the crop is inked over half its
  //    height, and no row over 90% of its width unless it is a declared line.
  for (let x = c.x0; x <= c.x1; x++) {
    let n = 0
    for (let y = c.y0; y <= c.y1; y++) if (g(x, y) < INK) n++
    if (n > (c.y1 - c.y0 + 1) / 2) problems.push(`a vertical line remains at x=${x}`)
  }
  for (let y = c.y0; y <= c.y1; y++) {
    if (lineRow(y)) continue
    let n = 0
    for (let x = c.x0; x <= c.x1; x++) if (g(x, y) < INK) n++
    if (n > (c.x1 - c.x0 + 1) * 0.9) problems.push(`a horizontal line remains at y=${y}`)
  }
  return problems
}

// Where each crop goes in the combined image: stacked top to bottom, left
// aligned, GAP_PX apart, on a white canvas as wide as the widest crop.
export function stackLayout(sizes, gap = GAP_PX) {
  const width = Math.max(...sizes.map((s) => s.width))
  let top = 0
  const places = sizes.map((s, i) => {
    const p = { left: 0, top }
    top += s.height + (i < sizes.length - 1 ? gap : 0)
    return p
  })
  return { width, height: top, places }
}
