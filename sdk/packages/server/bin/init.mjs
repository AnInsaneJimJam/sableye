// `npx sableye init`: first-time setup in the merchant's repo. Detects the app, installs the package, asks for the
// merchant key, business name, email (SMTP) and Arkiv access key, checks each one, merges them into .env (backup,
// nothing replaced without asking), then sets up the merchant's coding agent and prints the prompt to give it.
// `--email` re-runs only the email step. Nothing is sent anywhere except the test email to your own address.
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { detectProject, ensureGitignore, FRAMEWORK_NAMES, installAgentFiles, installCommand } from './agents.mjs'
import { agentPrompt, DEFAULTS, detectHosting, FEATURES, HOSTING, readConfig, writeConfig } from './config.mjs'

/** Set KEY=value lines in .env text: replaces an existing line (keeping an `export ` prefix), else appends. Other lines and comments are kept. */
export function setEnv(text, entries) {
  let out = text
  for (const [key, raw] of Object.entries(entries)) {
    const value = /[\s#"'=]/.test(raw) ? JSON.stringify(raw) : raw
    const line = `${key}=${value}`
    const re = new RegExp(`^(export\\s+)?${key}=.*$`, 'm')
    out = re.test(out) ? out.replace(re, (_m, exp) => `${exp ?? ''}${line}`) : `${out}${out && !out.endsWith('\n') ? '\n' : ''}${line}\n`
  }
  return out
}

/** Parse .env text (KEY=value, optional `export ` and quotes; comments ignored). */
export function parseEnv(text) {
  const env = {}
  for (const m of text.matchAll(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/gm)) {
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
    /** One of `options` ([value, label][]): by number or value. */
    async choose(q, options, def) {
      options.forEach(([v, label], i) => console.log(`    ${i + 1}) ${label}${v === def ? paint('2', '  ← current') : ''}`))
      for (;;) {
        const a = await ask(`  ${q}`, String(options.findIndex(([v]) => v === def) + 1 || 1))
        const hit = options[Number(a) - 1] ?? options.find(([v]) => v === a)
        if (hit) return hit[0]
      }
    },
    /** Toggle items by number; Enter when done. `selected`: { key: boolean }. */
    async checklist(q, items, selected) {
      const sel = { ...selected }
      for (;;) {
        items.forEach(([k, label, hint], i) => console.log(`    ${sel[k] ? paint('32', '[x]') : '[ ]'} ${i + 1}) ${label}${hint ? paint('2', ` · ${hint}`) : ''}`))
        const a = await ask(`  ${q} (numbers to toggle, Enter when done):`)
        if (!a) return sel
        for (const n of a.split(/[\s,]+/)) if (items[Number(n) - 1]) sel[items[Number(n) - 1][0]] = !sel[items[Number(n) - 1][0]]
      }
    },
    close: () => rl.close(),
  }
}

/** Answers every question with its default: for `init --yes` (CI, scripts, agents). */
function autoPrompter() {
  return {
    ask: async (_q, def) => def ?? '', yes: async (_q, def = true) => def, secret: async () => '',
    choose: async (_q, _o, def) => def, checklist: async (_q, _i, sel) => sel, close: () => {},
  }
}

const color = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s)
const section = (title) => console.log(`\n${paint('1;38;5;141', '◆')} ${paint('1', title)}`)
const ok = (s) => console.log(`  ${paint('32', '✓')} ${s}`)
const note = (s) => console.log(`  ${paint('2', s)}`)

