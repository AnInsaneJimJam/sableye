#!/usr/bin/env node
// Non-interactive scaffolder: npx create-whitechain-checkout --name my-store --framework next
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const FRAMEWORKS = ['next']

/** Stop with the problem and what to do about it, like every other Sableye error. */
function fail(message, remedy) {
  console.error(`${message}\nRemedy: ${remedy}`)
  process.exit(1)
}

let values
try {
  ;({ values } = parseArgs({
    options: { name: { type: 'string' }, framework: { type: 'string', default: 'next' }, 'local-sdk': { type: 'boolean', default: false } },
  }))
} catch (e) {
  fail(e.message, 'Run: npx create-whitechain-checkout --name my-store --framework next')
}
const { name, framework } = values

if (!name) fail('Missing --name.', 'Run: npx create-whitechain-checkout --name my-store --framework next')
if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) fail(`Invalid name "${name}".`, 'Use lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit.')
if (!FRAMEWORKS.includes(framework)) fail(`Unknown framework "${framework}".`, `Use one of: ${FRAMEWORKS.join(', ')}.`)

const target = resolve(process.cwd(), name)
if (existsSync(target) && readdirSync(target).length > 0) fail(`${target} already exists and is not empty.`, 'Choose another --name, or remove that directory.')

cpSync(fileURLToPath(new URL('./template', import.meta.url)), target, { recursive: true })
// npm strips files named .gitignore when publishing, so the template stores it without the dot.
renameSync(resolve(target, 'gitignore'), resolve(target, '.gitignore'))
const manifest = resolve(target, 'package.json')
writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"__NAME__"', JSON.stringify(name)))

// --local-sdk: until @sableye/* is on npm, pack this repo's SDK into the new app and point package.json at it.
if (values['local-sdk']) {
  const packages = fileURLToPath(new URL('..', import.meta.url))
  if (!existsSync(resolve(packages, 'server/package.json'))) fail('--local-sdk only works from the Sableye repo.', 'Run the scaffolder from sdk/packages/create-whitechain-checkout in the repo.')
  const out = resolve(target, '.sableye-sdk')
  mkdirSync(out, { recursive: true })
  const tarballs = {}
  for (const pkg of ['core', 'server', 'react']) {
    const dir = resolve(packages, pkg)
    if (!existsSync(resolve(dir, 'dist'))) fail(`sdk/packages/${pkg} is not built.`, 'Run `pnpm -r build` in the repo first.')
    const file = execFileSync('pnpm', ['pack', '--pack-destination', out], { cwd: dir, encoding: 'utf8' }).trim().split('\n').pop()
    tarballs[`@sableye/${pkg}`] = `file:./.sableye-sdk/${file.split('/').pop()}`
  }
  const m = JSON.parse(readFileSync(manifest, 'utf8'))
  for (const [dep, spec] of Object.entries(tarballs)) if (m.dependencies[dep]) m.dependencies[dep] = spec
  m.overrides = { '@sableye/core': tarballs['@sableye/core'] } // server/react depend on core by version
  writeFileSync(manifest, JSON.stringify(m, null, 2) + '\n')
}

console.log(`Created ${name}.

Next:
  cd ${name}
  npm install
  npx sableye init         # merchant key, business name, email (SMTP), Arkiv → .env
  npx sableye doctor       # checks RPC, chain, contract, token and your key
  npm run dev              # http://localhost:3000
`)
