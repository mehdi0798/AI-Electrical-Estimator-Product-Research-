#!/usr/bin/env node
// Autopilot for Feature 1 (see "Autopilot mode" in CLAUDE.md).
// Claude Code builds headless; Codex CLI reviews read-only (plan, then diff).
// The script alone runs the checks and does every git write.
//
//   node autopilot/run.mjs --phases 2      (one phase)
//   node autopilot/run.mjs --phases 2-6    (default)

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AP = join(ROOT, 'autopilot')
const PHASES = JSON.parse(readFileSync(join(AP, 'phases.json'), 'utf8'))
const SCHEMA = join(AP, 'review.schema.json')
const PLAN_SETTINGS = join(AP, 'claude-plan.settings.json')
const BUILD_SETTINGS = join(AP, 'claude-build.settings.json')
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const CODEX_JS = process.env.CODEX_JS || join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')

const BRANCH = 'product'
const MAX_FIX_ROUNDS = 2
const CALL_TIMEOUT_MS = 45 * 60e3
const MAX_TOTAL_WAIT_MS = 8 * 3600e3
const DEFAULT_WAIT_MS = 15 * 60e3
const LOCAL_UNTRACKED = new Set(['public/item_names.sql'])
const RUN_OUTPUT = /^autopilot\/(runs\/|REPORT\.md$|SUMMARY\.md$)/
const PROTECTED = [/^public\/sheets\//, /^answer-key\//, /^baseline\//, /^handoff\//, /^planting\//, /^scoring\.config\.json$/, /^scripts\/score(-lib)?\.js$/]
const LIMIT_RE = /usage limit|rate.?limit|hit your limit|limit reached|too many requests|\b429\b|overloaded|quota/i
const ATTRIBUTION = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

class Stop extends Error {
  constructor(reason, details = '', { commitReport = true } = {}) {
    super(reason)
    this.details = details
    this.commitReport = commitReport
  }
}

// --- args, run folder, log --------------------------------------------------------

function parsePhases(argv) {
  const i = argv.indexOf('--phases')
  const spec = i >= 0 ? argv[i + 1] : '2-6'
  const [a, b = a] = spec.split('-').map(Number)
  const list = []
  for (let n = a; n <= b; n++) list.push(String(n))
  if (!list.length || list.some((n) => !PHASES[n])) throw new Error(`--phases ${spec}: only phases ${Object.keys(PHASES).join(', ')} exist`)
  return list
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const RUN_REL = `autopilot/runs/${stamp}`
const RUN = join(ROOT, RUN_REL)
mkdirSync(RUN, { recursive: true })
const rel = (p) => relative(ROOT, p).split('\\').join('/')

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  appendFileSync(join(RUN, 'run.log'), line + '\n')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- processes ----------------------------------------------------------------------

function git(args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0 && !allowFail) throw new Stop(`git ${args.join(' ')} failed`, (r.stderr || '') + (r.stdout || ''))
  return r
}

function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  else child.kill('SIGKILL')
}

function run(cmd, args, { input = null, shell = false, timeoutMs = CALL_TIMEOUT_MS } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, { cwd: ROOT, shell, windowsHide: true })
    let out = ''
    let timedOut = false
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    const timer = setTimeout(() => { timedOut = true; killTree(child) }, timeoutMs)
    child.on('error', (err) => { clearTimeout(timer); resolveRun({ code: -1, out: out + String(err), timedOut }) })
    child.on('close', (code) => { clearTimeout(timer); resolveRun({ code, out, timedOut }) })
    if (input !== null) child.stdin.end(input)
    else child.stdin.end()
  })
}

// "...limit reached|1730000000" (epoch s) or "resets 3pm" / "resets at 3:30 pm".
function resetTime(text) {
  const epoch = text.match(/\|(\d{10})\b/)
  if (epoch) return Number(epoch[1]) * 1000
  const m = text.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'pm') h += 12
  const t = new Date()
  t.setHours(h, Number(m[2] || 0), 0, 0)
  if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1)
  return t.getTime()
}

let waitedMs = 0
async function withLimitRetry(label, call) {
  for (;;) {
    const r = await call()
    if (!r.limited) return r
    const at = resetTime(r.text)
    const ms = at ? Math.max(60e3, at - Date.now() + 60e3) : DEFAULT_WAIT_MS
    if (waitedMs + ms > MAX_TOTAL_WAIT_MS) throw new Stop(`${label}: usage limit still hit after waiting ${Math.round(waitedMs / 60e3)} min in total`, r.text.slice(-2000))
    log(`${label}: usage limit hit, waiting ${Math.round(ms / 60e3)} min, then retrying the same step`)
    await sleep(ms)
    waitedMs += ms
  }
}

