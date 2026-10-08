// Build the French legend (branch fr). Local only, never shipped.
//
//   npm run build-legend-fr
//
// Reads public/legend.png (never changed) and writes public/legend-fr.png:
// every English description line is covered with white and the approved French
// text is written in the same place, in capitals, in Liberation Sans (Arial
// metrics) at the size and colour measured on the original. Symbols, and the
// letters inside or beside them (S, S 2, M, J, P, GFI, AC, IG, G, PP, B30...),
// are never touched. A French line too long for its column wraps onto an extra
// line in the same row, at the same size. If any check fails, nothing is written.

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'public', 'legend.png')
const OUT = join(root, 'public', 'legend-fr.png')

const FONT = 'Liberation Sans'
const INK = 200 // darker than this = text ink (for finding the English lines)
const PAPER = 235 // lighter than this = blank paper
const PAD = 2 // white cover around each English line
const EXTRA_STEP = 17 // spacing of an added (wrapped) line, as in the original

// Text regions: [x0, x1) x [y0, y1). Symbols live outside them. maxX = right
// limit for French text (the next symbol column, or the image edge).
const REGIONS = {
  title: { x0: 0, x1: 400, y0: 0, y1: 50, maxX: 400, size: 21.03, weight: 'bold', fill: '#000000' },
  EL: { x0: 140, x1: 595, y0: 60, y1: 818, maxX: 588 },
  ER: { x0: 705, x1: 989, y0: 60, y1: 818, maxX: 980 },
  LL: { x0: 140, x1: 595, y0: 834, y1: 1656, maxX: 588 },
  LR: { x0: 705, x1: 989, y0: 834, y1: 1656, maxX: 980 },
}
const BODY = { size: 8.78, weight: 'normal', fill: '#1a1a1a' }

