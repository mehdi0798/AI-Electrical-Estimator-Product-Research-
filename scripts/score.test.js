// Tests for the scoring script, using a FAKE fixture (scripts/test/fixtures/).
// Run:  node scripts/score.test.js
// No test framework; any failed assertion throws and exits non-zero.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  dedupeEvents,
  manipulationsCsv,
  parseCsv,
  parseEvents,
  runWarnings,
  scoreAll,
  scoreSheet,
  validateConfig,
  validateKey,
} from './score-lib.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, 'test', 'fixtures')
const RADIUS = 40

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

// --- load the fixture ---
// Row 26 is an exact copy of row 24 (only the row id and server_ts differ), so
// scoring runs on the deduplicated events, as the CLI does.
const rawEvents = parseEvents(readFileSync(join(fixtures, 'events.csv'), 'utf8'))
const { events, dropped } = dedupeEvents(rawEvents)
const keys = new Map()
for (const f of readdirSync(join(fixtures, 'answer-key'))) {
  keys.set(
    f.replace(/\.key\.json$/, ''),
    validateKey(JSON.parse(readFileSync(join(fixtures, 'answer-key', f), 'utf8')), f),
  )
}
const { results, skipped } = scoreAll(events, keys, RADIUS)
const get = (participant, sheet) =>
  results.find((r) => r.participant === participant && r.sheet === sheet)

console.log('csv + config')

test('parseCsv handles quotes, escaped quotes, embedded newline, CRLF and BOM', () => {
  const rows = parseCsv('﻿a,b\r\n"x,y","he said ""hi"""\r\n"line1\nline2",z\r\n')
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['x,y', 'he said "hi"'],
    ['line1\nline2', 'z'],
  ])
})

test('parseEvents rejects a CSV with a missing column', () => {
  assert.throws(() => parseEvents('session_label,participant\nx,y\n'), /missing required/)
})

test('validateConfig requires a positive numeric radius (no default)', () => {
  assert.deepEqual(validateConfig({ radius: 40 }), { radius: 40 })
  for (const bad of [{}, { radius: 0 }, { radius: -5 }, { radius: '40' }, { radius: NaN }, null]) {
    assert.throws(() => validateConfig(bad), /radius/)
  }
})

console.log('cleaning and warnings')

test('dedupe drops exact duplicate rows and reports how many', () => {
  assert.equal(dropped, 1) // row 26 only
  assert.equal(events.length, rawEvents.length - 1)
  // The first copy (file line 25, row id 24) is kept; the later copy (id 26) is dropped.
  assert.ok(events.some((e) => e.action === 'rejected' && e.item_id === 'S2-3'))
  assert.equal(events.filter((e) => e.action === 'rejected' && e.item_id === 'S2-3').length, 1)
})

test('dedupe keeps rows that differ in any compared field, even by 1 ms', () => {
  const base = {
    session: 's', participant: 'A', sheet: 'sheet1', action: 'accepted', item_id: 'i',
    x: null, y: null, old_value: null, new_value: 'accepted', client_ts: 100,
  }
  const same = { ...base, row: 9 } // row number is not compared
  assert.equal(dedupeEvents([base, same]).dropped, 1)
  assert.equal(dedupeEvents([base, { ...base, client_ts: 101 }]).dropped, 0)
  assert.equal(dedupeEvents([base, { ...base, x: 0 }]).dropped, 0) // null is not 0
  assert.equal(dedupeEvents([base, { ...base, participant: 'B' }]).dropped, 0)
  assert.equal(dedupeEvents([base, { ...base, session: 't' }]).dropped, 0)
})

test('runWarnings flags a session started more than once (restart or second tab)', () => {
  const start = (session, participant) => ({ action: 'session_started', session, participant })
  const w = runWarnings([start('mytest', 'A'), start('mytest', 'A'), start('other', 'A')])
  assert.equal(w.length, 1)
  assert.match(w[0], /session mytest \| participant A: session_started logged 2 times/)
  // The --session filter limits the check to that session.
  assert.equal(runWarnings([start('mytest', 'A'), start('mytest', 'A')], { session: 'other' }).length, 0)
  // Different participants in one session are not a restart.
  assert.equal(runWarnings([start('mytest', 'A'), start('mytest', 'B')]).length, 0)
})