// --- Claude (builder) and Codex (reviewer) ---------------------------------------------

async function claude({ label, prompt, sessionId, resume, settings, outBase }) {
  const args = ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk', '--settings', settings]
  args.push(resume ? '--resume' : '--session-id', sessionId)
  const r = await withLimitRetry(label, async () => {
    const p = await run(CLAUDE_BIN, args, { input: prompt })
    let j = null
    try { j = JSON.parse(p.out.slice(p.out.indexOf('{'))) } catch { /* not JSON: an error before the session started */ }
    const failed = p.code !== 0 || !j || j.is_error
    const text = j?.result ?? p.out
    return { ...p, j, text, failed, limited: failed && (LIMIT_RE.test(text) || j?.api_error_status === 429) }
  })
  writeFileSync(`${outBase}.md`, r.text ?? '')
  writeFileSync(`${outBase}.meta.json`, JSON.stringify({
    exit: r.code, timedOut: r.timedOut, is_error: r.j?.is_error, subtype: r.j?.subtype, session_id: r.j?.session_id,
    num_turns: r.j?.num_turns, duration_ms: r.j?.duration_ms, total_cost_usd: r.j?.total_cost_usd,
    permission_denials: r.j?.permission_denials,
  }, null, 2))
  if (r.timedOut) throw new Stop(`${label}: Claude did not finish within ${CALL_TIMEOUT_MS / 60e3} min`)
  if (r.failed) throw new Stop(`${label}: Claude failed`, String(r.text).slice(-3000))
  return r.text.trim()
}

async function codexReview({ label, prompt, outFile }) {
  const args = [CODEX_JS, 'exec', '-s', 'read-only', '-C', ROOT, '--color', 'never', '--output-schema', SCHEMA, '-o', outFile, '-']
  const r = await withLimitRetry(label, async () => {
    const p = await run(process.execPath, args, { input: prompt })
    const failed = p.code !== 0 || !existsSync(outFile)
    return { ...p, text: p.out, failed, limited: failed && LIMIT_RE.test(p.out) }
  })
  writeFileSync(outFile.replace(/\.json$/, '.log'), r.out)
  if (r.timedOut) throw new Stop(`${label}: Codex did not finish within ${CALL_TIMEOUT_MS / 60e3} min`)
  if (r.failed) throw new Stop(`${label}: Codex failed`, r.out.slice(-3000))
  let v
  try { v = JSON.parse(readFileSync(outFile, 'utf8')) } catch { throw new Stop(`${label}: Codex answer is not valid JSON`, readFileSync(outFile, 'utf8').slice(0, 2000)) }
  if (!['APPROVE', 'CHANGES'].includes(v.verdict)) throw new Stop(`${label}: Codex verdict is "${v.verdict}"`)
  log(`${label}: ${v.verdict}${v.reasons?.length ? ' — ' + v.reasons.join(' | ').slice(0, 400) : ''}`)
  return v
}

// --- repo checks --------------------------------------------------------------------------

function currentBranch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim()
}

function requireBranch() {
  const b = currentBranch()
  if (b !== BRANCH) throw new Stop(`branch is "${b}", not "${BRANCH}"`, '', { commitReport: false })
}

// Paths changed in the work tree (tracked and new), ignoring autopilot output and local files.
function changedFiles() {
  const out = git(['status', '--porcelain=v1', '-z', '-uall']).stdout.split('\0').filter(Boolean)
  const files = []
  for (let i = 0; i < out.length; i++) {
    const entry = out[i]
    const xy = entry.slice(0, 2)
    files.push({ path: entry.slice(3), untracked: xy === '??' })
    if (xy[0] === 'R' || xy[0] === 'C') i++ // rename/copy: the next entry is the old path
  }
  return files.filter((f) => !RUN_OUTPUT.test(f.path) && !LOCAL_UNTRACKED.has(f.path))
}

function phaseLine() {
  const m = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').match(/Current phase: \*\*Phase (\d+)\*\*/)
  return m ? m[1] : null
}

