// The .env editing behind `npx sableye init`: keeps comments and other lines, replaces existing keys, quotes safely.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseEnv, setEnv } from '../bin/init.mjs'

test('setEnv replaces existing keys, appends new ones, keeps everything else', () => {
  const before = '# Signs invoices\nMERCHANT_KEY=0x...\n\n# Optional\nSABLEYE_RPC_URL=\n'
  const after = setEnv(before, { MERCHANT_KEY: '0xabc', SMTP_USER: 'shop@gmail.com', SABLEYE_BUSINESS_NAME: 'Acme Coffee #1' })
  assert.match(after, /^# Signs invoices\nMERCHANT_KEY=0xabc\n\n# Optional\nSABLEYE_RPC_URL=\n/)
  assert.match(after, /SMTP_USER=shop@gmail.com\n/)
  assert.match(after, /SABLEYE_BUSINESS_NAME="Acme Coffee #1"\n/)
  assert.deepEqual(parseEnv(after), { MERCHANT_KEY: '0xabc', SABLEYE_RPC_URL: '', SMTP_USER: 'shop@gmail.com', SABLEYE_BUSINESS_NAME: 'Acme Coffee #1' })
})

test('setEnv on an empty file, and a value with $ is written literally', () => {
  const out = setEnv('', { SMTP_PASS: 'ab$1cd' })
  assert.equal(out, 'SMTP_PASS=ab$1cd\n')
  assert.equal(setEnv(out, { SMTP_PASS: 'x$&y' }), 'SMTP_PASS=x$&y\n')
})

test('setEnv keeps an `export ` prefix instead of adding a duplicate line; parseEnv reads it', () => {
  const out = setEnv('export MERCHANT_KEY=0x1\nAPP=1\n', { MERCHANT_KEY: '0x2' })
  assert.equal(out, 'export MERCHANT_KEY=0x2\nAPP=1\n')
  assert.deepEqual(parseEnv(out), { MERCHANT_KEY: '0x2', APP: '1' })
})

test('email settings come only from SABLEYE_SMTP_*: the app\'s own SMTP_* is never used', async () => {
  const { emailConfigFromEnv } = await import('../dist/index.js')
  assert.equal(emailConfigFromEnv({ SABLEYE_SMTP_USER: 'pay@shop.com', SABLEYE_SMTP_PASS: 'p', SMTP_USER: 'app@shop.com', SMTP_PASS: 'q', SMTP_HOST: 'app-host' }).user, 'pay@shop.com')
  assert.equal(emailConfigFromEnv({ SABLEYE_SMTP_USER: 'pay@shop.com', SABLEYE_SMTP_PASS: 'p', SMTP_HOST: 'app-host' }).host, undefined, 'never mixes in the app\'s SMTP_HOST')
  assert.equal(emailConfigFromEnv({ SMTP_USER: 'app@shop.com', SMTP_PASS: 'p' }), undefined)
  assert.equal(emailConfigFromEnv({}), undefined)
})

test('agent files: the AGENTS.md block is inserted once, updated in place, and the rest of the file is kept', async () => {
  const { upsertBlock, BEGIN, END } = await import('../bin/agents.mjs')
  const block = (v) => `${BEGIN} v${v} -->\nSableye docs ${v}\n${END}\n`
  const mine = '# My app\n\nRun `npm test`.\n'
  const once = upsertBlock(mine, block(1))
  assert.ok(once.startsWith(mine))
  assert.equal(upsertBlock(once, block(1)), once)
  const twice = upsertBlock(once, block(2))
  assert.match(twice, /Sableye docs 2/)
  assert.doesNotMatch(twice, /Sableye docs 1/)
  assert.equal(twice.split(BEGIN).length, 2)
})

test('agent setup in a repo: detects the app, writes AGENTS.md / CLAUDE.md / skill from the settings, ignores env files', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { detectProject, installAgentFiles, ensureGitignore, installCommand } = await import('../bin/agents.mjs')
  const { readConfig } = await import('../bin/config.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'sableye-agents-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16', react: '19' } }))
  writeFileSync(join(dir, 'tsconfig.json'), '{}')
  writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
  mkdirSync(join(dir, 'app'))
  writeFileSync(join(dir, 'CLAUDE.md'), 'Use tabs.\n')
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n.env*.local\n')
  const p = detectProject(dir)
  assert.equal(p.framework, 'next-app')
  assert.deepEqual(installCommand(p), ['pnpm', 'add', 'sableye', 'viem'])

  const pkgDir = mkdtempSync(join(tmpdir(), 'sableye-pkg-'))
  mkdirSync(join(pkgDir, 'docs'))
  mkdirSync(join(pkgDir, 'skills/sableye'), { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), '{"version":"9.9.9"}')
  writeFileSync(join(pkgDir, 'docs/AGENTS.index.md'), 'Docs index: |Get Started:{quickstart}')
  writeFileSync(join(pkgDir, 'skills/sableye/SKILL.md'), '---\nname: sableye\n---\n')
  installAgentFiles({ dir, pkgDir, config: readConfig(dir) })
  installAgentFiles({ dir, pkgDir, config: readConfig(dir) }) // idempotent
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8')
  assert.equal(agents.split('BEGIN sableye').length, 2)
  assert.match(agents, /sableye@9\.9\.9/)
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'Use tabs.\n\n@AGENTS.md\n')
  assert.ok(existsSync(join(dir, '.claude/skills/sableye/SKILL.md')))
  assert.deepEqual(ensureGitignore(dir, ['.env', '.env.bak']), ['.env', '.env.bak'])
  assert.deepEqual(ensureGitignore(dir, ['.env', '.env.bak']), [])
  writeFileSync(join(dir, 'x.html'), '')
  const stat = mkdtempSync(join(tmpdir(), 'sableye-static-'))
  writeFileSync(join(stat, 'package.json'), '{}')
  mkdirSync(join(stat, 'dist'))
  writeFileSync(join(stat, 'dist/index.html'), '<!doctype html>')
  assert.equal(detectProject(stat).framework, 'static')
})

