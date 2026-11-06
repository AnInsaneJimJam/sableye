// AI-agent setup for a merchant's repo. Best practice (Vercel's agent evals, Next.js 16): put a compact docs index in
// AGENTS.md, which agents load on every turn, pointing at version-matched docs bundled in node_modules. Add a skill
// for the "add a checkout" job, and name it explicitly in the prompt (skills that aren't named are often skipped).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { join } from 'node:path'

export const BEGIN = '<!-- BEGIN sableye'
export const END = '<!-- END sableye -->'

/** What kind of app is in `dir`, and is `sableye` installed? */
export function detectProject(dir = '.') {
  const read = (f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')) } catch { return undefined } }
  const pkg = read('package.json')
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
  const has = (d) => d in deps
  const ts = existsSync(join(dir, 'tsconfig.json'))
  let framework = 'node'
  if (has('next')) framework = existsSync(join(dir, 'app')) || existsSync(join(dir, 'src/app')) ? 'next-app' : existsSync(join(dir, 'pages')) || existsSync(join(dir, 'src/pages')) ? 'next-pages' : 'next-app'
  else if (has('express')) framework = 'express'
  else if (has('fastify')) framework = 'fastify'
  else if (has('hono')) framework = 'hono'
  else if (has('vite') && has('react')) framework = 'vite-react'
  const pm = existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(dir, 'yarn.lock')) ? 'yarn' : existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb')) ? 'bun' : 'npm'
  return {
    hasPackageJson: !!pkg, framework, ts, pm,
    installed: has('sableye'), hasViem: has('viem'), hasReact: has('react'),
    git: existsSync(join(dir, '.git')),
  }
}

export const FRAMEWORK_NAMES = {
  'next-app': 'Next.js (App Router)', 'next-pages': 'Next.js (Pages Router)', express: 'Express', fastify: 'Fastify',
  hono: 'Hono', 'vite-react': 'React (Vite)', node: 'Node.js',
}

/** The install command for the missing packages, or undefined if nothing is missing. */
export function installCommand(p) {
  const missing = [...(p.installed ? [] : ['sableye']), ...(p.hasViem ? [] : ['viem'])]
  if (!missing.length) return undefined
  return [p.pm, p.pm === 'npm' ? 'install' : 'add', ...missing]
}

/** Insert or replace the managed Sableye block, leaving the rest of the file alone. Idempotent. */
export function upsertBlock(text, block) {
  const start = text.indexOf(BEGIN)
  const end = text.indexOf(END)
  if (start !== -1 && end > start) return text.slice(0, start) + block.trimEnd() + text.slice(end + END.length)
  return `${text}${text && !text.endsWith('\n') ? '\n\n' : text ? '\n' : ''}${block.trimEnd()}\n`
}

/**
 * Write the agent files into the repo at `dir`: the AGENTS.md block, a CLAUDE.md pointer (Claude Code reads CLAUDE.md;
 * `@AGENTS.md` imports it) and the skill. `pkgDir` is the installed sableye package (holds docs/ and skills/).
 * Returns the paths it touched.
 */
export function installAgentFiles({ dir = '.', pkgDir }) {
  const touched = []
  const block = readFileSync(join(pkgDir, 'docs/AGENTS.block.md'), 'utf8')
  const agents = join(dir, 'AGENTS.md')
  const before = existsSync(agents) ? readFileSync(agents, 'utf8') : ''
  const after = upsertBlock(before, block)
  if (after !== before) { writeFileSync(agents, after); touched.push('AGENTS.md') }

  const claude = join(dir, 'CLAUDE.md')
  const claudeText = existsSync(claude) ? readFileSync(claude, 'utf8') : ''
  if (!/@AGENTS\.md/.test(claudeText)) {
    writeFileSync(claude, `${claudeText}${claudeText && !claudeText.endsWith('\n') ? '\n' : ''}${claudeText ? '\n' : ''}@AGENTS.md\n`)
    touched.push('CLAUDE.md')
  }

  const skillDir = join(dir, '.claude/skills/sableye')
  mkdirSync(skillDir, { recursive: true })
  cpSync(join(pkgDir, 'skills/sableye/SKILL.md'), join(skillDir, 'SKILL.md'))
  touched.push('.claude/skills/sableye/SKILL.md')
  return touched
}

