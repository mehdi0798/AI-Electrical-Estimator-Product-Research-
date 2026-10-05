// Tests for the legend crop checks (v0.3 step 11). Run: node scripts/build-legend.test.js

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { GAP_PX, LEGEND_SOURCES, checkCrop, stackLayout } from './legend-lib.js'

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err) {
    console.error(`  FAIL ${name}`)
    throw err
  }
}

// A 100x60 white "screenshot": a frame line at x=2, a dark bar on rows 0-3, a
// symbol at x 20-30 / y 20-30, and a grey watermark at x 90-97 / y 50-55.
function fake() {
  const W = 100
  const H = 60
  const data = new Uint8Array(W * H).fill(252)
  const paint = (x0, x1, y0, y1, v) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * W + x] = v
  }
  paint(0, 99, 0, 3, 40) // dark bar
  paint(2, 2, 0, 59, 0) // frame line
  paint(20, 30, 20, 30, 0) // symbol
  paint(90, 97, 50, 55, 180) // watermark (light grey still counts as ink)
  return { data, width: W, height: H }
}
const junk = [
  { x0: 0, x1: 99, y0: 0, y1: 3, what: 'dark bar' },
  { x0: 2, x1: 2, y0: 0, y1: 59, what: 'frame line' },
  { x0: 90, x1: 97, y0: 50, y1: 55, what: 'watermark' },
]
const src = (crop, edgeLines = []) => ({ crop, junk, edgeLines })

console.log('crop checks')

test('a crop that removes the junk and keeps all content passes', () => {
  assert.deepEqual(checkCrop(fake(), src({ left: 5, top: 5, right: 80, bottom: 59 })), [])
})

test('a crop that would cut a symbol is refused', () => {
  const p = checkCrop(fake(), src({ left: 5, top: 5, right: 25, bottom: 59 }))
  assert.ok(p.some((m) => /would cut content/.test(m)), p.join('; '))
  assert.ok(p.some((m) => /touches the crop edge/.test(m)), p.join('; '))
})

test('a crop that keeps the watermark, the frame line or the bar is refused', () => {
  assert.ok(checkCrop(fake(), src({ left: 5, top: 5, right: 99, bottom: 59 })).some((m) => /watermark/.test(m)))
  assert.ok(checkCrop(fake(), src({ left: 0, top: 5, right: 80, bottom: 59 })).some((m) => /frame line/.test(m)))
  assert.ok(checkCrop(fake(), src({ left: 5, top: 0, right: 80, bottom: 59 })).some((m) => /dark bar/.test(m)))
})

test('an undeclared line inside the crop is found', () => {
  const img = fake()
  for (let y = 0; y < 60; y++) img.data[y * 100 + 50] = 0 // a new vertical line
  const p = checkCrop(img, { crop: { left: 5, top: 5, right: 80, bottom: 59 }, junk: junk.slice(0, 1).concat(junk.slice(1)), edgeLines: [] })
  assert.ok(p.some((m) => /vertical line remains at x=50/.test(m)), p.join('; '))
})

test('a declared ruled line may run past the crop edges; an undeclared one may not', () => {
  const img = fake()
  for (let x = 3; x < 90; x++) img.data[40 * 100 + x] = 0
  const crop = { left: 5, top: 5, right: 80, bottom: 59 }
  assert.deepEqual(checkCrop(img, src(crop, [{ y0: 39, y1: 41, what: 'rule' }])), [])
  assert.ok(checkCrop(img, src(crop)).length > 0)
})

test('a crop outside the image is refused', () => {
  assert.ok(checkCrop(fake(), src({ left: 5, top: 5, right: 100, bottom: 59 }))[0].includes('outside'))
})

test('stackLayout: top to bottom, left aligned, GAP_PX apart, widest width', () => {
  assert.deepEqual(stackLayout([{ width: 989, height: 818 }, { width: 944, height: 822 }]), {
    width: 989,
    height: 818 + GAP_PX + 822,
    places: [{ left: 0, top: 0 }, { left: 0, top: 818 + GAP_PX }],
  })
})

test('ELECTRICAL LEGEND is first (on top), then the lighting / equipment legend', () => {
  assert.equal(LEGEND_SOURCES[0].file, 'handoff/legend/legend1.webp')
  assert.equal(LEGEND_SOURCES[1].file, 'handoff/legend/legend2.webp')
  assert.ok(existsSync(new URL('../public/legend.png', import.meta.url)), 'public/legend.png is built')
})

console.log(`\n${passed} tests passed`)