async function smtpSetup(p, env, businessName, sdk) {
  for (;;) {
    const user = await p.ask('  Email address:', env.SABLEYE_SMTP_USER)
    if (!user) return {}
    let server = sdk.smtpServerFor(user)
    if (server) note(`Detected ${server.host}:${server.port}.`)
    else {
      const host = await p.ask('  SMTP server (e.g. smtp.yourprovider.com):', env.SABLEYE_SMTP_HOST)
      const port = Number(await p.ask('  SMTP port:', env.SABLEYE_SMTP_PORT || '465'))
      server = { host, port }
    }
    if (/@(gmail|googlemail)\.com$/i.test(user)) note('Gmail needs an app password (2-Step Verification on, then https://myaccount.google.com/apppasswords).')
    const pass = (await p.secret('  Password / app password:')).replace(/\s+/g, '') || env.SABLEYE_SMTP_PASS
    if (!pass) return {}
    const cfg = { user, pass, host: server.host, port: server.port, from: `"${businessName.replace(/"/g, '')}" <${user}>` }
    try {
      process.stdout.write('  Logging in and sending a test email to yourself… ')
      const t = sdk.smtpTransport(cfg)
      await t.verify()
      await t.sendMail({ from: cfg.from, to: user, subject: 'Sableye email is set up', text: `Invoices and receipts for ${businessName} will be sent from this address.` })
      console.log(`done. Check ${user}.`)
      return { SABLEYE_SMTP_USER: user, SABLEYE_SMTP_PASS: pass, ...(sdk.smtpServerFor(user) ? {} : { SABLEYE_SMTP_HOST: server.host, SABLEYE_SMTP_PORT: String(server.port) }) }
    } catch (e) {
      console.log(`failed:\n    ${e.message}`)
      if (!(await p.yes('  Try again?'))) return {}
    }
  }
}

async function resendSetup(p, env, businessName, sdk) {
  note('Resend sends over HTTPS, so it works on every host, and mail from your own domain avoids spam folders.')
  note('1) https://resend.com/domains → add your domain → add its 3-4 DNS records → Verify.')
  note('2) https://resend.com/api-keys → Create API Key (Sending access).')
  const key = (await p.secret('  Resend API key (re_…, Enter to keep/skip):')) || env.SABLEYE_RESEND_API_KEY
  if (!key) return {}
  const addr = await p.ask('  Send from (an address on your verified domain, e.g. receipts@yourshop.com):', /<([^>]+)>/.exec(env.SABLEYE_EMAIL_FROM ?? '')?.[1] ?? env.SABLEYE_EMAIL_FROM)
  if (!addr) return {}
  const notify = await p.ask('  Where should "you got paid" notices go? (your inbox)', env.MERCHANT_EMAIL)
  const from = `"${businessName.replace(/"/g, '')}" <${addr}>`
  try {
    process.stdout.write(`  Sending a test email${notify ? ` to ${notify}` : ''}… `)
    const t = sdk.resendTransport(key)
    if (notify) await t.sendMail({ from, to: notify, subject: 'Sableye email is set up', text: `Invoices and receipts for ${businessName} will be sent from ${addr}.` })
    else await t.verify()
    console.log(notify ? `done. Check ${notify}.` : 'key works.')
  } catch (e) {
    console.log(`failed:\n    ${e.message}`)
    note('Saved anyway: fix the domain or key in Resend, then run `npx sableye doctor`.')
  }
  return { SABLEYE_RESEND_API_KEY: key, SABLEYE_EMAIL_FROM: from, ...(notify ? { MERCHANT_EMAIL: notify } : {}) }
}

/** Email provider + credentials. Returns [provider, env updates]. */
async function emailStep(p, env, config, businessName, sdk) {
  section('Emails')
  note('Invoices and receipts (with PDFs) to your customers, and a "you got paid" notice to you.')
  const provider = await p.choose('Send emails with:', [
    ['resend', `Resend ${paint('2', '(recommended: works on every host, best inbox delivery, free 3,000/month)')}`],
    ['smtp', `SMTP ${paint('2', '(your Gmail/Outlook/… account; blocked on some hosts such as Railway Hobby)')}`],
    ['none', 'No emails'],
  ], config.emails === 'none' && !config.saved ? 'resend' : config.emails)
  if (provider === 'none') return ['none', {}]
  const updates = provider === 'resend' ? await resendSetup(p, env, businessName, sdk) : await smtpSetup(p, env, businessName, sdk)
  if (!Object.keys(updates).length) {
    note('Skipped: no emails for now. Re-run `npx sableye init --email` any time.')
    return ['none', {}]
  }
  return [provider, updates]
}