// The approved texts, in order, one entry per legend row (English lines as printed).
const GEN = 'ALIMENTÉ PAR GROUPE ÉLECTROGÈNE'
const SIDEWAYS = 'CENTRE À 43-1/2" DU SOL FINI, BOÎTIER POSÉ À L\'HORIZONTALE'
const TEXT = {
  title: [[['ELECTRICAL LEGEND'], ['LÉGENDE ÉLECTRIQUE']]],
  EL: [
    [['TELEPHONE/DATA RECEPTACLE - COMPUTER NETWORK. CAT-6 CABLE', 'TO HUB 3/4" CONDUIT - NUMBER OF CABLES TO EACH LOCATION.', 'PROVIDE (1) JUNCTION BOX FOR UP TO 6 CABLES.'],
      ['PRISE TÉLÉPHONE/DONNÉES - RÉSEAU INFORMATIQUE. CÂBLE CAT-6', 'VERS LE HUB, CONDUIT 3/4" - NOMBRE DE CÂBLES PAR EMPLACEMENT.', 'PRÉVOIR (1) BOÎTE DE DÉRIVATION POUR 6 CÂBLES MAX.']],
    [['FLOOR MOUNTED DATA RECEPTACLE'], ['PRISE DE DONNÉES AU SOL']],
    [['20A DUPLEX RECEPTACLE (WP-WEATHERPROOF,', 'GFI-GROUND FAULT INTERRUPTION)'], ['PRISE DOUBLE 20A (WP - ÉTANCHE,', 'GFI - DIFFÉRENTIELLE)']],
    [['20A DUPLEX RECEPTACLE MOUNTED ABOVE COUNTER', '(43-1/2") AFF CENTER  OF RECEPTACLE ENCLOSURE MOUNTED SIDE WAYS'], ['PRISE DOUBLE 20A AU-DESSUS DU PLAN DE TRAVAIL', SIDEWAYS]],
    [['20A ISOLATED GROUND RECEPTACLE'], ['PRISE 20A, TERRE ISOLÉE']],
    [['20A DUPLEX RECEPTACLE ON GENERATOR'], ['PRISE DOUBLE 20A SUR GROUPE ÉLECTROGÈNE']],
    [['SINGLE RECEPTACLE (NEMA SIZE AS SHOWN)'], ['PRISE SIMPLE (TAILLE NEMA SELON PLAN)']],
    [['SPECIAL PURPOSE RECEPTACLE (NEMA SIZE AS SHOWN)', 'VERIFY CONFIGURATION WITH EQUIPMENT MANUFACTURER'], ['PRISE SPÉCIALISÉE (TAILLE NEMA SELON PLAN)', "VÉRIFIER LA CONFIGURATION AVEC LE FABRICANT DE L'ÉQUIPEMENT"]],
    [['20A QUAD RECEPTACLE'], ['PRISE QUADRUPLE 20A']],
    [['20A ISOLATED GROUND QUAD RECEPTACLE'], ['PRISE QUADRUPLE 20A, TERRE ISOLÉE']],
    [['20A QUAD RECEPTACLE MOUNTED ABOVE COUNTER', '(43-1/2") AFF CENTER  OF RECEPTACLE ENCLOSURE MOUNTED SIDE WAYS'], ['PRISE QUADRUPLE 20A AU-DESSUS DU PLAN DE TRAVAIL', SIDEWAYS]],
    [['20A QUAD RECEPTACLE ON GENERATOR'], ['PRISE QUADRUPLE 20A SUR GROUPE ÉLECTROGÈNE']],
  ],
  ER: [
    [['SINGLE POLE 20A WALL SWITCH', '(MOUNT 48" AFF U.N.O)'], ['INTERRUPTEUR SIMPLE 20A', '(À 48" DU SOL FINI SAUF INDICATION CONTRAIRE)']],
    [['TWO POLE 20A WALL SWITCH'], ['INTERRUPTEUR BIPOLAIRE 20A']],
    [['THREE-WAY 20A WALL SWITCH'], ['INTERRUPTEUR VA-ET-VIENT 20A']],
    [['FOUR-WAY 20A WALL SWITCH'], ['INTERRUPTEUR PERMUTATEUR 20A']],
    [['MANUAL MOTOR STARTER WITH THERMAL OVERLOADS'], ['DÉMARREUR MOTEUR MANUEL AVEC PROTECTION THERMIQUE']],
    [['SPECIAL WALL SWITCH (D-DIMMER,P-PILOT LIGHT,', 'O-OCCUPANCY SENSOR,WP-WEATHERPROOF)', 'T-TIMER, S-SPEED CONTROL SWITCH)'],
      ['INTERRUPTEUR SPÉCIAL (D - VARIATEUR, P - VOYANT,', 'O - DÉTECTEUR DE PRÉSENCE, WP - ÉTANCHE,', 'T - MINUTERIE, S - VARIATEUR DE VITESSE)']],
    [['OCCUPANCY SENSOR'], ['DÉTECTEUR DE PRÉSENCE']],
    [['JUNCTION BOX'], ['BOÎTE DE DÉRIVATION']],
    [['PHOTOCELL'], ['CELLULE PHOTOÉLECTRIQUE']],
    [['GROUND FAULT CIRCUIT INTERRUPTER'], ['DISPOSITIF DIFFÉRENTIEL']],
    [['FLUSH MOUNTED PANELBOARD'], ['TABLEAU ÉLECTRIQUE ENCASTRÉ']],
    [['SURFACE MOUNTED PANELBOARD'], ['TABLEAU ÉLECTRIQUE EN SAILLIE']],
    [['CONDUIT AND WIRE CONCEALED IN WALLS OR CEILING'], ['CONDUIT ET CÂBLAGE ENCASTRÉS DANS MURS OU PLAFOND']],
    [['CONDUIT AND WIRE CONCEALED BELOW FLOOR'], ['CONDUIT ET CÂBLAGE ENCASTRÉS SOUS LE SOL']],
  ],
  LL: [
    [['FLOOR RECEPTACLE.  SHALL COMPLY WITH NEC ARTICLES 314.27C', 'AND 406.8D'], ['PRISE DE SOL. CONFORME AUX ARTICLES NEC 314.27C', 'ET 406.8D']],
    [['MOTOR'], ['MOTEUR']],
    [['POWER POLE.  REFER TO DETAIL 1A/E360.'], ["POTEAU D'ALIMENTATION. VOIR DÉTAIL 1A/E360."]],
    [['RECESSED FLUORESCENT LIGHTING FIXTURE'], ['LUMINAIRE FLUORESCENT ENCASTRÉ']],
    [['RECESSED FLUORESCENT LIGHTING FIXTURE -', 'EMERGENCY LIGHTING (BACKUP BY GENERATOR)'], ['LUMINAIRE FLUORESCENT ENCASTRÉ -', `ÉCLAIRAGE DE SECOURS (${GEN})`]],
    [['SUSPENDED FLUORESCENT LIGHTING FIXTURE'], ['LUMINAIRE FLUORESCENT SUSPENDU']],
    [['SUSPENDED FLUORESCENT LIGHTING FIXTURE -', 'EMERGENCY LIGHTING (BACKUP BY GENERATOR)'], ['LUMINAIRE FLUORESCENT SUSPENDU -', `ÉCLAIRAGE DE SECOURS (${GEN})`]],
    [['TRACK LIGHTING'], ['ÉCLAIRAGE SUR RAIL']],
    [['DOWNLIGHT'], ['SPOT ENCASTRÉ']],
    [['DOWNLIGHT -', 'EMERGENCY LIGHTING (BACKUP BY GENERATOR)'], ['SPOT ENCASTRÉ -', `ÉCLAIRAGE DE SECOURS (${GEN})`]],
    [['WALL MOUNTED LIGHTING FIXTURE'], ['LUMINAIRE MURAL']],
    [['EXIT SIGN (DOUBLE FACE)'], ['PANNEAU DE SORTIE (DOUBLE FACE)']],
    [['EXIT SIGN (SINGLE FACE)'], ['PANNEAU DE SORTIE (SIMPLE FACE)']],
    [['THERMOSTAT'], ['THERMOSTAT']],
    [['MECAHANICAL EQUIPMENT LABEL'], ["ÉTIQUETTE D'ÉQUIPEMENT MÉCANIQUE"]],
  ],
  LR: [
    [['CIRCUIT BREAKER (POLES/FRAME/TRIP)'], ['DISJONCTEUR (PÔLES/CALIBRE/DÉCLENCHEMENT)']],
    [['TRANSFORMER'], ['TRANSFORMATEUR']],
    [['SHIELDED ISOLATION TRANSFORMER'], ["TRANSFORMATEUR D'ISOLEMENT BLINDÉ"]],
    [['GROUND CONNECTION'], ['MISE À LA TERRE']],
    [['UTILITY CURRENT TRANSFORMER'], ['TRANSFORMATEUR DE COURANT DU DISTRIBUTEUR']],
    [['UTILITY METER'], ['COMPTEUR DU DISTRIBUTEUR']],
    [['REFRIGERATION SYSTEM NUMBER'], ['NUMÉRO DU SYSTÈME DE RÉFRIGÉRATION']],
    [['NON-FUSED SAFETY SWITCH (POLES/SIZE)'], ['INTERRUPTEUR DE SÉCURITÉ SANS FUSIBLE (PÔLES/CALIBRE)']],
    [['MAGNETIC MOTOR STARTER (NEMA SIZE)'], ['DÉMARREUR MOTEUR MAGNÉTIQUE (TAILLE NEMA)']],
    [['COMBINATION MOTOR STARTER (NEMA SIZE)'], ['DÉMARREUR MOTEUR COMBINÉ (TAILLE NEMA)']],
  ],
}

