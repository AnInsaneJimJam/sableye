// The assembled package: every entry point loads, and the one CLI reaches all its commands.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const bin = new URL('../bin/sableye.mjs', import.meta.url).pathname
const cli = (args, cwd) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, MERCHANT_KEY: '' } })

test('every entry point loads, sharing one core (instanceof works across entries)', async () => {
  const core = await import('sableye')
  const server = await import('sableye/server')
  const react = await import('sableye/react')
  const mcp = await import('sableye/mcp')
  assert.equal(typeof core.encodeSignedInvoice, 'function')
  assert.equal(typeof server.Sableye, 'function')
  assert.equal(typeof react.Checkout, 'function')
  assert.equal(typeof mcp.createMcpServer, 'function')
  assert.equal(server.SableyeError, core.SableyeError)
})

test('sableye CLI: usage, and `create` scaffolds a store that depends on `sableye`', () => {
  assert.match(cli([], tmpdir()).stdout + cli([], tmpdir()).stderr, /sableye init/)
  const cwd = mkdtempSync(join(tmpdir(), 'sableye-pkg-'))
  const r = cli(['create', '--name', 'shop'], cwd)
  assert.equal(r.status, 0, r.stderr)
  const m = JSON.parse(readFileSync(join(cwd, 'shop/package.json'), 'utf8'))
  assert.ok(m.dependencies.sableye)
  assert.ok(existsSync(join(cwd, 'shop/.gitignore')))
})

test('the drop-in browser build ships and exposes SableyeCheckout.mount', async () => {
  const { readFileSync } = await import('node:fs')
  const js = readFileSync(new URL('../browser/checkout.js', import.meta.url), 'utf8')
  assert.match(js, /var SableyeCheckout=/)
  assert.match(js, /mount/)
  assert.ok(js.length < 1_000_000, 'stays under 1 MB')
})