test('a reused ADD id is flagged on the sheet', () => {
  const key = { manipulations: [{ id: 'U', direction: 'UNDER', x: 0, y: 0, cost: 1, pair_id: 'p' }] }
  const ev = [
    { client_ts: 1, action: 'add_missing', item_id: 'ADD-sheet1-1', x: 73, y: 22, new_value: 't' },
    { client_ts: 2, action: 'add_missing', item_id: 'ADD-sheet1-1', x: 60, y: 57, new_value: 't' },
    { client_ts: 3, action: 'add_missing', item_id: 'ADD-sheet1-2', x: 9, y: 9, new_value: 't' },
  ]
  const warnings = scoreSheet(ev, key, 40).warnings
  assert.ok(warnings.some((w) => /ADD-sheet1-1 used by 2 add_missing/.test(w)))
  assert.ok(!warnings.some((w) => /ADD-sheet1-2/.test(w)))
})

test('resume: session_resumed is not a re-open, and state carries across it', () => {
  const key = {
    manipulations: [
      { id: 'S-1', direction: 'OVER', x: 0, y: 0, cost: 1, pair_id: 'p' },
      { id: 'U', direction: 'UNDER', x: 100, y: 100, cost: 1, pair_id: 'p' },
    ],
  }
  const ev = [
    { client_ts: 1, action: 'sheet_opened', item_id: 'sheet1' },
    { client_ts: 2, action: 'rejected', item_id: 'S-1', new_value: 'rejected' },
    { client_ts: 3, action: 'add_missing', item_id: 'ADD-sheet1-1', x: 100, y: 105, new_value: 't' },
    // reload: the app logs session_resumed (not sheet_opened) and restores state
    { client_ts: 4, action: 'session_resumed', item_id: 'sheet1', new_value: 'review' },
    // the restored add is removed after the resume; its add_removed still matches
    { client_ts: 5, action: 'add_removed', item_id: 'ADD-sheet1-1' },
    { client_ts: 6, action: 'add_missing', item_id: 'ADD-sheet1-2', x: 98, y: 100, new_value: 't' },
    { client_ts: 7, action: 'confirmed', item_id: 'sheet1', new_value: '10' },
  ]
  const r = scoreSheet(ev, key, 40)
  assert.equal(r.resumed, 1)
  assert.deepEqual(r.warnings, []) // no "opened 2 times", no unmatched add_removed
  assert.equal(r.overs[0].caught, true) // reject from before the reload still counts
  assert.equal(r.unders[0].caught, true)
  assert.equal(r.unders[0].byAdd, 'ADD-sheet1-2')
})

test('resume: an open right after a resume is not counted; a plain reload still warns', () => {
  const key = { manipulations: [] }
  const resumedThenOpened = [
    { client_ts: 1, action: 'sheet_opened', item_id: 'sheet1' },
    { client_ts: 2, action: 'session_resumed', item_id: 'sheet1' },
    { client_ts: 3, action: 'sheet_opened', item_id: 'sheet1' },
    { client_ts: 4, action: 'confirmed', item_id: 'sheet1', new_value: '1' },
  ]
  assert.deepEqual(scoreSheet(resumedThenOpened, key, 40).warnings, [])
  const plainReload = [
    { client_ts: 1, action: 'sheet_opened', item_id: 'sheet1' },
    { client_ts: 2, action: 'sheet_opened', item_id: 'sheet1' },
    { client_ts: 3, action: 'confirmed', item_id: 'sheet1', new_value: '1' },
  ]
  assert.ok(scoreSheet(plainReload, key, 40).warnings.some((w) => /opened 2 times/.test(w)))
})