function preflight(firstPhase) {
  requireBranch()
  if (!existsSync(CODEX_JS)) throw new Stop(`Codex CLI not found at ${CODEX_JS} (set CODEX_JS)`, '', { commitReport: false })
  const hook = join(ROOT, '.git', 'hooks', 'pre-push')
  if (!existsSync(hook) || !readFileSync(hook, 'utf8').includes('refs/heads/product')) throw new Stop('the pre-push guard hook is missing (.git/hooks/pre-push)', '', { commitReport: false })
  if (!existsSync(join(ROOT, '.claude', 'settings.json'))) throw new Stop('.claude/settings.json (deny rules) is missing', '', { commitReport: false })
  const dirty = changedFiles()
  if (dirty.length) throw new Stop('the work tree is not clean', dirty.map((f) => f.path).join('\n'), { commitReport: false })
  git(['fetch', 'origin', BRANCH])
  const head = git(['rev-parse', 'HEAD']).stdout.trim()
  const remote = git(['rev-parse', `origin/${BRANCH}`]).stdout.trim()
  if (head !== remote) throw new Stop(`local ${BRANCH} (${head.slice(0, 7)}) is not the same as origin/${BRANCH} (${remote.slice(0, 7)})`, '', { commitReport: false })
  if (phaseLine() !== firstPhase) throw new Stop(`CLAUDE.md says Current phase: Phase ${phaseLine()}, but the run starts at Phase ${firstPhase}`, '', { commitReport: false })
}

// Files outside the phase list, study data, or non-comment edits to a comment-only file.
function scopeProblems(phase, files) {
  const spec = PHASES[phase]
  const problems = []
  for (const f of files) {
    if (PROTECTED.some((re) => re.test(f.path))) problems.push(`STUDY DATA changed: ${f.path} (hard rule 2)`)
    else if (!spec.files.includes(f.path)) problems.push(`outside this phase's file list: ${f.path}`)
  }
  for (const path of spec.commentOnly || []) {
    if (!files.some((f) => f.path === path)) continue
    const diff = git(['diff', '-U0', 'HEAD', '--', path]).stdout.split('\n')
    const bad = diff.filter((l) => /^[+-](?![+-])/.test(l) && l.slice(1).trim() !== '' && !l.slice(1).trim().startsWith('//'))
    if (bad.length) problems.push(`${path} may only change comments in this phase, but these lines are code:\n${bad.join('\n')}`)
  }
  return problems
}

function writePatch(files, outFile) {
  let patch = ''
  const tracked = files.filter((f) => !f.untracked).map((f) => f.path)
  if (tracked.length) patch += git(['diff', 'HEAD', '--', ...tracked]).stdout
  for (const f of files.filter((x) => x.untracked)) patch += git(['diff', '--no-index', '--', '/dev/null', f.path], { allowFail: true }).stdout
  writeFileSync(outFile, patch)
}

async function npm(script, outFile) {
  const args = script === 'test' ? ['test'] : ['run', script]
  const r = await run('npm', args, { shell: process.platform === 'win32', timeoutMs: 15 * 60e3 })
  writeFileSync(outFile, r.out)
  return { ok: r.code === 0 && !r.timedOut, tail: r.out.split('\n').slice(-60).join('\n') }
}

// --- secrets: never commit a value from .env* -------------------------------------------

function secretValues() {
  const vals = []
  for (const name of ['.env', '.env.local', '.env.production', '.env.development']) {
    const p = join(ROOT, name)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/)
      const v = m?.[1]?.trim().replace(/^['"]|['"]$/g, '')
      if (v && v.length >= 12) vals.push(v)
    }
  }
  return vals
}

function redact(paths) {
  const vals = secretValues()
  if (!vals.length) return
  const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p])
  for (const file of paths.filter(existsSync).flatMap(walk)) {
    let text = readFileSync(file, 'utf8')
    let hit = false
    for (const v of vals) if (text.includes(v)) { text = text.split(v).join('[REDACTED]'); hit = true }
    if (hit) { writeFileSync(file, text); log(`redacted a secret value in ${rel(file)}`) }
  }
}

// --- git writes (the script only) ---------------------------------------------------------

function commitAndPush(paths, message) {
  requireBranch()
  git(['reset', '-q']) // unstage only; the work tree is untouched
  git(['add', '--', ...paths])
  git(['commit', '-q', '-m', message])
  requireBranch()
  git(['push', 'origin', BRANCH])
  return git(['rev-parse', '--short', 'HEAD']).stdout.trim()
}