const SHAPE = {
  'next-app': 'Add a route handler that creates the invoice (price set on the server), one that verifies it, and a page that renders <Checkout> from sableye/react.',
  'next-pages': 'Add API routes under pages/api that create the invoice (price set on the server) and verify it, and a page that renders <Checkout> from sableye/react.',
  express: 'Add routes that create the invoice (price set on the server) and verify it. In the UI, render <Checkout> from sableye/react, or redirect to the invoice\'s checkoutUrl.',
  fastify: 'Add routes that create the invoice (price set on the server) and verify it. In the UI, render <Checkout> from sableye/react, or redirect to the invoice\'s checkoutUrl.',
  hono: 'Add routes that create the invoice (price set on the server) and verify it. In the UI, render <Checkout> from sableye/react, or redirect to the invoice\'s checkoutUrl.',
  'vite-react': 'This is a browser-only app, and invoices must be signed on a server. Add a small server or serverless functions to create and verify invoices, and render <Checkout> from sableye/react in the UI.',
  node: 'Add server code that creates the invoice (price set on the server) and verifies it, and a checkout UI: <Checkout> from sableye/react, or a redirect to the invoice\'s checkoutUrl.',
}

// Long-running servers also start the indexer (2 lines), so payments confirm even if the customer closes the tab.
const INDEXER = {
  next: '- If this app runs as a long-running server (next start on a VPS or Railway), start the Sableye indexer once at startup (AGENTS.md shows the 2 lines). On Vercel, skip it: the thank-you page\'s verifyPayment confirms the payment.',
  server: '- Start the Sableye indexer once when the server starts, on the same Sableye instance the routes use (AGENTS.md shows the 2 lines), so payments are confirmed even if the customer closes the tab.',
  browser: '- If the server you add is long-running (not serverless functions), start the Sableye indexer once at startup (AGENTS.md shows the 2 lines).',
}
const indexerLine = (f) => (f.startsWith('next') ? INDEXER.next : f === 'vite-react' ? INDEXER.browser : INDEXER.server)

/** The prompt the merchant pastes into their coding agent. Holds no secrets. */
export function agentPrompt({ framework, ts, sells, envFile = '.env' }) {
  const app = `${FRAMEWORK_NAMES[framework] ?? 'Node.js'}${ts ? ', TypeScript' : ''}`
  return [
    `Use the sableye skill (.claude/skills/sableye/SKILL.md) and the Sableye section of AGENTS.md to add USDT payments to this ${app} app.`,
    '',
    `What customers pay for: ${sells || 'work it out from the app. If it already has a payment step (even a simulated one), replace it with Sableye; otherwise pick the natural place (pricing, cart, invoices). Use the app\'s own prices, and tell me what you chose.'}`,
    '',
    `- Before writing payment code, read the matching guide in node_modules/sableye/docs/ (the APIs are newer than your training data).`,
    `- ${SHAPE[framework] ?? SHAPE.node}`,
    '- Fulfil an order only after the server\'s verifyPayment returns paid: true. After payment, send the customer to a thank-you page.',
    indexerLine(framework),
    '- Pass the customer\'s email (ask for it at checkout if the app doesn\'t have it) as customer: { email, name } to invoices.create, and use fileOrderStore for orders, so Sableye emails the invoice, the receipt and my "you got paid" notice.',
    `- ${envFile} is already configured. Don't print, copy or commit its values.`,
    '- When done, run `npx sableye doctor` and the build, then tell me how to make a test payment.',
  ].join('\n')
}

/** Best-effort copy to the system clipboard. Returns true if it worked. */
export function copyToClipboard(text) {
  const tries = process.platform === 'darwin' ? [['pbcopy']]
    : process.platform === 'win32' ? [['clip']]
    : [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '--clipboard', '--input'], ['clip.exe']]
  for (const [cmd, ...args] of tries) {
    const r = spawnSync(cmd, args, { input: text, stdio: ['pipe', 'ignore', 'ignore'], timeout: 3000 })
    if (r.status === 0) return true
  }
  return false
}

/** Make sure .gitignore keeps the env file and its backup out of git. Returns the lines it added. */
export function ensureGitignore(dir, files) {
  const path = join(dir, '.gitignore')
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const covered = (f) => lines.includes(f) || lines.includes(`/${f}`) || (f.startsWith('.env') && (lines.includes('.env*') || lines.includes('*.env')))
  const add = files.filter((f) => !covered(f))
  if (add.length) writeFileSync(path, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}# Sableye: secrets\n${add.join('\n')}\n`)
  return add
}