/** Which env file to write: `.env`, unless only `.env.local` exists (or the merchant picks it). */
async function chooseEnvFile(p) {
  const env = existsSync('.env')
  const local = existsSync('.env.local')
  if (local && !env) return '.env.local'
  if (local && env) return p.choose('Save Sableye settings to:', [['.env', '.env'], ['.env.local', '.env.local']], '.env')
  return '.env'
}

/** Set up the merchant's coding agent and return the prompt to give it. `pkgDir` is the sableye package. */
export async function agentStep(p, { project, pkgDir, envFile, config, dryRun = false }) {
  section('AI coding agent')
  note('Your agent (Claude Code, Cursor, Codex, Copilot…) gets this app\'s Sableye setup in AGENTS.md, pointing at')
  note('the docs bundled with the package, plus a skill, and a prompt that integrates into your existing payment flow.')
  if (!existsSync(join(pkgDir, 'docs/AGENTS.index.md'))) {
    note('Agent setup ships with the published `sableye` package; skipped here.')
  } else if (await p.yes('  Set up your coding agent?')) {
    if (dryRun) note('(dry run) would update AGENTS.md, CLAUDE.md and .claude/skills/sableye/SKILL.md')
    else for (const f of installAgentFiles({ dir: '.', pkgDir, config })) ok(f)
    if (!project.installed) note('The docs it points to appear in node_modules/sableye/docs once `sableye` is installed.')
  }
  note('Describe what customers pay for, e.g. "Pro plan, 9.99 USDT, the Buy button on /pricing".')
  note('Or press Enter and the agent uses your app\'s existing payment step and prices.')
  let sells = await p.ask('  What do customers pay for?')
  if (/^(let the agent|the agent|work it out|enter|skip|-)/i.test(sells)) sells = '' // the hint, typed back
  return agentPrompt(config, { framework: project.framework, ts: project.ts, sells, envFile })
}

/**
 * The setup wizard. Returns `{ code, prompt? }`; the caller runs `doctor` and then prints the prompt.
 * `flags`: `{ yes, dryRun, features?: string[], emails?, hosting?, theme? }` (non-interactive overrides).
 */
