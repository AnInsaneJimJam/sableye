// `npx sableye init`: first-time setup in the merchant's repo. Detects the app, installs the package, asks for the
// merchant key, business name, email (SMTP) and Arkiv access key, checks each one, merges them into .env (backup,
// nothing replaced without asking), then sets up the merchant's coding agent and prints the prompt to give it.
// `--email` re-runs only the email step. Nothing is sent anywhere except the test email to your own address.
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { agentPrompt, detectProject, ensureGitignore, FRAMEWORK_NAMES, installAgentFiles, installCommand } from './agents.mjs'

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
    close: () => rl.close(),
  }
}


const color = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s)
const section = (title) => console.log(`\n${paint('1;38;5;141', '◆')} ${paint('1', title)}`)
const ok = (s) => console.log(`  ${paint('32', '✓')} ${s}`)
const note = (s) => console.log(`  ${paint('2', s)}`)

async function emailStep(p, env, businessName, sdk) {
  section('Email (optional)')
  note('Emails invoices and receipts (with PDFs) to your customers, and tells you when you get paid.')
  note('Sent from your own email account over SMTP. The password stays in your env file.')
  if (!(await p.yes('  Set up email now?'))) {
    note('Skipped. Later: `npx sableye init --email`, or add SABLEYE_SMTP_USER and SABLEYE_SMTP_PASS yourself.')
    return {}
  }
  for (;;) {
    const user = await p.ask('  Email address:', env.SABLEYE_SMTP_USER)
    let server = sdk.smtpServerFor(user)
    if (server) note(`Detected ${server.host}:${server.port}.`)
    else {
      const host = await p.ask('  SMTP server (e.g. smtp.yourprovider.com):', env.SABLEYE_SMTP_HOST)
      const port = Number(await p.ask('  SMTP port:', env.SABLEYE_SMTP_PORT || '465'))
      server = { host, port }
    }
    if (/@(gmail|googlemail)\.com$/i.test(user)) {
      note('Gmail needs an app password, not your normal one: turn on 2-Step Verification, then create one at')
      note('https://myaccount.google.com/apppasswords (16 letters; spaces are fine).')
    }
    const pass = (await p.secret('  Password / app password:')).replace(/\s+/g, '')
    const cfg = { user, pass, host: server.host, port: server.port, from: `"${businessName.replace(/"/g, '')}" <${user}>` }
    try {
      process.stdout.write('  Logging in and sending a test email to yourself… ')
      const t = sdk.smtpTransport(cfg)
      await t.verify()
      await t.sendMail({ from: cfg.from, to: user, subject: 'Sableye email is set up', text: `Invoices and receipts for ${businessName} will be sent from this address.` })
      console.log(`done. Check ${user}.`)
      const known = sdk.smtpServerFor(user)
      return {
        SABLEYE_SMTP_USER: user, SABLEYE_SMTP_PASS: pass,
        ...(known ? {} : { SABLEYE_SMTP_HOST: server.host, SABLEYE_SMTP_PORT: String(server.port) }),
      }
    } catch (e) {
      console.log(`failed:\n    ${e.message}`)
      if (!(await p.yes('  Try again?'))) {
        note('Skipped. Fix it later with `npx sableye init --email`.')
        return {}
      }
    }
  }
}

/** Which env file to write: `.env`, unless only `.env.local` exists (or the merchant picks it). */
async function chooseEnvFile(p) {
  const env = existsSync('.env')
  const local = existsSync('.env.local')
  if (local && !env) return '.env.local'
  if (local && env) {
    const a = await p.ask('  You have both .env and .env.local. Save Sableye settings to:', '.env')
    return a === '.env.local' ? '.env.local' : '.env'
  }
  return '.env'
}

/** Set up the merchant's coding agent and return the prompt to give it. `pkgDir` is the sableye package. */
export async function agentStep(p, { project, pkgDir, envFile }) {
  section('AI coding agent')
  note('Lets your coding agent (Claude Code, Cursor, Codex, Copilot…) write the integration correctly:')
  note('a Sableye section in AGENTS.md that points at the docs bundled with the package, and a skill.')
  if (!existsSync(join(pkgDir, 'docs/AGENTS.block.md'))) {
    note('Agent setup ships with the published `sableye` package; skipped here.')
  } else if (await p.yes('  Set up your coding agent?')) {
    for (const f of installAgentFiles({ dir: '.', pkgDir })) ok(f)
    if (!project.installed) note('The docs it points to appear in node_modules/sableye/docs once `sableye` is installed.')
  }
  note('Describe what customers pay for, e.g. "Pro plan, 9.99 USDT, Buy button on /pricing".')
  note('Or press Enter and the agent works it out from your app.')
  let sells = await p.ask('  What will customers pay for?')
  if (/^(let the agent|the agent|work it out|enter|skip|-)/i.test(sells)) sells = '' // the hint, typed back
  return agentPrompt({ framework: project.framework, ts: project.ts, sells, envFile })
}

/**
 * Returns `{ code, prompt? }`. The caller runs `doctor` and then prints the prompt, so it's the last thing on screen.
 * `pkgDir`: the installed sableye package (for the bundled docs and skill).
 */
