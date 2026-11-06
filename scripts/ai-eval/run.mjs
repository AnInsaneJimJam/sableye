// AI integration eval (#56): can an AI coding agent add Sableye to a REAL-shaped merchant app that already has its own
// (fake) payment step, set up exactly the way a merchant would (the `sableye` package installed, `npx sableye init --yes`),
// given only the prompt that init prints, and integrate without redesigning the app?
//   pnpm -r build && node scripts/ai-eval/run.mjs [--trials 3] [--shapes next-vercel,next-railway,express,static] [--model sonnet]
// Shapes run in parallel. Writes scripts/ai-eval/results.json and project-docs/AI_EVAL.md.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'

const { values } = parseArgs({ options: {
  trials: { type: 'string', default: '3' }, shapes: { type: 'string', default: 'next-vercel,next-railway,express,static' },
  model: { type: 'string' }, regrade: { type: 'boolean', default: false }, 'timeout-min': { type: 'string', default: '25' },
} })
const REPO = new URL('../../', import.meta.url).pathname
const FIXTURES = join(REPO, 'scripts/ai-eval/fixtures')
const SHAPES = {
  'next-vercel': { fixture: 'next-shop', extra: { 'vercel.json': '{}' }, hosting: 'serverless', next: true },
  'next-railway': { fixture: 'next-shop', extra: { 'railway.json': '{}' }, hosting: 'server', next: true },
  express: { fixture: 'express-shop', extra: {}, hosting: 'server' },
  static: { fixture: 'static-studio', extra: {}, hosting: 'server' },
}

// The `sableye` package exactly as it would be published.
const SDK = mkdtempSync(join(tmpdir(), 'ai-eval-sdk-'))
execFileSync('pnpm', ['pack', '--pack-destination', SDK], { cwd: join(REPO, 'sdk/packages/sableye'), stdio: 'ignore' })
const TARBALL = join(SDK, readdirSync(SDK).find((f) => f.endsWith('.tgz')))
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')

