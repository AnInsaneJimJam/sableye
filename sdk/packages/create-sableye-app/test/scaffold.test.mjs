import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const bin = fileURLToPath(new URL('../bin.mjs', import.meta.url))
const run = (cwd, ...args) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
const tmp = () => mkdtempSync(join(tmpdir(), 'scaffold-'))

test('scaffolds a store with a route, <Checkout/> and .env.example', () => {
  const cwd = tmp()
  const r = run(cwd, '--name', 'my-store', '--framework', 'next')
  assert.equal(r.status, 0, r.stderr)
  const dir = join(cwd, 'my-store')
  for (const f of ['app/api/invoice/route.ts', 'app/api/verify/route.ts', 'app/page.tsx', 'app/pay/page.tsx', 'lib/sableye.ts', '.env.example', '.gitignore']) {
    assert.ok(existsSync(join(dir, f)), f)
  }
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name, 'my-store')
  assert.match(readFileSync(join(dir, 'app/page.tsx'), 'utf8'), /<Checkout/)
  assert.ok(!existsSync(join(dir, '.env')), 'must never write a .env')
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^\.env$/m)
})

test('the merchant key is never exposed to client code', () => {
  const cwd = tmp()
  run(cwd, '--name', 's')
  const read = (f) => readFileSync(join(cwd, 's', f), 'utf8')
  for (const f of ['app/page.tsx', 'app/pay/page.tsx']) {
    assert.doesNotMatch(read(f), /MERCHANT_KEY|lib\/sableye|sableye\/server/, f)
  }
  assert.doesNotMatch(read('.env.example'), /NEXT_PUBLIC_MERCHANT/)
})

test('bad input fails with a remedy and a non-zero exit', () => {
  const cwd = tmp()
  for (const args of [[], ['--name', 'Bad Name'], ['--name', 'ok', '--framework', 'vue'], ['--nope']]) {
    const r = run(cwd, ...args)
    assert.equal(r.status, 1, args.join(' '))
    assert.match(r.stderr, /Remedy:/)
  }
})

test('refuses to overwrite a non-empty directory', () => {
  const cwd = tmp()
  mkdirSync(join(cwd, 'taken'))
  writeFileSync(join(cwd, 'taken', 'keep.txt'), 'x')
  const r = run(cwd, '--name', 'taken')
  assert.equal(r.status, 1)
  assert.equal(readFileSync(join(cwd, 'taken', 'keep.txt'), 'utf8'), 'x')
  assert.ok(!existsSync(join(cwd, 'taken', 'package.json')))
})

test('--local-sdk packs this repo\'s `sableye` package and points package.json at it', () => {
  const cwd = tmp()
  const r = run(cwd, '--name', 'local-store', '--local-sdk')
  assert.equal(r.status, 0, r.stderr)
  const dir = join(cwd, 'local-store')
  const m = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  assert.match(m.dependencies.sableye, /^file:\.\/\.sableye-sdk\/sableye-.+\.tgz$/)
  assert.ok(existsSync(join(dir, m.dependencies.sableye.slice('file:'.length))))
  assert.ok(!Object.keys(m.dependencies).some((d) => d.startsWith('@sableye/')))
  assert.match(r.stdout, /npx sableye doctor/)
})