export async function runInit({ emailOnly = false, sdk, pkgDir, flags = {} }) {
  const auto = !!flags.yes
  if (!process.stdin.isTTY && !auto) {
    console.log('`sableye init` is interactive. Without a terminal, run: npx sableye init --yes [--features gasless,refunds] [--emails resend|smtp|none] [--hosting server|serverless]')
    return { code: 1 }
  }
  let project = detectProject('.')
  const config = readConfig('.')
  if (flags.features) for (const k of Object.keys(config.features)) config.features[k] = flags.features.includes(k)
  if (flags.emails) config.emails = flags.emails
  if (flags.hosting) config.hosting = flags.hosting
  if (flags.theme) config.checkoutTheme = flags.theme
  const p = auto ? autoPrompter() : prompter()
  const updates = {}
  try {
    // 1. The app
    if (!emailOnly) {
      section('Your app')
      if (!project.hasPackageJson) {
        note('No package.json here. Run this in your app\'s folder, or start a new store with `npx sableye create --name my-store`.')
        if (!(await p.yes('  Create a package.json here?', false))) return { code: 1 }
        if (!flags.dryRun) writeFileSync('package.json', `${JSON.stringify({ name: basename(resolve('.')).toLowerCase().replace(/[^a-z0-9._-]/g, '-'), version: '1.0.0', private: true, type: 'module' }, null, 2)}\n`)
        project = detectProject('.')
      }
      ok(`${FRAMEWORK_NAMES[project.framework]}${project.ts ? ', TypeScript' : ''} · ${project.pm}${config.saved ? ' · existing Sableye settings loaded (Enter keeps them)' : ''}`)
      const cmd = installCommand(project)
      if (!cmd) ok('sableye is installed')
      else if (flags.dryRun) note(`(dry run) would run: ${cmd.join(' ')}`)
      else if (await p.yes(`  Install ${cmd.slice(2).join(' and ')} with ${cmd[0]}?`)) {
        const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' })
        if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K') // clear the package manager's spinner
        if (r.status === 0) ok(`installed ${cmd.slice(2).join(', ')}`)
        else note(`Install failed. Run it yourself: ${cmd.join(' ')}`)
        project = detectProject('.')
      } else note(`Skipped. Run it yourself: ${cmd.join(' ')}`)
      ok('Network: Whitechain Sepolia (testnet). Mainnet comes once official USDT launches there.')
    }

    const file = await chooseEnvFile(p)
    const text = existsSync(file) ? readFileSync(file, 'utf8') : existsSync('.env.example') ? readFileSync('.env.example', 'utf8') : ''
    const env = parseEnv(text)
    if (existsSync(file)) note(`Using your existing ${file}: only Sableye's settings are added. Press Enter to keep a value in [brackets].`)

    // 2. Key, payout, business
    let businessName = env.SABLEYE_BUSINESS_NAME || 'My Store'
    if (!emailOnly) {
      section('Merchant key')
      note('Signs your invoices. Keep it secret; it never leaves your server.')
      let key = /^0x[0-9a-fA-F]{64}$/.test(env.MERCHANT_KEY ?? '') ? env.MERCHANT_KEY : undefined
      if (key) ok(`Using the key already in ${file}: ${privateKeyToAccount(key).address}`)
      else {
        const pasted = await p.secret('  Paste your private key, or press Enter to generate a new one:')
        key = pasted || generatePrivateKey()
        if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('That is not a 32-byte hex private key (0x + 64 hex characters).')
        updates.MERCHANT_KEY = key
        ok(`Merchant address: ${privateKeyToAccount(key).address}${pasted ? '' : ' (new key)'}`)
        note('Fund it with test WBT (https://faucet.testnet.whitechain.io): refunds, cancels and gasless payments need gas.')
      }
      const payout = await p.ask('  Send payments to a different wallet? (0x… address, Enter = the merchant address)', env.SABLEYE_PAYOUT)
      if (payout && !/^0x[0-9a-fA-F]{40}$/.test(payout)) note(`"${payout}" is not an address; payments go to the merchant address.`)
      else if (payout) updates.SABLEYE_PAYOUT = payout

      section('Business')
      businessName = await p.ask('  Business name (on invoices, receipts and emails):', businessName)
      updates.SABLEYE_BUSINESS_NAME = businessName
      const support = await p.ask('  Support email for customers (Reply-To on emails; Enter to skip):', env.SABLEYE_SUPPORT_EMAIL)
      if (support) updates.SABLEYE_SUPPORT_EMAIL = support
      const address = await p.ask('  Business address (footer of invoices and emails; Enter to skip):', env.SABLEYE_BUSINESS_ADDRESS)
      if (address) updates.SABLEYE_BUSINESS_ADDRESS = address

      // 3. Features
      section('Payment features')
      config.features = await p.checklist('Features', Object.entries(FEATURES).map(([k, f]) => [k, f.name, f.hint]), config.features)
      if (config.features.walletConnect) {
        const id = await p.ask('  Reown project ID (free at https://cloud.reown.com; Enter to add later):', env.NEXT_PUBLIC_REOWN_PROJECT_ID)
        if (id) updates.NEXT_PUBLIC_REOWN_PROJECT_ID = id
      }
    }

    // 4. Emails
    const [provider, mail] = await emailStep(p, env, config, businessName, sdk)
    config.emails = provider
    Object.assign(updates, mail)

    if (!emailOnly) {
      // 5. Webhooks
      section('Webhooks (optional)')
      note('For apps that react to payments in their own code (signed POSTs on paid, refunded, …).')
      if (await p.yes('  Use webhooks?', !!config.webhooks)) {
        config.webhooks = { path: await p.ask('  Webhook route in your app:', config.webhooks?.path ?? '/api/sableye/webhook') }
        if (!env.SABLEYE_WEBHOOK_SECRET) updates.SABLEYE_WEBHOOK_SECRET = `whsec_${randomBytes(24).toString('hex')}`
      } else config.webhooks = false

      // 6. Hosting → how payments get confirmed
      section('Where your app runs')
      const detected = detectHosting('.', existsSync)
      config.hosting = await p.choose('Your app runs on:', Object.entries(HOSTING), flags.hosting ?? (config.saved ? config.hosting : detected ?? config.hosting))
      note(config.hosting === 'server' ? 'Payments are confirmed by a background indexer (2 lines), even if the customer closes the tab.' : 'Payments are confirmed when the customer returns (verifyPayment); a cron route can catch closed tabs.')

      // 7. Checkout look
      section('Checkout look')
      config.checkoutTheme = await p.choose('The payment widget:', [
        ['light', 'Light (default)'], ['night', 'Night (for dark sites)'], ['none', 'Unstyled (your own CSS)'],
      ], config.checkoutTheme)

      // 8. Arkiv
      section('Arkiv records (optional)')
      note('Publishes your paid invoices to Arkiv, owned by your merchant wallet, so your books outlive any server.')
      note('Needs a free access key (https://hub.arkiv.network/access-keys) and test tGLM (https://hub.arkiv.network/faucet).')
      const access = await p.ask('  Arkiv access key (Enter to skip):', env.ARKIV_ACCESS_KEY)
      if (access) updates.ARKIV_ACCESS_KEY = access
      config.arkiv = !!access
    }

    // 9. Review, then write
    const changed = Object.entries(updates).filter(([k, v]) => env[k] !== v)
    const overwrite = changed.filter(([k]) => env[k] && env[k] !== '0x...')
    section('Review')
    if (!emailOnly) {
      const on = Object.entries(config.features).filter(([, v]) => v).map(([k]) => FEATURES[k].name)
      note(`Features: ${on.join(', ') || 'basic checkout only'} · Emails: ${config.emails} · Webhooks: ${config.webhooks ? config.webhooks.path : 'off'}`)
      note(`Runs on: ${config.hosting === 'server' ? 'long-running server (indexer)' : 'serverless (verify on return)'} · Checkout: ${config.checkoutTheme}${config.arkiv ? ' · Arkiv: on' : ''}`)
    }
    note(`${file}: ${changed.length ? changed.map(([k]) => k).join(', ') : 'no changes'}${!emailOnly ? ' · package.json: "sableye" settings' : ''}`)
    if (overwrite.length && !(await p.yes(`  Replace your existing ${overwrite.map(([k]) => k).join(', ')} in ${file}?`, false))) {
      for (const [k] of overwrite) delete updates[k]
    }
    if (flags.dryRun) {
      note('(dry run) nothing written.')
    } else if (!(await p.yes('  Save?'))) {
      note('Nothing saved.')
      return { code: 1 }
    } else {
      const write = Object.fromEntries(Object.entries(updates).filter(([k, v]) => env[k] !== v))
      const next = setEnv(text, write)
      if (next !== text) {
        if (existsSync(file)) {
          copyFileSync(file, `${file}.bak`)
          chmodSync(`${file}.bak`, 0o600)
        }
        writeFileSync(file, next, { mode: 0o600 })
        chmodSync(file, 0o600)
        ok(`${file} saved${existsSync(`${file}.bak`) ? ` (previous version in ${file}.bak)` : ''}`)
        if (project.git || existsSync('.gitignore')) {
          const ignored = ensureGitignore('.', [file, `${file}.bak`])
          if (ignored.length) ok(`.gitignore: added ${ignored.join(', ')}`)
        } else note(`Keep ${file} out of version control: it holds your key and passwords.`)
      }
      if (project.hasPackageJson) {
        writeConfig('.', config)
        ok('package.json: "sableye" settings saved')
      }
    }

    if (emailOnly) return { code: 0 }
    const prompt = await agentStep(p, { project, pkgDir, envFile: file, config, dryRun: flags.dryRun })
    return { code: 0, prompt }
  } finally {
    p.close()
  }
}