function setPhaseLine(next) {
  const p = join(ROOT, 'CLAUDE.md')
  const text = readFileSync(p, 'utf8')
  const updated = text.replace(/Current phase: \*\*Phase \d+\*\*/, `Current phase: **Phase ${next}**`)
  if (updated === text) throw new Stop('could not update the "Current phase" line in CLAUDE.md')
  writeFileSync(p, updated)
}

// --- prompts -------------------------------------------------------------------------------

const header = (n) => {
  const s = PHASES[n]
  return [
    `AUTOPILOT MODE: read the "Autopilot mode" section of CLAUDE.md and follow it. You run headless; nobody will answer questions.`,
    `Phase ${n} — ${s.title}.`,
    `What this phase does: ${s.task}`,
    `Files you may change: ${s.files.join(', ')}.${s.commentOnly ? ` In ${s.commentOnly.join(', ')} you may change comments only.` : ''}`,
    `Do not build anything that belongs to a later phase.`,
  ].join('\n')
}

const planPrompt = (n) => `${header(n)}

STEP: PLAN. Do not edit any file in this step; read whatever you need.
Write the plan for Phase ${n} only: at most 8 bullets, naming each file and function you will add or change, and the tests.
If the phase cannot be done without breaking a hard rule or touching other files, make the first line "BLOCKED:" and explain.
Your final message must be the plan itself, in Markdown, nothing else.`

const revisePrompt = (reasons) => `The reviewer asked for changes to your plan:
${reasons.map((r) => `- ${r}`).join('\n')}

Revise the plan. Same rules: no file edits in this step, at most 8 bullets. Your final message must be the full revised plan in Markdown.`

const buildPrompt = (n) => `The reviewer approved your plan. STEP: BUILD Phase ${n} exactly as planned.
- Change only the allowed files. Never run git commands except git diff / git status / git log / git show.
- Run \`npm test\` and \`npm run build\` and fix any failure you caused.
- Do not commit; the script commits after its own checks.
Your final message, in Markdown, must have exactly two sections:
## Changed
(simple words, one line per file)
## What to click
(exact steps the user follows in the app to check this phase; first say that \`allMarks\` must be set to true in src/config/features.json locally to see anything, if that applies)`

const fixPrompt = (problems) => `The checks after your build failed:
${problems.map((p) => `- ${p}`).join('\n')}

Fix only these. Same rules as the build step. Your final message must again have "## Changed" and "## What to click".`

const planReviewPrompt = (n, planRel, prev) => `You are the reviewer in an autopilot run. You are read-only: do not change anything.
Read CLAUDE.md in this repository: hard rules, spec, architecture, "Phase 1 decisions", Tests and "Autopilot mode".
The builder proposes a plan for:
${header(n)}

The plan is in ${planRel}. Read it.
Check that it does exactly Phase ${n} as CLAUDE.md describes it, follows the Phase 1 decisions, stays inside the allowed files, breaks no hard rule, builds nothing from a later phase, and includes the tests CLAUDE.md asks for in this phase.
${prev.length ? `Your previous review asked for:\n${prev.map((r) => `- ${r}`).join('\n')}\nCheck that these are addressed.\n` : ''}Answer APPROVE if the plan is good enough to build. Answer CHANGES only for real problems, each reason concrete and actionable. No optional polish. Never read or quote .env files or secrets.`

const diffReviewPrompt = (n, planRel, patchRel, testRel, buildRel, prev) => `You are the reviewer in an autopilot run. You are read-only: do not change anything.
Read CLAUDE.md in this repository: hard rules, spec, architecture, "Phase 1 decisions", Tests and "Autopilot mode".
${header(n)}

The approved plan is in ${planRel}. The full diff of this phase is in ${patchRel}. The script already ran \`npm test\` (${testRel}) and \`npm run build\` (${buildRel}); both passed.
Review the diff: it must be correct, match the plan and CLAUDE.md, stay in the allowed files, keep every hard rule (especially 3: no mark from answer keys; 4: all x,y conversions through src/lib/geometry.js; 5: logging only from App.jsx handlers with logEvent; 6: with allMarks false the app looks and logs exactly as before), and its tests must really check what CLAUDE.md asks.
${prev.length ? `Your previous review asked for:\n${prev.map((r) => `- ${r}`).join('\n')}\nCheck that these are addressed.\n` : ''}Answer APPROVE if it can be committed. Answer CHANGES only for real defects, each reason concrete and actionable. No optional polish. Never read or quote .env files or secrets.`