test('resume: no run warning, since resume never logs a second session_started', () => {
  const ev = [
    { action: 'session_started', session: 'r1', participant: 'A' },
    { action: 'session_resumed', session: 'r1', participant: 'A' },
    { action: 'session_resumed', session: 'r1', participant: 'A' },
  ]
  assert.deepEqual(runWarnings(ev), [])
})

console.log('fixture scoring')

test('practice events are ignored; sheets with no key are skipped and reported', () => {
  assert.ok(results.every((r) => r.sheet !== 'practice'))
  assert.deepEqual(skipped, [{ session: 'fix1', participant: 'A', sheet: 'sheet3' }])
  assert.equal(results.length, 3) // A/sheet1, A/sheet2, B/sheet2
})

test('OVER: reject -> caught; reject then re-accept -> missed', () => {
  const a1 = get('A', 'sheet1')
  const byId = Object.fromEntries(a1.overs.map((o) => [o.m.id, o.caught]))
  assert.equal(byId['S1-4'], true) // rejected, left rejected
  assert.equal(byId['S1-7'], false) // rejected, then accepted again
})

test('real items rejected: counts final rejects, not phantoms or toggled-off rows', () => {
  // S1-1 stays rejected; S1-2 was rejected then toggled back to untouched
  // (logged as action "rejected" with new_value empty); S1-4 is a phantom.
  assert.deepEqual(get('A', 'sheet1').realRejected, ['S1-1'])
})

test('UNDER: an add near a deleted item catches it', () => {
  const u1 = get('A', 'sheet1').unders.find((u) => u.m.id === 'U1')
  assert.equal(u1.caught, true)
  assert.equal(u1.byAdd, 'ADD-sheet1-1') // 11.2px away; also proves the quoted-comma field parsed
})

test('UNDER: add then remove -> not caught, and not counted as an unmatched click', () => {
  const a1 = get('A', 'sheet1')
  assert.equal(a1.unders.find((u) => u.m.id === 'U2').caught, false)
  const removed = a1.addReport.find((a) => a.id === 'ADD-sheet1-2')
  assert.equal(removed.removed, true)
  assert.ok(!a1.unmatchedAdds.some((a) => a.id === 'ADD-sheet1-2'))
})

test('add outside the radius: not caught, distance to nearest deleted item reported', () => {
  const far = get('A', 'sheet1').addReport.find((a) => a.id === 'ADD-sheet1-3')
  assert.equal(far.matchedId, null)
  assert.equal(far.nearestId, 'U2')
  assert.ok(Math.abs(far.nearestDist - Math.hypot(500, 700)) < 1e-9)

  // Participant B's add at (500,545) is 45px from U3: just outside radius 40.
  const b = get('B', 'sheet2')
  const add = b.addReport[0]
  assert.equal(add.nearestId, 'U3')
  assert.equal(add.nearestDist, 45)
  assert.equal(add.matchedId, null)
  assert.equal(b.unders.find((u) => u.m.id === 'U3').caught, false)
})

test('a second add near an already-caught item matches nothing (one-to-one)', () => {
  const dup = get('A', 'sheet1').addReport.find((a) => a.id === 'ADD-sheet1-4')
  assert.equal(dup.matchedId, null)
  assert.equal(dup.duplicateOf, 'U1') // within radius of U1, but U1 already caught by a nearer add
})

test('unmatched add_missing clicks per sheet', () => {
  // ADD-sheet1-3 (far) and ADD-sheet1-4 (duplicate); ADD-sheet1-2 was removed.
  assert.deepEqual(
    get('A', 'sheet1').unmatchedAdds.map((a) => a.id),
    ['ADD-sheet1-3', 'ADD-sheet1-4'],
  )
  assert.equal(get('A', 'sheet2').unmatchedAdds.length, 0)
  assert.equal(get('B', 'sheet2').unmatchedAdds.length, 1)
})

