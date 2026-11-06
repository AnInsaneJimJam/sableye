// `npx sableye init`: first-time setup. Asks for the merchant key, business name, email (SMTP) and Arkiv access key,
// checks each one, and writes .env. `--email` re-runs only the email step. Nothing is sent anywhere except the test
// email to your own address.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

/** Set KEY=value lines in .env text: replaces an existing line, else appends. Other lines and comments are kept. */
export function setEnv(text, entries) {
  let out = text
  for (const [key, raw] of Object.entries(entries)) {
    const value = /[\s#"'=]/.test(raw) ? JSON.stringify(raw) : raw
    const line = `${key}=${value}`
    const re = new RegExp(`^${key}=.*$`, 'm')
    out = re.test(out) ? out.replace(re, () => line) : `${out}${out && !out.endsWith('\n') ? '\n' : ''}${line}\n`
  }
  return out
}

/** Parse .env text (KEY=value, optional quotes; comments ignored). */
export function parseEnv(text) {
  const env = {}
  for (const m of text.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) {
    const v = m[2].trim()
    env[m[1]] = /^".*"$/.test(v) ? JSON.parse(v) : v.replace(/^'(.*)'$/, '$1')
  }
  return env
}

function prompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  let muted = false
  const write = rl._writeToOutput.bind(rl)
  rl._writeToOutput = (s) => (muted ? write(s.includes('\n') ? '\n' : '') : write(s))
  const ask = (q, def) => new Promise((res) => rl.question(def ? `${q} [${def}] ` : `${q} `, (a) => res(a.trim() || def || '')))
  return {
    ask,
    yes: async (q, def = true) => /^y/i.test(await ask(`${q} (${def ? 'Y/n' : 'y/N'})`, def ? 'y' : 'n')),
    secret: (q) =>
      new Promise((res) => {
        rl.question(`${q} `, (a) => {
          muted = false
          res(a.trim())
        })
        muted = true
      }),
    close: () => rl.close(),
  }
}

async function emailStep(p, env, businessName, sdk) {
  console.log('\n— Email —\nSableye can email invoices and receipts (with PDFs) to your customers, and tell you when you get paid.')
  console.log('It sends from your own email account over SMTP. Your password stays in your .env file.')
  if (!(await p.yes('Set up email now?'))) {
    console.log('Skipped. Add SMTP_USER and SMTP_PASS to .env later, or run `npx sableye init --email`.')
    return {}
  }
  for (;;) {
    const user = await p.ask('Your email address:', env.SMTP_USER)
    let server = sdk.smtpServerFor(user)
    if (server) console.log(`Detected ${server.host}:${server.port}.`)
    else {
      const host = await p.ask('SMTP server (e.g. smtp.yourprovider.com):', env.SMTP_HOST)
      const port = Number(await p.ask('SMTP port:', env.SMTP_PORT || '465'))
      server = { host, port }
    }
    if (/@(gmail|googlemail)\.com$/i.test(user)) {
      console.log('Gmail needs an app password, not your normal one: turn on 2-Step Verification, then create one at')
      console.log('https://myaccount.google.com/apppasswords (16 letters; spaces are fine).')
    }
    const pass = (await p.secret('SMTP password / app password:')).replace(/\s+/g, '')
    const cfg = { user, pass, host: server.host, port: server.port, from: `"${businessName.replace(/"/g, '')}" <${user}>` }
    try {
      process.stdout.write('Logging in and sending a test email to yourself… ')
      const t = sdk.smtpTransport(cfg)
      await t.verify()
      await t.sendMail({ from: cfg.from, to: user, subject: 'Sableye email is set up', text: `Invoices and receipts for ${businessName} will be sent from this address.` })
      console.log(`done. Check ${user}.`)
      const known = sdk.smtpServerFor(user)
      return {
        SMTP_USER: user, SMTP_PASS: pass,
        ...(known ? {} : { SMTP_HOST: server.host, SMTP_PORT: String(server.port) }),
      }
    } catch (e) {
      console.log(`failed:\n  ${e.message}`)
      if (!(await p.yes('Try again?'))) {
        console.log('Skipped. Fix it later in .env or with `npx sableye init --email`.')
        return {}
      }
    }
  }
}

export async function runInit({ emailOnly = false, sdk, file = '.env' } = {}) {
  if (!process.stdin.isTTY) {
    console.log('`sableye init` is interactive. Without a terminal, copy .env.example to .env and fill it in.')
    return 1
  }
  const text = existsSync(file) ? readFileSync(file, 'utf8') : existsSync('.env.example') ? readFileSync('.env.example', 'utf8') : ''
  const env = parseEnv(text)
  const p = prompter()
  const updates = {}
  try {
    console.log('Sableye setup. Press Enter to keep the value in [brackets].')
    let businessName = env.SABLEYE_BUSINESS_NAME || 'My Store'
    if (!emailOnly) {
      console.log('\n— Merchant key —\nIt signs your invoices and receives payments. Keep it secret; it never leaves this server.')
      let key = /^0x[0-9a-fA-F]{64}$/.test(env.MERCHANT_KEY ?? '') ? env.MERCHANT_KEY : undefined
      if (key) console.log(`Using the key already in ${file}: ${privateKeyToAccount(key).address}`)
      else {
        const pasted = await p.secret('Paste your private key, or press Enter to generate a new one:')
        key = pasted || generatePrivateKey()
        if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('That is not a 32-byte hex private key (0x + 64 hex characters).')
        updates.MERCHANT_KEY = key
        console.log(`Merchant address: ${privateKeyToAccount(key).address}${pasted ? '' : ' (new key)'}`)
        if (!pasted) console.log('Fund it with test WBT from the Whitechain testnet faucet: refunds, cancels and gasless relaying need gas.')
      }
      businessName = await p.ask('\nBusiness name (shown on invoices, receipts and emails):', businessName)
      updates.SABLEYE_BUSINESS_NAME = businessName
    }

    Object.assign(updates, await emailStep(p, env, businessName, sdk))

    if (!emailOnly) {
      console.log('\n— Arkiv (optional) —\nPublishes your paid invoices to Arkiv, owned by your merchant wallet, so your books outlive any server.')
      console.log('Needs a free access key (https://hub.arkiv.network/access-keys) and test tGLM (https://hub.arkiv.network/faucet).')
      const access = await p.ask('Arkiv access key (Enter to skip):', env.ARKIV_ACCESS_KEY)
      if (access) updates.ARKIV_ACCESS_KEY = access
    }

    const changed = Object.entries(updates).filter(([k, v]) => env[k] !== v)
    const overwrite = changed.filter(([k]) => env[k] && env[k] !== '0x...')
    if (overwrite.length && !(await p.yes(`\nReplace ${overwrite.map(([k]) => k).join(', ')} in ${file}?`))) {
      for (const [k] of overwrite) delete updates[k]
    }
    const next = setEnv(text, Object.fromEntries(Object.entries(updates).filter(([k, v]) => env[k] !== v)))
    if (next !== text) {
      writeFileSync(file, next, { mode: 0o600 })
      console.log(`\nSaved ${file}. Keep it out of git (it holds your key and email password).`)
    } else console.log('\nNothing changed.')
    return 0
  } finally {
    p.close()
  }
}
