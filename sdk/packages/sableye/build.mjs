// Assembles the one published package, `sableye`, from the workspace packages' builds:
//   sableye → core · sableye/server · sableye/react · sableye/mcp · bin: sableye (init, doctor, …, mcp, create)
// Only import specifiers are rewritten (@sableye/* → relative paths); the code is the tested workspace output.
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = (p) => new URL(p, import.meta.url).pathname
const pkgs = here('../')
for (const d of ['dist', 'bin', 'create', 'LICENSE']) rmSync(here(d), { recursive: true, force: true })

for (const [from, to] of [['core', 'core'], ['server', 'server'], ['react', 'react'], ['mcp', 'mcp']]) {
  cpSync(join(pkgs, from, 'dist'), here(`dist/${to}`), { recursive: true })
}
cpSync(join(pkgs, 'server/bin/sableye.mjs'), here('bin/cli.mjs'))
cpSync(join(pkgs, 'server/bin/init.mjs'), here('bin/init.mjs'))
cpSync(join(pkgs, 'mcp/bin/sableye-mcp.mjs'), here('bin/mcp.mjs'))
cpSync(join(pkgs, 'create-sableye-app/bin.mjs'), here('create/bin.mjs'))
cpSync(join(pkgs, 'create-sableye-app/template'), here('create/template'), { recursive: true })
cpSync(join(pkgs, '../../LICENSE'), here('LICENSE'))
writeFileSync(here('bin/sableye.mjs'), `#!/usr/bin/env node
// sableye mcp → MCP server for AI agents · sableye create → scaffold a store · everything else → the merchant CLI
const sub = process.argv[2]
if (sub === 'mcp' || sub === 'create') {
  process.argv.splice(2, 1)
  await import(sub === 'mcp' ? './mcp.mjs' : '../create/bin.mjs')
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

const left = walk(here('.')).filter((f) => !f.includes('node_modules') && !f.endsWith('build.mjs') && /\.(m?js|d\.ts)$/.test(f) && /['"]@sableye\//.test(readFileSync(f, 'utf8')))
if (left.length) throw new Error(`unrewritten @sableye/* imports in:\n${left.join('\n')}`)
console.log('sableye: assembled dist/, bin/, create/')