test('one add between two close deleted items matches only the nearest', () => {
  // Add at (510,500): 10px from U3, 20px from U4 (both inside radius 40).
  const a2 = get('A', 'sheet2')
  assert.equal(a2.addReport[0].matchedId, 'U3')
  assert.equal(a2.unders.find((u) => u.m.id === 'U3').caught, true)
  assert.equal(a2.unders.find((u) => u.m.id === 'U4').caught, false)
})

test('final confirmed bid is the last confirmed new_value; none if never confirmed', () => {
  assert.equal(get('A', 'sheet1').confirmedBid, 410.5) // submitted 400 + cancelled earlier
  assert.equal(get('A', 'sheet2').confirmedBid, 300)
  const b = get('B', 'sheet2')
  assert.equal(b.confirmedBid, null)
  assert.ok(b.warnings.some((w) => /never confirmed/.test(w)))
})

test('OVER for participant B: reject -> caught, other phantom untouched -> missed', () => {
  const b = get('B', 'sheet2')
  assert.deepEqual(
    b.overs.map((o) => [o.m.id, o.caught]),
    [
      ['S2-3', true],
      ['S2-8', false],
    ],
  )
})

console.log('geometry')

test('radius boundary is inclusive (3-4-5 triangle, radius 5)', () => {
  const key = {
    manipulations: [{ id: 'U', direction: 'UNDER', x: 0, y: 0, cost: 1, pair_id: 'p' }],
  }
  const ev = [{ client_ts: 1, action: 'add_missing', item_id: 'ADD-s-1', x: 3, y: 4, new_value: 't' }]
  assert.equal(scoreSheet(ev, key, 5).unders[0].caught, true)
  assert.equal(scoreSheet(ev, key, 4.99).unders[0].caught, false)
})

test('events are replayed by client_ts, not file order', () => {
  const key = { manipulations: [{ id: 'S-1', direction: 'OVER', x: 0, y: 0, cost: 1, pair_id: 'p' }] }
  const ev = [
    { client_ts: 20, action: 'accepted', item_id: 'S-1', old_value: 'rejected', new_value: 'accepted' },
    { client_ts: 10, action: 'rejected', item_id: 'S-1', old_value: null, new_value: 'rejected' },
  ]
  assert.equal(scoreSheet(ev, key, 40).overs[0].caught, false)
})

test('real items edited: final name differs from the original; phantoms and edit-backs excluded', () => {
  const key = {
    manipulations: [
      { id: 'D1', direction: 'UNDER', x: 100, y: 100, cost: 5, pair_id: 'p1' },
      { id: 'S-9', direction: 'OVER', x: 0, y: 0, cost: 7, pair_id: 'p1' },
    ],
  }
  const ev = [
    { client_ts: 1, action: 'sheet_opened', item_id: 'sheet1' },
    { client_ts: 2, action: 'edited', item_id: 'S-1', old_value: 'E2', new_value: 'E1' },
    { client_ts: 3, action: 'edited', item_id: 'S-1', old_value: 'E1', new_value: 'D6' }, // twice: E2 -> D6
    { client_ts: 4, action: 'edited', item_id: 'S-2', old_value: 'W2', new_value: 'D6' },
    { client_ts: 5, action: 'edited', item_id: 'S-2', old_value: 'D6', new_value: 'W2' }, // back: not counted
    { client_ts: 6, action: 'edited', item_id: 'S-9', old_value: 'E2', new_value: 'E1' }, // phantom
    { client_ts: 7, action: 'confirmed', item_id: 'sheet1', new_value: '1' },
  ]
  const r = scoreSheet(ev, key, 40)
  assert.deepEqual(r.realEdited, [{ id: 'S-1', from: 'E2', to: 'D6' }])
  assert.equal(r.overs[0].caught, false) // an edited phantom is still not caught
  // Caught / not caught is the same with or without the edit events.
  const noEdits = scoreSheet(ev.filter((e) => e.action !== 'edited'), key, 40)
  assert.deepEqual(r.overs, noEdits.overs)
  assert.deepEqual(r.unders, noEdits.unders)
})

