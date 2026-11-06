// The Books page must read Arkiv with no Sableye code: that's the point of merchant-owned records.
// Run: pnpm check:books
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('the Books demo imports nothing from @sableye/* and fetches no sandbox data API', () => {
  const src = readFileSync(new URL('../src/components/sandbox/demo-books.tsx', import.meta.url), 'utf8')
  const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
  assert.ok(imports.length > 0)
  for (const i of imports) assert.ok(!i.startsWith('@sableye/'), `imports ${i}`)
  assert.ok(imports.includes('@arkiv-network/sdk'))
  // The only sandbox call allowed is the address lookup convenience button.
  const calls = [...src.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)].map((m) => m[1])
  assert.deepEqual(calls, ['/api/sandbox/merchant'])
})
