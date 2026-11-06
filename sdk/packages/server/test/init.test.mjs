// The .env editing behind `npx sableye init`: keeps comments and other lines, replaces existing keys, quotes safely.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseEnv, setEnv } from '../bin/init.mjs'

test('setEnv replaces existing keys, appends new ones, keeps everything else', () => {
  const before = '# Signs invoices\nMERCHANT_KEY=0x...\n\n# Optional\nSABLEYE_RPC_URL=\n'
  const after = setEnv(before, { MERCHANT_KEY: '0xabc', SMTP_USER: 'shop@gmail.com', SABLEYE_BUSINESS_NAME: 'Chai & Co #1' })
  assert.match(after, /^# Signs invoices\nMERCHANT_KEY=0xabc\n\n# Optional\nSABLEYE_RPC_URL=\n/)
  assert.match(after, /SMTP_USER=shop@gmail.com\n/)
  assert.match(after, /SABLEYE_BUSINESS_NAME="Chai & Co #1"\n/)
  assert.deepEqual(parseEnv(after), { MERCHANT_KEY: '0xabc', SABLEYE_RPC_URL: '', SMTP_USER: 'shop@gmail.com', SABLEYE_BUSINESS_NAME: 'Chai & Co #1' })
})

test('setEnv on an empty file, and a value with $ is written literally', () => {
  const out = setEnv('', { SMTP_PASS: 'ab$1cd' })
  assert.equal(out, 'SMTP_PASS=ab$1cd\n')
  assert.equal(setEnv(out, { SMTP_PASS: 'x$&y' }), 'SMTP_PASS=x$&y\n')
})