test('zoom_changed / panned / legend_toggled never change a score (step 10)', () => {
  const key = {
    manipulations: [
      { id: 'D1', direction: 'UNDER', x: 100, y: 100, cost: 5, pair_id: 'p1' },
      { id: 'S-1', direction: 'OVER', x: 0, y: 0, cost: 7, pair_id: 'p1' },
    ],
  }
  const base = [
    { client_ts: 1, action: 'sheet_opened', item_id: 'sheet1' },
    { client_ts: 5, action: 'rejected', item_id: 'S-1', old_value: null, new_value: 'rejected' },
    { client_ts: 9, action: 'confirmed', item_id: 'sheet1', new_value: '123' },
  ]
  // View events centred exactly on the deleted item and named like ids.
  const view = [
    { client_ts: 2, action: 'zoom_changed', item_id: 'wheel', x: 100, y: 100, old_value: '52', new_value: '81' },
    { client_ts: 3, action: 'panned', item_id: 'drag', x: 100, y: 100, new_value: '81' },
    { client_ts: 4, action: 'panned', item_id: 'scroll', x: 100, y: 100, new_value: '81' },
    { client_ts: 6, action: 'zoom_changed', item_id: 'button', x: 100, y: 100, old_value: '81', new_value: '101' },
    { client_ts: 7, action: 'zoom_changed', item_id: 'fit', x: 100, y: 100, old_value: '101', new_value: '52' },
    { client_ts: 8, action: 'legend_toggled', new_value: 'closed' },
  ]
  const plain = scoreSheet(base, key, 40)
  const withView = scoreSheet([...base, ...view], key, 40)
  assert.deepEqual(withView, plain)
  assert.equal(withView.unders[0].caught, false) // a view centred on it is not an add
  assert.equal(withView.overs[0].caught, true)
})

console.log('output + CLI')

test('manipulations CSV: one row per manipulation with the required columns', () => {
  const csv = manipulationsCsv(results)
  const rows = parseCsv(csv)
  assert.deepEqual(rows[0], [
    'participant',
    'session',
    'sheet',
    'manipulation_id',
    'direction',
    'pair_id',
    'cost',
    'caught',
  ])
  assert.equal(rows.length, 1 + 4 * 3) // 4 manipulations x 3 scored sheets
  assert.deepEqual(rows.slice(1, 5), [
    ['A', 'fix1', 'sheet1', 'S1-4', 'OVER', 'P1', '86', 'true'],
    ['A', 'fix1', 'sheet1', 'S1-7', 'OVER', 'P2', '58', 'false'],
    ['A', 'fix1', 'sheet1', 'U1', 'UNDER', 'P1', '18.5', 'true'],
    ['A', 'fix1', 'sheet1', 'U2', 'UNDER', 'P2', '48', 'false'],
  ])
})

