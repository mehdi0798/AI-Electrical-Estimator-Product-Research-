// Build the combined legend image (v0.3 step 11). Local only, never shipped.
//
//   npm run build-legend
//
// Reads the two legend screenshots in handoff/legend/, crops each one (the boxes
// and the checks are in legend-lib.js), and stacks them into ONE lossless PNG:
// ELECTRICAL LEGEND on top, the lighting / equipment legend below, left aligned,
// on white, GAP_PX apart. Crops only: nothing is resized or redrawn.
// If any check fails (a crop would cut a symbol or a description, or keep a
// frame line or the watermark), nothing is written.

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { GAP_PX, LEGEND_SOURCES, checkCrop, stackLayout } from './legend-lib.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'public', 'legend.png')

const crops = []
const problems = []
for (const src of LEGEND_SOURCES) {
  const path = join(root, src.file)
  const grey = await sharp(path).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true })
  const found = checkCrop({ data: grey.data, width: grey.info.width, height: grey.info.height }, src)
  for (const p of found) problems.push(`${src.file} (${src.label}): ${p}`)
  const { left, top, right, bottom } = src.crop
  const width = right - left + 1
  const height = bottom - top + 1
  const rgb = await sharp(path).removeAlpha().extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true })
  crops.push({ src, width, height, rgb })
  console.log(`build-legend: ${src.file} ${grey.info.width}x${grey.info.height} -> crop x ${left}-${right}, y ${top}-${bottom} = ${width}x${height} (${src.label})`)
}
if (problems.length) {
  for (const p of problems) console.error(`build-legend: ${p}`)
  console.error('build-legend: nothing written.')
  process.exit(1)
}

const layout = stackLayout(crops.map(({ width, height }) => ({ width, height })))
await sharp({ create: { width: layout.width, height: layout.height, channels: 3, background: '#ffffff' } })
  .composite(crops.map((c, i) => ({
    input: c.rgb.data,
    raw: { width: c.width, height: c.height, channels: c.rgb.info.channels },
    left: layout.places[i].left,
    top: layout.places[i].top,
  })))
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(OUT)
console.log(`build-legend: wrote public/legend.png ${layout.width}x${layout.height} (gap ${GAP_PX} px, lossless PNG)`)
