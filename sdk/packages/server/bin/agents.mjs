// AI-agent setup for a merchant's repo. Best practice (Vercel's agent evals, Next.js 16): put a compact docs index in
// AGENTS.md, which agents load on every turn, pointing at version-matched docs bundled in node_modules. Add a skill
// for the "add a checkout" job, and name it explicitly in the prompt (skills that aren't named are often skipped).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { agentsBlock } from './config.mjs'
export { agentPrompt } from './config.mjs'

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
  else if (['index.html', 'public/index.html', 'dist/index.html', 'src/index.html'].some((f) => existsSync(join(dir, f)))) framework = 'static'
  const pm = existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(dir, 'yarn.lock')) ? 'yarn' : existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb')) ? 'bun' : 'npm'
  return {
    hasPackageJson: !!pkg, framework, ts, pm,
    installed: has('sableye'), hasViem: has('viem'), hasReact: has('react'),
    git: existsSync(join(dir, '.git')),
  }
}

export const FRAMEWORK_NAMES = {
  'next-app': 'Next.js (App Router)', 'next-pages': 'Next.js (Pages Router)', express: 'Express', fastify: 'Fastify',
  hono: 'Hono', 'vite-react': 'React (Vite)', static: 'Static site (HTML/JS)', node: 'Node.js',
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
 * `@AGENTS.md` imports it) and the skill. `pkgDir` is the installed sableye package (holds docs/ and skills/); `config` is
 * the "sableye" section of package.json, which decides what the block says.
 * Returns the paths it touched.
 */
export function installAgentFiles({ dir = '.', pkgDir, config }) {
  const touched = []
  const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version
  const block = agentsBlock(config, { version, index: readFileSync(join(pkgDir, 'docs/AGENTS.index.md'), 'utf8') })
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