// --- one phase --------------------------------------------------------------------------------

async function runPhase(n, state) {
  const dir = join(RUN, `phase-${n}`)
  mkdirSync(dir, { recursive: true })
  const sessionId = randomUUID()
  const rec = { phase: n, title: PHASES[n].title, sessionId, planRounds: 0, diffRounds: 0 }
  state.current = rec
  log(`Phase ${n} — ${PHASES[n].title}: start (Claude session ${sessionId})`)

  // Plan, reviewed by Codex; at most MAX_FIX_ROUNDS revisions.
  let plan = await claude({ label: `phase ${n} plan`, prompt: planPrompt(n), sessionId, resume: false, settings: PLAN_SETTINGS, outBase: join(dir, 'plan-1') })
  if (plan.startsWith('BLOCKED:')) throw new Stop(`Phase ${n}: Claude says the plan is blocked`, plan)
  let planFile = join(dir, 'plan-1.md')
  let prev = []
  for (let round = 1; ; round++) {
    const v = await codexReview({ label: `phase ${n} plan review ${round}`, prompt: planReviewPrompt(n, rel(planFile), prev), outFile: join(dir, `plan-review-${round}.json`) })
    rec.planRounds = round - 1
    if (v.verdict === 'APPROVE') break
    if (round > MAX_FIX_ROUNDS) throw new Stop(`Phase ${n}: Codex still asks for plan changes after ${MAX_FIX_ROUNDS} fix rounds`, v.reasons.map((r) => `- ${r}`).join('\n'))
    prev = v.reasons
    plan = await claude({ label: `phase ${n} plan revision ${round}`, prompt: revisePrompt(v.reasons), sessionId, resume: true, settings: PLAN_SETTINGS, outBase: join(dir, `plan-${round + 1}`) })
    if (plan.startsWith('BLOCKED:')) throw new Stop(`Phase ${n}: Claude says the plan is blocked`, plan)
    planFile = join(dir, `plan-${round + 1}.md`)
  }
  rec.planFile = rel(planFile)

  // Build, then the script's own checks and Codex's diff review; at most MAX_FIX_ROUNDS fixes.
  let report = await claude({ label: `phase ${n} build`, prompt: buildPrompt(n), sessionId, resume: true, settings: BUILD_SETTINGS, outBase: join(dir, 'build-1') })
  prev = []
  for (let round = 1; ; round++) {
    const files = changedFiles()
    if (!files.length) throw new Stop(`Phase ${n}: the build changed no files`, report)
    const scope = scopeProblems(n, files)
    if (scope.length) throw new Stop(`Phase ${n}: the build touched files it may not touch`, scope.join('\n'))

    const problems = []
    const test = await npm('test', join(dir, `test-${round}.log`))
    if (!test.ok) problems.push(`npm test failed. Last lines:\n${test.tail}`)
    const build = test.ok ? await npm('build', join(dir, `build-${round}.log`)) : null
    if (build && !build.ok) problems.push(`npm run build failed. Last lines:\n${build.tail}`)
    log(`phase ${n} checks round ${round}: npm test ${test.ok ? 'pass' : 'FAIL'}, npm run build ${build ? (build.ok ? 'pass' : 'FAIL') : 'not run'}`)

    if (!problems.length) {
      const patchFile = join(dir, `diff-${round}.patch`)
      writePatch(files, patchFile)
      const v = await codexReview({
        label: `phase ${n} diff review ${round}`,
        prompt: diffReviewPrompt(n, rec.planFile, rel(patchFile), rel(join(dir, `test-${round}.log`)), rel(join(dir, `build-${round}.log`)), prev),
        outFile: join(dir, `diff-review-${round}.json`),
      })
      if (v.verdict === 'APPROVE') {
        rec.diffRounds = round - 1
        rec.files = files.map((f) => f.path)
        rec.report = report
        break
      }
      prev = v.reasons
      problems.push(...v.reasons.map((r) => `Reviewer: ${r}`))
    }
    if (round > MAX_FIX_ROUNDS) throw new Stop(`Phase ${n}: still not approved after ${MAX_FIX_ROUNDS} fix rounds`, problems.join('\n\n'))
    report = await claude({ label: `phase ${n} fix ${round}`, prompt: fixPrompt(problems), sessionId, resume: true, settings: BUILD_SETTINGS, outBase: join(dir, `build-${round + 1}`) })
  }

  // Commit: the phase's files, its run output, and the next "Current phase" line.
  setPhaseLine(Number(n) + 1)
  writeFileSync(join(dir, 'result.json'), JSON.stringify(rec, null, 2))
  redact([dir])
  const msg = `product: Feature 1 Phase ${n} (${PHASES[n].title})

Autopilot run ${stamp}. Codex: plan approved after ${rec.planRounds} fix round(s),
diff approved after ${rec.diffRounds} fix round(s). npm test and npm run build pass.

${ATTRIBUTION}`
  rec.commit = commitAndPush([...rec.files, 'CLAUDE.md', rel(dir)], msg)
  log(`Phase ${n}: committed ${rec.commit} and pushed to origin/${BRANCH}`)
  state.done.push(rec)
  state.current = null
}