test('CLI runs end to end on the fixture and writes the CSV', () => {
  const dir = mkdtempSync(join(tmpdir(), 'score-test-'))
  try {
    const cfg = join(dir, 'cfg.json')
    const out = join(dir, 'out.csv')
    writeFileSync(cfg, JSON.stringify({ radius: RADIUS }))
    const run = spawnSync(
      process.execPath,
      [
        join(here, 'score.js'),
        join(fixtures, 'events.csv'),
        '--config', cfg,
        '--key-dir', join(fixtures, 'answer-key'),
        '--out', out,
      ],
      { encoding: 'utf8' },
    )
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, /Scoring radius: 40 image pixels/)
    assert.match(run.stdout, /Exact duplicate rows dropped: 1/)
    assert.match(run.stdout, /nearest deleted U2 at 860\.2px/)
    assert.match(run.stdout, /nearest deleted U3 at 45\.0px/)
    assert.match(run.stdout, /Real items rejected: 1/)
    assert.match(run.stdout, /Real items edited: \d+/)
    // OVER: A/sheet1 1 + A/sheet2 0 + B/sheet2 1. UNDER: A/sheet1 1 + A/sheet2 1 + B 0.
    assert.match(run.stdout, /OVER caught:  2\/6/)
    assert.match(run.stdout, /UNDER caught: 2\/6/)
    assert.match(run.stdout, /Skipped \(no answer key\).*sheet3/)
    assert.equal(readFileSync(out, 'utf8'), manipulationsCsv(results))

    // --session filter: a known session scores only that session.
    const only = spawnSync(
      process.execPath,
      [
        join(here, 'score.js'),
        join(fixtures, 'events.csv'),
        '--session', 'fix1',
        '--config', cfg,
        '--key-dir', join(fixtures, 'answer-key'),
        '--out', join(dir, 'only.csv'),
      ],
      { encoding: 'utf8' },
    )
    assert.equal(only.status, 0, only.stderr)
    assert.match(only.stdout, /OVER caught:  2\/6/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Run the CLI on the fixture with extra args; returns { run, out, cleanup }.
function runCli(extraArgs) {
  const dir = mkdtempSync(join(tmpdir(), 'score-test-'))
  const cfg = join(dir, 'cfg.json')
  const out = join(dir, 'out.csv')
  writeFileSync(cfg, JSON.stringify({ radius: RADIUS }))
  const run = spawnSync(
    process.execPath,
    [
      join(here, 'score.js'),
      join(fixtures, 'events.csv'),
      ...extraArgs,
      '--config', cfg,
      '--key-dir', join(fixtures, 'answer-key'),
      '--out', out,
    ],
    { encoding: 'utf8' },
  )
  return { run, out, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('--session that matches nothing: clear message, lists labels found, writes nothing', () => {
  const { run, out, cleanup } = runCli(['--session', 'nope'])
  try {
    assert.equal(run.status, 1)
    assert.match(run.stderr, /no events found for session label "nope"/)
    assert.match(run.stderr, /Session labels in this file:/)
    // Counts are after exact-duplicate removal: fix1 = 25 (row 26 dropped).
    assert.match(run.stderr, /fix1\s+\(25 events\)/)
    assert.match(run.stderr, /fix2\s+\(2 events\)/)
    assert.match(run.stderr, /\(blank\)\s+\(2 events\)/)
    assert.doesNotMatch(run.stdout, /0\/0/) // not the old silent zero report
    assert.equal(existsSync(out), false) // no output CSV written
  } finally {
    cleanup()
  }
})

test('session found but nothing scorable: says so and writes nothing', () => {
  // fix2 only has practice events, which are never scored.
  const { run, out, cleanup } = runCli(['--session', 'fix2'])
  try {
    assert.equal(run.status, 1)
    assert.match(run.stderr, /session "fix2" has 2 events but no sheet could be scored/)
    assert.match(run.stderr, /practice \(never scored\)/)
    assert.match(run.stderr, /Answer keys loaded for: sheet1, sheet2/)
    assert.equal(existsSync(out), false)
  } finally {
    cleanup()
  }
})

test('CLI refuses to run when the config has no radius', () => {
  const dir = mkdtempSync(join(tmpdir(), 'score-test-'))
  try {
    const cfg = join(dir, 'cfg.json')
    writeFileSync(cfg, JSON.stringify({ _note: 'no radius here' }))
    const run = spawnSync(
      process.execPath,
      [
        join(here, 'score.js'),
        join(fixtures, 'events.csv'),
        '--config', cfg,
        '--key-dir', join(fixtures, 'answer-key'),
        '--out', join(dir, 'out.csv'),
      ],
      { encoding: 'utf8' },
    )
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, /radius/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the committed scoring.config.json is valid', () => {
  const cfg = JSON.parse(readFileSync(resolve(here, '..', 'scoring.config.json'), 'utf8'))
  validateConfig(cfg)
})

console.log(`\n${passed} tests passed`)
