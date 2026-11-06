// Assembles the one published package, `sableye`, from the workspace packages' builds:
//   sableye → core · sableye/server · sableye/react · sableye/mcp · bin: sableye (init, doctor, …, mcp, create)
// Only import specifiers are rewritten (@sableye/* → relative paths); the code is the tested workspace output.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const here = (p) => new URL(p, import.meta.url).pathname
const pkgs = here('../')
for (const d of ['dist', 'bin', 'create', 'docs', 'skills', 'browser', 'LICENSE']) rmSync(here(d), { recursive: true, force: true })

for (const [from, to] of [['core', 'core'], ['server', 'server'], ['react', 'react'], ['mcp', 'mcp']]) {
  cpSync(join(pkgs, from, 'dist'), here(`dist/${to}`), { recursive: true })
}
cpSync(join(pkgs, 'server/bin/sableye.mjs'), here('bin/cli.mjs'))
for (const f of ['init.mjs', 'agents.mjs', 'banner.mjs', 'config.mjs']) cpSync(join(pkgs, `server/bin/${f}`), here(`bin/${f}`))
cpSync(join(pkgs, 'mcp/bin/sableye-mcp.mjs'), here('bin/mcp.mjs'))
cpSync(join(pkgs, 'create-sableye-app/bin.mjs'), here('create/bin.mjs'))
cpSync(join(pkgs, 'create-sableye-app/template'), here('create/template'), { recursive: true })
cpSync(join(pkgs, '../../LICENSE'), here('LICENSE'))
writeFileSync(here('bin/sableye.mjs'), `#!/usr/bin/env node
// sableye mcp → MCP server for AI agents · sableye create → scaffold a store · everything else → the merchant CLI
// (mcp speaks JSON over stdout, so it never prints the banner)
const sub = process.argv[2]
if (sub === 'mcp') {
  process.argv.splice(2, 1)
  await import('./mcp.mjs')
} else if (sub === 'create') {
  process.argv.splice(2, 1)
  const { banner } = await import('./banner.mjs')
  const { readFileSync } = await import('node:fs')
  await banner({ version: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version })
  await import('../create/bin.mjs')
} else await import('./cli.mjs')
`, { mode: 0o755 })

const rewrite = (file, pairs) => {
  let s = readFileSync(file, 'utf8')
  for (const [a, b] of pairs) s = s.replaceAll(a, b)
  writeFileSync(file, s)
}
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
for (const f of walk(here('dist'))) {
  const toCore = f.includes('/dist/core/') ? './index.js' : '../core/index.js'
  rewrite(f, [[`'@sableye/core'`, `'${toCore}'`], [`"@sableye/core"`, `"${toCore}"`], [`'@sableye/server'`, `'../server/index.js'`], [`"@sableye/server"`, `"../server/index.js"`]])
}
rewrite(here('bin/cli.mjs'), [[`'../dist/index.js'`, `'../dist/server/index.js'`]])
rewrite(here('bin/mcp.mjs'), [[`'../dist/index.js'`, `'../dist/mcp/index.js'`], [`'@sableye/server'`, `'../dist/server/index.js'`]])

// ---- The drop-in browser build: <Checkout> for pages without React or a bundler (plain HTML, classic Express apps) ----
const esbuild = await import('esbuild')
await esbuild.build({
  entryPoints: [join(pkgs, 'react/src/browser.ts')], bundle: true, minify: true, format: 'iife', globalName: 'SableyeCheckout',
  platform: 'browser', target: 'es2020', outfile: here('browser/checkout.js'), legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  external: ['@walletconnect/universal-provider'], // optional; needs a bundler. The drop-in offers the phone QR instead.
  logLevel: 'warning',
})

// ---- Docs for coding agents, version-matched and inside the package (node_modules/sableye/docs) ----
// Rendered from the developer docs site (frontend/src/lib/docs), plus the full API reference (llms.txt) and the skill.
const repo = join(pkgs, '../..')
const version = JSON.parse(readFileSync(here('package.json'), 'utf8')).version
const tmp = mkdtempSync(join(tmpdir(), 'sableye-docs-'))
for (const f of ['content.ts', 'content/details.ts', 'content/merchant.ts']) {
  const src = readFileSync(join(repo, 'frontend/src/lib/docs', f), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from "\.\/content\/(details|merchant)"/g, 'from "./content/$1.mjs"')
  mkdirSync(dirname(join(tmp, f)), { recursive: true })
  writeFileSync(join(tmp, f.replace(/\.ts$/, '.mjs')), js)
}
const { pages, navigation, pageMarkdown } = await import(join(tmp, 'content.mjs'))
rmSync(tmp, { recursive: true, force: true })
const fileOf = (slug) => `${slug || 'introduction'}.md`
for (const page of pages) {
  mkdirSync(dirname(here(`docs/${fileOf(page.slug)}`)), { recursive: true })
  writeFileSync(here(`docs/${fileOf(page.slug)}`), `${pageMarkdown(page)}\n\nWeb version: https://sableye.xyz/docs${page.slug ? `/${page.slug}` : ''}\n`)
}
cpSync(join(repo, 'llms.txt'), here('docs/api.md'))
cpSync(join(repo, 'skills/sableye'), here('skills/sableye'), { recursive: true })

const groups = navigation.map((g) => {
  const items = g.items.flatMap((i) => i.children ?? [i]).filter((i) => i.slug !== undefined)
  const line = items.map((i) => {
    const p = pages.find((x) => x.slug === i.slug)
    return p ? `${fileOf(p.slug).replace(/\.md$/, '')}` : undefined
  }).filter(Boolean).join(',')
  return `|${g.title}:{${line}}`
}).join('\n')
// The docs index for the AGENTS.md block, which `npx sableye init`/`agents` assembles per app from its settings.
writeFileSync(here('docs/AGENTS.index.md'), `Docs index (node_modules/sableye/docs/<name>.md; api.md = full API reference; README.md = descriptions):\n${groups}\n`)
writeFileSync(here('docs/README.md'), `# Sableye docs (sableye@${version})\n\nBundled with the package so they always match the installed version. Full API reference: [api.md](api.md). Web: https://sableye.xyz/docs\n\n${navigation.map((g) => `## ${g.title}\n\n${g.items.flatMap((i) => i.children ?? [i]).map((i) => pages.find((x) => x.slug === i.slug)).filter(Boolean).map((p) => `- [${p.title}](${fileOf(p.slug)}): ${p.description}`).join('\n')}`).join('\n\n')}\n`)

const left = walk(here('.')).filter((f) => !f.includes('node_modules') && !f.endsWith('build.mjs') && /\.(m?js|d\.ts)$/.test(f) && /['"]@sableye\//.test(readFileSync(f, 'utf8')))
if (left.length) throw new Error(`unrewritten @sableye/* imports in:\n${left.join('\n')}`)
console.log(`sableye: assembled dist/, bin/, create/, docs/ (${pages.length} guides), skills/`)