const problems = []
const fail = () => {
  for (const p of problems) console.error(`build-legend-fr: ${p}`)
  console.error('build-legend-fr: nothing written.')
  process.exit(1)
}

const src = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const W = src.info.width
const H = src.info.height
const C = src.info.channels
const grey = await sharp(SRC).greyscale().raw().toBuffer()
const g = (x, y) => grey[y * W + x]

// English text lines in a region: rows with ink, grouped (gaps up to 2 rows).
function findLines(r) {
  const lines = []
  let start = -1
  let gap = 0
  for (let y = r.y0; y < r.y1; y++) {
    let ink = false
    for (let x = r.x0; x < r.x1 && !ink; x++) ink = g(x, y) < INK
    if (ink) {
      if (start < 0) start = y
      gap = 0
    } else if (start >= 0 && ++gap > 2) {
      lines.push({ y0: start, y1: y - gap })
      start = -1
      gap = 0
    }
  }
  if (start >= 0) lines.push({ y0: start, y1: r.y1 - 1 })
  return lines
    .filter((l) => l.y1 > l.y0) // the 1-px ruled line under the title is not text
    .map((l) => {
      let x0 = W
      let x1 = 0
      for (let y = l.y0; y <= l.y1; y++) for (let x = r.x0; x < r.x1; x++) if (g(x, y) < INK) { x0 = Math.min(x0, x); x1 = Math.max(x1, x) }
      return { ...l, x0, x1 }
    })
}

