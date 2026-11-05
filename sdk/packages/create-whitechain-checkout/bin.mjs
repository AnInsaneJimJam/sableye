#!/usr/bin/env node
// Non-interactive scaffolder: npx create-whitechain-checkout --name my-store --framework next
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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
  ;({ values } = parseArgs({ options: { name: { type: 'string' }, framework: { type: 'string', default: 'next' } } }))
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

console.log(`Created ${name}.

Next:
  cd ${name}
  npm install
  cp .env.example .env     # then set MERCHANT_KEY
  npm run dev              # http://localhost:3000
`)
