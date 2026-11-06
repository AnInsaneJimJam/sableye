// AI integration eval (#56): can an AI agent integrate Sableye into a blank app using ONLY our Agent Skill and
// llms.txt? Each trial: fresh blank Next.js app → `claude -p <task>` (restricted tools) → automatic grading.
//   node scripts/ai-eval/run.mjs --trials 3 [--model sonnet]
// Writes scripts/ai-eval/results.json and project-docs/AI_EVAL.md (the published pass rate).
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'

const { values } = parseArgs({ options: { trials: { type: 'string', default: '3' }, model: { type: 'string' }, 'timeout-min': { type: 'string', default: '20' } } })
const REPO = new URL('../../', import.meta.url).pathname
const TASK = `This is a blank Next.js (App Router) app for a coffee shop.
Add a USDT checkout with Sableye so a customer can buy "Masala chai" for 1.00 USDT on Whitechain Sepolia:
a Buy button that shows the Sableye checkout, and a receipt page that confirms the payment on the server.
Use only the Sableye Agent Skill in .claude/skills/sableye and the docs in docs/llms.txt.
The SDK isn't on npm yet: install @sableye/core, @sableye/server and @sableye/react from the tarballs in ./.sableye-sdk/.
Read the merchant key from the MERCHANT_KEY environment variable. Make sure \`npm run build\` passes. Don't ask questions; just do it.`

/** A minimal blank Next.js app (no Sableye anywhere). */
function blankApp(dir) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'coffee-shop', private: true, scripts: { dev: 'next dev', build: 'next build' },
    dependencies: { next: '^16.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: { typescript: '^5.9.0', '@types/react': '^19.0.0', '@types/node': '^22.0.0' },
  }, null, 2))
  mkdirSync(join(dir, 'app'))
  writeFileSync(join(dir, 'app/layout.tsx'), `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>\n}\n`)
  writeFileSync(join(dir, 'app/page.tsx'), `export default function Home() {\n  return <main><h1>Coffee shop</h1></main>\n}\n`)
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'esnext'], strict: true, module: 'esnext', moduleResolution: 'bundler', jsx: 'preserve', noEmit: true, skipLibCheck: true, isolatedModules: true, esModuleInterop: true, resolveJsonModule: true, plugins: [{ name: 'next' }], allowJs: false, incremental: true }, include: ['**/*.ts', '**/*.tsx', 'next-env.d.ts', '.next/types/**/*.ts'], exclude: ['node_modules'] }, null, 2))
  // The only Sableye knowledge the agent gets:
  mkdirSync(join(dir, '.claude/skills/sableye'), { recursive: true })
  cpSync(join(REPO, 'skills/sableye/SKILL.md'), join(dir, '.claude/skills/sableye/SKILL.md'))
  mkdirSync(join(dir, 'docs'))
  cpSync(join(REPO, 'llms.txt'), join(dir, 'docs/llms.txt'))
  mkdirSync(join(dir, '.sableye-sdk'))
  for (const pkg of ['core', 'server', 'react']) execFileSync('pnpm', ['pack', '--pack-destination', join(dir, '.sableye-sdk')], { cwd: join(REPO, 'sdk/packages', pkg), stdio: 'ignore' })
}

const sources = (dir) => {
  const out = []
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      if (['node_modules', '.next', '.git', '.sableye-sdk', '.claude', 'docs'].includes(f)) continue
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(f)) out.push({ path: relative(dir, p), src: readFileSync(p, 'utf8') })
    }
  }
  walk(dir)
  return out
}