export async function runInit({ emailOnly = false, sdk, pkgDir }) {
  if (!process.stdin.isTTY) {
    console.log('`sableye init` is interactive. Without a terminal, copy .env.example to .env and fill it in.')
    return { code: 1 }
  }
  let project = detectProject('.')
  const p = prompter()
  const updates = {}
  try {
    if (!emailOnly) {
      section('Your app')
      if (!project.hasPackageJson) {
        note('No package.json here. Run this in your app\'s folder, or create a new store with `npx sableye create --name my-store`.')
        if (!(await p.yes('  Continue anyway?', false))) return { code: 1 }
      } else {
        ok(`${FRAMEWORK_NAMES[project.framework]}${project.ts ? ', TypeScript' : ''} · ${project.pm}`)
        const cmd = installCommand(project)
        if (!cmd) ok('sableye is installed')
        else if (await p.yes(`  Install ${cmd.slice(2).join(' and ')} with ${cmd[0]}?`)) {
          const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' })
          if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K') // clear the package manager's spinner
          if (r.status === 0) ok(`installed ${cmd.slice(2).join(', ')}`)
          else note(`Install failed. Run it yourself: ${cmd.join(' ')}`)
          project = detectProject('.')
        } else note(`Skipped. Run it yourself: ${cmd.join(' ')}`)
      }
    }

    const file = await chooseEnvFile(p)
    const text = existsSync(file) ? readFileSync(file, 'utf8') : existsSync('.env.example') ? readFileSync('.env.example', 'utf8') : ''
    const env = parseEnv(text)
    if (existsSync(file)) note(`Using your existing ${file}: only Sableye's settings are added. Press Enter to keep a value in [brackets].`)

    let businessName = env.SABLEYE_BUSINESS_NAME || 'My Store'
    if (!emailOnly) {
      section('Merchant key')
      note('Signs your invoices and receives payments. Keep it secret; it never leaves your server.')
      let key = /^0x[0-9a-fA-F]{64}$/.test(env.MERCHANT_KEY ?? '') ? env.MERCHANT_KEY : undefined
      if (key) ok(`Using the key already in ${file}: ${privateKeyToAccount(key).address}`)
      else {
        const pasted = await p.secret('  Paste your private key, or press Enter to generate a new one:')
        key = pasted || generatePrivateKey()
        if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('That is not a 32-byte hex private key (0x + 64 hex characters).')
        updates.MERCHANT_KEY = key
        ok(`Merchant address: ${privateKeyToAccount(key).address}${pasted ? '' : ' (new key)'}`)
        if (!pasted) note('Fund it with test WBT (https://faucet.testnet.whitechain.io): refunds, cancels and gasless payments need gas.')
      }
      businessName = await p.ask('  Business name (on invoices, receipts and emails):', businessName)
      updates.SABLEYE_BUSINESS_NAME = businessName
    }

    Object.assign(updates, await emailStep(p, env, businessName, sdk))

    if (!emailOnly) {
      section('Arkiv records (optional)')
      note('Publishes your paid invoices to Arkiv, owned by your merchant wallet, so your books outlive any server.')
      note('Needs a free access key (https://hub.arkiv.network/access-keys) and test tGLM (https://hub.arkiv.network/faucet).')
      const access = await p.ask('  Arkiv access key (Enter to skip):', env.ARKIV_ACCESS_KEY)
      if (access) updates.ARKIV_ACCESS_KEY = access
    }

    // Merge into the env file: nothing of the merchant's is replaced without a "yes" (default no), and a backup is kept.
    const changed = Object.entries(updates).filter(([k, v]) => env[k] !== v)
    const overwrite = changed.filter(([k]) => env[k] && env[k] !== '0x...')
    if (overwrite.length && !(await p.yes(`\n  Replace your existing ${overwrite.map(([k]) => k).join(', ')} in ${file}?`, false))) {
      for (const [k] of overwrite) delete updates[k]
    }
    const write = Object.fromEntries(Object.entries(updates).filter(([k, v]) => env[k] !== v))
    const next = setEnv(text, write)
    section('Saved')
    if (next !== text) {
      if (existsSync(file)) {
        copyFileSync(file, `${file}.bak`)
        chmodSync(`${file}.bak`, 0o600)
      }
      writeFileSync(file, next, { mode: 0o600 })
      chmodSync(file, 0o600)
      const added = Object.keys(write).filter((k) => !(k in env))
      const replaced = Object.keys(write).filter((k) => k in env)
      ok(`${file}${added.length ? `: added ${added.join(', ')}` : ''}${replaced.length ? `${added.length ? ';' : ':'} updated ${replaced.join(', ')}` : ''}${existsSync(`${file}.bak`) ? ` (previous version in ${file}.bak)` : ''}`)
      if (project.git || existsSync('.gitignore')) {
        const ignored = ensureGitignore('.', [file, `${file}.bak`])
        if (ignored.length) ok(`.gitignore: added ${ignored.join(', ')}`)
      } else note(`Keep ${file} out of version control: it holds your key and email password.`)
    } else note(`${file}: nothing changed.`)

    if (emailOnly) return { code: 0 }
    const prompt = await agentStep(p, { project, pkgDir, envFile: file })
    return { code: 0, prompt }
  } finally {
    p.close()
  }
}