// Ink box of a text rendered with its baseline at y = 100 and its start at x = 10.
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
async function measure(text, st) {
  const w = 1400
  const h = 140
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="100" font-family="${FONT}" font-weight="${st.weight}" font-size="${st.size}" fill="#000">${esc(text)}</text></svg>`
  const px = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer()
  let l = w, r = 0, t = h
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * w + x] < INK) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y) }
  return { left: l - 10, right: r - 10, top: 100 - t }
}

// Greedy word wrap to a pixel width.
async function wrap(text, st, width) {
  const words = text.split(' ')
  const out = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (line && (await measure(next, st)).right + 1 > width) {
      out.push(line)
      line = w
    } else line = next
  }
  out.push(line)
  return out
}

const covers = [] // white boxes over English lines
const draws = [] // French lines: { text, x, y (baseline), st }
for (const [key, r] of Object.entries(REGIONS)) {
  const st = key === 'title' ? { size: r.size, weight: r.weight, fill: r.fill } : BODY
  const lines = findLines(r)
  const entries = TEXT[key]
  const nEn = entries.reduce((n, [en]) => n + en.length, 0)
  if (lines.length !== nEn) {
    problems.push(`${key}: found ${lines.length} English lines, the text table has ${nEn}`)
    continue
  }
  let li = 0
  entries.forEach(([en, fr], ei) => {
    const own = lines.slice(li, li + en.length)
    li += en.length
    const nextTop = li < lines.length ? lines[li].y0 : r.y1
    draws.push({ key, ei, en, fr, own, nextTop, st, r })
  })
}
if (problems.length) fail()

// Place every entry: same x as the English text, same baselines; wrapped lines go
// below at the original line spacing. Each must fit its column and its row.
const placed = []
for (const d of draws) {
  const { own, st, r } = d
  const x = own[0].x0
  const baselines = []
  for (let i = 0; i < own.length; i++) baselines.push(own[i].y0 + (await measure(d.en[i], st)).top)
  // Check the calibration: the English text rendered in our font has the same width.
  for (let i = 0; i < own.length; i++) {
    const m = await measure(d.en[i], st)
    const ratio = (m.right - m.left + 1) / (own[i].x1 - own[i].x0 + 1)
    if (ratio < 0.85 || ratio > 1.15) problems.push(`${d.key} "${d.en[i]}": width ratio ${ratio.toFixed(2)} (font size does not match)`)
  }
  const out = []
  for (const t of d.fr) out.push(...(await wrap(t, st, r.maxX - x)))
  const step = own.length > 1 ? (baselines.at(-1) - baselines[0]) / (own.length - 1) : EXTRA_STEP
  const ys = out.map((_, i) => (out.length === own.length ? baselines[i] : Math.round(baselines[0] + i * Math.max(step, EXTRA_STEP))))
  for (let i = 0; i < out.length; i++) {
    const m = await measure(out[i], st)
    if (x + m.right > r.maxX) problems.push(`${d.key} "${out[i]}" is too wide for its column`)
    const bottom = ys[i] + 4 // descenders of "(", ",", "Ç"
    if (i >= own.length && bottom >= d.nextTop - 3) problems.push(`${d.key} "${out[i]}": no room in its row (wrapped line would touch the next row)`)
    placed.push({ text: out[i], x, y: ys[i], st, wrapped: out.length > d.fr.length })
  }
  for (const l of own) covers.push({ x0: l.x0 - PAD, y0: l.y0 - PAD, x1: l.x1 + PAD, y1: l.y1 + PAD })
}
if (problems.length) fail()

// Draw: white covers, then the French text, on a copy of legend.png.
const rects = covers.map((c) => `<rect x="${c.x0}" y="${c.y0}" width="${c.x1 - c.x0 + 1}" height="${c.y1 - c.y0 + 1}" fill="#fff"/>`).join('')
const texts = placed.map((p) => `<text x="${p.x}" y="${p.y}" font-family="${FONT}" font-weight="${p.st.weight}" font-size="${p.st.size}" fill="${p.st.fill}">${esc(p.text)}</text>`).join('')
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}${texts}</svg>`
const outRaw = await sharp(SRC).removeAlpha().composite([{ input: Buffer.from(overlay), left: 0, top: 0 }]).removeAlpha().raw().toBuffer()

// Checks: symbols untouched. A pixel may change only inside a text region, and
// outside the white covers only where the original was blank paper.
const inBox = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
const regions = Object.values(REGIONS)
let changed = 0
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C
    if (outRaw[i] === src.data[i] && outRaw[i + 1] === src.data[i + 1] && outRaw[i + 2] === src.data[i + 2]) continue
    changed++
    if (!regions.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) {
      problems.push(`pixel (${x},${y}) changed outside the text columns (a symbol would change)`)
      if (problems.length > 5) fail()
    } else if (!covers.some((c) => inBox(c, x, y)) && g(x, y) < PAPER) {
      problems.push(`pixel (${x},${y}) drawn over existing ink outside an English line`)
      if (problems.length > 5) fail()
    }
  }
}
if (problems.length) fail()

await sharp(outRaw, { raw: { width: W, height: H, channels: C } }).png({ compressionLevel: 9 }).toFile(OUT)
const wrappedRows = placed.filter((p) => p.wrapped).map((p) => p.text)
console.log(`build-legend-fr: ${covers.length} English lines covered, ${placed.length} French lines written, ${changed} pixels changed, all inside the text columns`)
if (wrappedRows.length) console.log(`build-legend-fr: wrapped onto an extra line: ${wrappedRows.map((t) => `"${t}"`).join(', ')}`)
console.log(`build-legend-fr: wrote public/legend-fr.png ${W}x${H} (lossless PNG); public/legend.png unchanged`)