function grade(dir) {
  const files = sources(dir)
  const client = files.filter((f) => /^['"]use client['"]/m.test(f.src))
  const server = files.filter((f) => !client.includes(f))
  const env = { ...process.env, MERCHANT_KEY: `0x${randomBytes(32).toString('hex')}` } // a throwaway key: doctor only reads with it
  const sh = (cmd, args, timeout = 600_000) => spawnSync(cmd, args, { cwd: dir, env, encoding: 'utf8', timeout })
  const checks = {
    builds: sh('npm', ['run', 'build']).status === 0,
    signsOnServer: server.some((f) => /invoices\.create\s*\(/.test(f.src)),
    verifiesOnServer: server.some((f) => /verifyPayment\s*\(/.test(f.src)),
    usesCheckoutWidget: client.some((f) => /<Checkout\b/.test(f.src)),
    keyStaysOnServer: !client.some((f) => /MERCHANT_KEY|privateKey/.test(f.src)) && !files.some((f) => /NEXT_PUBLIC_MERCHANT/.test(f.src)),
    correctNetwork: files.some((f) => /whitechain-sepolia/.test(f.src)),
    doctorPasses: sh('npx', ['sableye', 'doctor'], 120_000).status === 0,
  }
  return { checks, pass: Object.values(checks).every(Boolean), files: files.map((f) => f.path) }
}

const results = []
for (let i = 1; i <= Number(values.trials); i++) {
  const dir = mkdtempSync(join(tmpdir(), `ai-eval-${i}-`))
  blankApp(dir)
  const t0 = Date.now()
  const args = ['-p', TASK, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(npm:*),Bash(npx:*),Bash(ls:*),Bash(cat:*)', '--output-format', 'json']
  if (values.model) args.push('--model', values.model)
  const run = spawnSync('claude', args, { cwd: dir, encoding: 'utf8', timeout: Number(values['timeout-min']) * 60_000, maxBuffer: 64 * 1024 * 1024 })
  let agent = {}
  try { agent = JSON.parse(run.stdout) } catch { agent = { error: (run.stderr || run.stdout || '').slice(0, 300) } }
  const g = existsSync(join(dir, 'node_modules')) || existsSync(join(dir, 'package.json')) ? grade(dir) : { checks: {}, pass: false, files: [] }
  const r = { trial: i, dir, minutes: +((Date.now() - t0) / 60000).toFixed(1), turns: agent.num_turns, costUsd: agent.total_cost_usd, ...g }
  results.push(r)
  console.log(`trial ${i}: ${r.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(r.checks)} (${r.minutes} min)`)
}

const passed = results.filter((r) => r.pass).length
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2))
const names = Object.keys(results[0]?.checks ?? {})
const md = `# AI integration eval

Can an AI coding agent integrate Sableye into a **blank** Next.js app using only our Agent Skill
(\`skills/sableye\`) and \`llms.txt\`? Harness: \`scripts/ai-eval/run.mjs\` (re-run it to reproduce).

**Pass rate: ${passed}/${results.length} (${results.length ? Math.round((100 * passed) / results.length) : 0}%)**. Run on ${new Date().toISOString().slice(0, 10)} with Claude Code (\`claude -p\`, edit + npm/npx tools only).

Task given to the agent:

> ${TASK.replace(/\n/g, '\n> ')}

A trial passes only if every check passes:

| Check | Meaning |
|---|---|
| builds | \`npm run build\` succeeds |
| signsOnServer | \`invoices.create()\` is called from server code |
| verifiesOnServer | \`verifyPayment()\` is called from server code (the receipt doesn't trust the browser) |
| usesCheckoutWidget | \`<Checkout/>\` is rendered in a client component |
| keyStaysOnServer | no client component references the merchant key |
| correctNetwork | uses \`whitechain-sepolia\` |
| doctorPasses | \`npx sableye doctor\` exits 0 in the generated app |

| Trial | Result | ${names.join(' | ')} | Minutes | Turns |
|---|---|${names.map(() => '---|').join('')}---|---|
${results.map((r) => `| ${r.trial} | ${r.pass ? '✅' : '❌'} | ${names.map((n) => (r.checks[n] ? '✓' : '✗')).join(' | ')} | ${r.minutes} | ${r.turns ?? '–'} |`).join('\n')}
`
writeFileSync(join(REPO, 'project-docs/AI_EVAL.md'), md)
console.log(`\nPass rate ${passed}/${results.length}. Wrote project-docs/AI_EVAL.md`)