test('instructions follow the merchant\'s choices: only enabled features, always "integrate, don\'t redesign", never secrets', async () => {
  const { agentsBlock, agentPrompt, DEFAULTS, setupLines } = await import('../bin/config.mjs')
  const base = { ...DEFAULTS, features: { ...DEFAULTS.features, gasless: false } }
  const plain = agentsBlock(base, { version: '0.3.0', index: 'idx' })
  assert.match(plain, /Integrate, don't redesign/)
  assert.doesNotMatch(plain, /relayHandler|refunds\.create|coupons|webhook|Resend/i)
  assert.match(plain, /indexer\(\{ store: fileStore/, 'long-running by default')

  const rich = { ...base, emails: 'resend', hosting: 'serverless', checkoutTheme: 'night', webhooks: { path: '/hooks/pay' },
    features: { ...base.features, gasless: true, refunds: true, walletConnect: true } }
  const lines = setupLines(rich).join('\n')
  for (const re of [/relayHandler/, /refunds\.create/, /walletConnectProjectId/, /Resend/, /\/hooks\/pay/, /theme: 'night'/, /serverless/]) assert.match(lines, re)
  assert.doesNotMatch(lines, /fileStore\('\.sableye\/state\.json'\)\)\.start/, 'no long-running indexer on serverless')
  assert.match(lines, /Don't add an email field/)

  const prompt = agentPrompt(rich, { framework: 'static', ts: false, sells: '' })
  assert.match(prompt, /Integrate into what exists: don't add new products, pages, buttons or form fields/)
  assert.match(prompt, /has no server yet: add the smallest one/)
  assert.match(prompt, /use its existing payment step and prices/i)
  assert.match(prompt, /relayHandler/)
  for (const text of [plain, lines, prompt]) assert.doesNotMatch(text, /0x[0-9a-f]{64}|re_[A-Za-z0-9]{8}|whsec_[0-9a-f]{8}/)
})

test('settings live in package.json "sableye" without disturbing the rest of the file', async () => {
  const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { readConfig, writeConfig } = await import('../bin/config.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'sableye-cfg-'))
  writeFileSync(join(dir, 'package.json'), '{\n    "name": "shop",\n    "scripts": { "dev": "x" }\n}\n')
  const c = readConfig(dir)
  assert.equal(c.saved, false)
  c.features.refunds = true
  c.emails = 'smtp'
  writeConfig(dir, c)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'shop')
  assert.deepEqual(pkg.scripts, { dev: 'x' })
  assert.equal(pkg.sableye.emails, 'smtp')
  assert.equal(pkg.sableye.saved, undefined)
  assert.match(readFileSync(join(dir, 'package.json'), 'utf8'), /^\{\n {4}"name"/, 'keeps 4-space indent')
  const again = readConfig(dir)
  assert.equal(again.saved, true)
  assert.equal(again.features.refunds, true)
  assert.equal(again.features.gasless, true, 'defaults fill keys not saved')
})