/** Copy the fixture, install, run the real CLI, commit a baseline. Returns the prompt init printed. */
function setup(shape, dir) {
  const s = SHAPES[shape]
  cpSync(join(FIXTURES, s.fixture), dir, { recursive: true })
  for (const [f, text] of Object.entries(s.extra)) writeFileSync(join(dir, f), text)
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n.next\n')
  const sh = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  sh('npm', ['install', '--silent', '--no-audit', '--no-fund'])
  sh('npm', ['install', '--silent', '--no-audit', '--no-fund', TARBALL, 'viem'])
  sh('git', ['init', '-q'])
  sh('git', ['add', '-A'])
  sh('git', ['-c', 'user.email=eval@sableye', '-c', 'user.name=eval', 'commit', '-qm', 'app before Sableye'])
  const out = strip(spawnSync('node', ['node_modules/sableye/bin/sableye.mjs', 'init', '--yes'], { cwd: dir, encoding: 'utf8', env: { ...process.env, SABLEYE_NO_BANNER: '1', CI: '1' }, timeout: 180_000 }).stdout)
  const prompt = out.split(/─{20,}\n/)[1]?.trim()
  if (!prompt) throw new Error(`${shape}: init printed no prompt:\n${out.slice(-1500)}`)
  sh('git', ['add', '-A'])
  sh('git', ['-c', 'user.email=eval@sableye', '-c', 'user.name=eval', 'commit', '-qm', 'npx sableye init --yes'])
  return prompt
}

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|html)$/
const isClient = (f) => /^['"]use client['"]/m.test(f.src) || f.path.endsWith('.html') || /^(public|site|dist|static)\//.test(f.path)
function sources(dir) {
  const out = []
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      if (['node_modules', '.next', '.git', '.claude', '.sableye'].includes(f)) continue
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (CODE.test(f)) out.push({ path: relative(dir, p), src: readFileSync(p, 'utf8') })
    }
  }
  walk(dir)
  return out
}
/** Merchant-facing UI: form controls the customer sees, and page files. */
function ui(files) {
  const controls = files.filter(isClient).reduce((n, f) => n + (f.src.match(/<(button|input|select|textarea|form)\b|createElement\(['"](button|input|select|textarea|form)['"]/g) ?? []).length, 0)
  const pages = files.filter((f) => /(^|\/)page\.(tsx|jsx)$/.test(f.path) || f.path.endsWith('.html')).map((f) => f.path)
  return { controls, pages }
}

/** Start the app and check it serves its home page. */
async function serves(dir, s) {
  const port = 4000 + Math.floor(Math.random() * 2000)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const script = s.next ? 'start' : pkg.scripts?.start ? 'start' : pkg.scripts?.dev ? 'dev' : undefined
  if (!script) return false
  const env = { ...process.env, PORT: String(port), MERCHANT_KEY: `0x${randomBytes(32).toString('hex')}` }
  const child = spawn('npm', ['run', script, '--', ...(s.next ? ['-p', String(port)] : [])], { cwd: dir, env, stdio: 'ignore', detached: true })
  try {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 750))
      try {
        if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return true
      } catch {}
    }
    return false
  } finally {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
  }
}

async function grade(shape, dir, before) {
  const s = SHAPES[shape]
  const files = sources(dir)
  const client = files.filter(isClient)
  const server = files.filter((f) => !isClient(f))
  const env = { ...process.env, MERCHANT_KEY: `0x${randomBytes(32).toString('hex')}` }
  const run = (cmd, args, timeout = 600_000) => spawnSync(cmd, args, { cwd: dir, env, encoding: 'utf8', timeout })
  const after = ui(files)
  const allServer = server.map((f) => f.src).join('\n')
  const checks = {
    builds: s.next ? run('npm', ['run', 'build']).status === 0 : files.filter((f) => /\.(m?js|cjs)$/.test(f.path) && !isClient(f)).every((f) => run('node', ['--check', f.path]).status === 0),
    serves: await serves(dir, s),
    signsOnServer: /invoices\.create\s*\(/.test(allServer),
    verifiesOnServer: /verifyPayment\s*\(/.test(allServer),
    usesCheckout: files.some((f) => /<Checkout\b|createElement\(\s*Checkout|createCheckout\s*\(|checkoutUrl|SableyeCheckout\.mount\s*\(/.test(f.src)),
    keyStaysOnServer: !client.some((f) => /MERCHANT_KEY|privateKey/.test(f.src)) && !files.some((f) => /NEXT_PUBLIC_MERCHANT/.test(f.src)),
    followsSetup: /relayHandler\s*\(/.test(allServer) && (s.hosting === 'serverless' || /\.indexer\s*\(/.test(allServer)),
    noNewUi: after.controls <= before.controls && after.pages.every((p) => before.pages.includes(p) || /pay|checkout/i.test(p)),
    doctorPasses: run('npx', ['sableye', 'doctor'], 120_000).status === 0,
  }
  return { checks, pass: Object.values(checks).every(Boolean), ui: { before, after }, files: files.map((f) => f.path) }
}

async function trial(shape, i) {
  const dir = mkdtempSync(join(tmpdir(), `ai-eval-${shape}-${i}-`))
  const prompt = setup(shape, dir)
  const before = ui(sources(dir))
  const t0 = Date.now()
  const args = ['-p', `${prompt}\n\nDon't ask questions; just do it.`, '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(ls:*),Bash(cat:*),Bash(mkdir:*),Bash(cp:*)', '--output-format', 'json']
  if (values.model) args.push('--model', values.model)
  const agent = await new Promise((resolve) => {
    const child = spawn('claude', args, { cwd: dir })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    const timer = setTimeout(() => child.kill('SIGTERM'), Number(values['timeout-min']) * 60_000)
    child.on('close', () => {
      clearTimeout(timer)
      try { resolve(JSON.parse(out)) } catch { resolve({ error: out.slice(0, 300) }) }
    })
  })
  const g = await grade(shape, dir, before)
  const r = { shape, trial: i, dir, minutes: +((Date.now() - t0) / 60000).toFixed(1), turns: agent.num_turns, costUsd: agent.total_cost_usd, prompt, ...g }
  console.log(`${shape} #${i}: ${r.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(r.checks)} (${r.minutes} min, $${(r.costUsd ?? 0).toFixed(2)})`)
  return r
}

const shapes = values.shapes.split(',')
// --regrade: grade the last run's apps again (after fixing a check) without re-running the agents.
const results = values.regrade
  ? await Promise.all(JSON.parse(readFileSync(new URL('./results.json', import.meta.url), 'utf8')).map(async (r) => ({ ...r, ...(await grade(r.shape, r.dir, r.ui.before)) })))
  : (await Promise.all(shapes.map(async (shape) => {
      const out = []
      for (let i = 1; i <= Number(values.trials); i++) out.push(await trial(shape, i))
      return out
    }))).flat()
for (const r of values.regrade ? results : []) console.log(`${r.shape} #${r.trial}: ${r.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(r.checks)}`)

const passed = results.filter((r) => r.pass).length
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2))
const names = Object.keys(results[0]?.checks ?? {})
const md = `# AI integration eval

Can an AI coding agent add Sableye to a **real-shaped merchant app that already has its own (fake) payment step**, set up
exactly as a merchant would (\`sableye\` installed, \`npx sableye init --yes\`), given only the prompt \`init\` printed, and
**integrate without redesigning the app**? Harness: \`scripts/ai-eval/run.mjs\` (re-run it to reproduce). Apps:
\`scripts/ai-eval/fixtures/\`: a Next.js shop (deployed to Vercel → serverless, or Railway → long-running), an Express
shop, and a static HTML site with no server.

**Pass rate: ${passed}/${results.length} (${results.length ? Math.round((100 * passed) / results.length) : 0}%)**. Run on ${new Date().toISOString().slice(0, 10)} with Claude Code (\`claude -p\`, edit + npm/npx/node tools only).

A trial passes only if every check passes:

| Check | Meaning |
|---|---|
| builds | Next.js: \`npm run build\`; Node: every server file parses |
| serves | the app starts and serves its home page |
| signsOnServer | \`invoices.create()\` is called from server code |
| verifiesOnServer | \`verifyPayment()\` is called from server code |
| usesCheckout | the checkout is shown (\`<Checkout>\`, \`createCheckout\` or the hosted \`checkoutUrl\`) |
| keyStaysOnServer | no client code references the merchant key |
| followsSetup | what \`init\` configured is wired: the gasless relay route, and the indexer on long-running hosts |
| noNewUi | no new buttons, inputs or forms, and no new pages (a hosted pay/checkout page is allowed) |
| doctorPasses | \`npx sableye doctor\` exits 0 in the result |

| App | Trial | Result | ${names.join(' | ')} | Minutes | Cost |
|---|---|---|${names.map(() => '---|').join('')}---|---|
${results.map((r) => `| ${r.shape} | ${r.trial} | ${r.pass ? '✅' : '❌'} | ${names.map((n) => (r.checks[n] ? '✓' : '✗')).join(' | ')} | ${r.minutes} | $${(r.costUsd ?? 0).toFixed(2)} |`).join('\n')}
`
writeFileSync(join(REPO, 'project-docs/AI_EVAL.md'), md)
console.log(`\nPass rate ${passed}/${results.length}. Wrote project-docs/AI_EVAL.md`)
