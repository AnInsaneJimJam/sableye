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

test('agent setup in a repo: detects the app, writes AGENTS.md / CLAUDE.md / skill, ignores env files, prompt has no secrets', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { detectProject, installAgentFiles, ensureGitignore, agentPrompt, installCommand } = await import('../bin/agents.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'sableye-agents-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16', react: '19' } }))
  writeFileSync(join(dir, 'tsconfig.json'), '{}')
  writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
  mkdirSync(join(dir, 'app'))
  writeFileSync(join(dir, 'CLAUDE.md'), 'Use tabs.\n')
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n.env*.local\n')
  const p = detectProject(dir)
  assert.equal(p.framework, 'next-app')
  assert.equal(p.ts, true)
  assert.deepEqual(installCommand(p), ['pnpm', 'add', 'sableye', 'viem'])

  const pkgDir = mkdtempSync(join(tmpdir(), 'sableye-pkg-'))
  mkdirSync(join(pkgDir, 'docs'))
  mkdirSync(join(pkgDir, 'skills/sableye'), { recursive: true })
  writeFileSync(join(pkgDir, 'docs/AGENTS.block.md'), '<!-- BEGIN sableye -->\nread node_modules/sableye/docs\n<!-- END sableye -->\n')
  writeFileSync(join(pkgDir, 'skills/sableye/SKILL.md'), '---\nname: sableye\n---\n')
  installAgentFiles({ dir, pkgDir })
  installAgentFiles({ dir, pkgDir }) // idempotent
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8').split('BEGIN sableye').length, 2)
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), 'Use tabs.\n\n@AGENTS.md\n')
  assert.ok(existsSync(join(dir, '.claude/skills/sableye/SKILL.md')))

  assert.deepEqual(ensureGitignore(dir, ['.env', '.env.bak']), ['.env', '.env.bak'])
  assert.deepEqual(ensureGitignore(dir, ['.env', '.env.bak']), [])

  const prompt = agentPrompt({ framework: p.framework, ts: p.ts, sells: 'Pro plan, 9.99 USDT' })
  assert.match(prompt, /sableye skill/)
  assert.match(prompt, /Next\.js \(App Router\), TypeScript/)
  assert.match(prompt, /node_modules\/sableye\/docs/)
  assert.match(prompt, /Pro plan, 9\.99 USDT/)
  assert.doesNotMatch(prompt, /0x[0-9a-f]{64}/i)
  const inferred = agentPrompt({ framework: 'node', ts: false })
  assert.match(inferred, /work it out from the app/)
  assert.doesNotMatch(inferred, /\[describe/)
})