// --- report and summary -----------------------------------------------------------------------

function summaryText(state) {
  const lines = [`# Autopilot summary — run ${stamp}`, '', `Phases run: ${state.phases.join(', ')}. All approved by Codex, \`npm test\` and \`npm run build\` pass.`, `Run output (plans, reviews, logs): \`${RUN_REL}/\`.`, '']
  for (const r of state.done) {
    lines.push(`## Phase ${r.phase} — ${r.title}`, '', `- Commit: \`${r.commit}\``, `- Files: ${r.files.map((f) => `\`${f}\``).join(', ')}`,
      `- Codex: plan fix rounds ${r.planRounds}, diff fix rounds ${r.diffRounds}`, `- Approved plan: \`${r.planFile}\``, '', r.report.replace(/^## /gm, '### '), '')
  }
  lines.push('## Next', '', 'Phase 7 (quality check) is interactive. `allMarks` is still `false` in every commit.')
  return lines.join('\n') + '\n'
}

function reportText(state, err) {
  const r = state.current
  return [
    `# Autopilot stopped — run ${stamp}`, '',
    `**Why:** ${err.message}`, '',
    r ? `**Where:** Phase ${r.phase} — ${r.title} (Claude session \`${r.sessionId}\`)` : '**Where:** before any phase started', '',
    `**Phases committed in this run:** ${state.done.length ? state.done.map((d) => `${d.phase} (\`${d.commit}\`)`).join(', ') : 'none'}`, '',
    '## Details', '', '```', String(err.details || '(none)').slice(0, 8000), '```', '',
    '## State of the work tree', '',
    'Uncommitted changes from the stopped phase were left in place for you to inspect (nothing was reverted):', '',
    '```', changedFilesSafe().join('\n') || '(none)', '```', '',
    `Run output (plans, reviews, logs): \`${RUN_REL}/\`.`, '',
    '## To continue', '', `Look at the details above, fix or discard the uncommitted changes, then start again with \`node autopilot/run.mjs --phases ${r ? r.phase : state.phases[0]}-${state.phases.at(-1)}\`.`, '',
  ].join('\n')
}

function changedFilesSafe() {
  try { return changedFiles().map((f) => f.path) } catch { return [] }
}

// --- main -----------------------------------------------------------------------------------------

async function main() {
  const state = { phases: parsePhases(process.argv), done: [], current: null }
  log(`autopilot run ${stamp}: phases ${state.phases.join(', ')}`)
  try {
    preflight(state.phases[0])
    for (const n of state.phases) await runPhase(n, state)
    writeFileSync(join(AP, 'SUMMARY.md'), summaryText(state))
    redact([join(AP, 'SUMMARY.md'), RUN])
    const c = commitAndPush(['autopilot/SUMMARY.md', RUN_REL], `autopilot: summary of run ${stamp}\n\n${ATTRIBUTION}`)
    log(`done: summary committed ${c} and pushed`)
  } catch (err) {
    if (!(err instanceof Stop)) err = new Stop(`unexpected error: ${err.message}`, err.stack)
    log(`STOP: ${err.message}`)
    writeFileSync(join(AP, 'REPORT.md'), reportText(state, err))
    if (err.commitReport) {
      try {
        redact([join(AP, 'REPORT.md'), RUN])
        const c = commitAndPush(['autopilot/REPORT.md', RUN_REL], `autopilot: stopped (${err.message.slice(0, 60)})\n\n${ATTRIBUTION}`)
        log(`REPORT.md committed ${c} and pushed`)
      } catch (e) {
        log(`could not commit REPORT.md: ${e.message}`)
      }
    }
    process.exitCode = 1
  }
}

main()
