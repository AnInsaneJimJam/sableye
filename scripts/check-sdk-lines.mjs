// Counts non-blank lines between // <sableye> and // </sableye> in demo/store, fails above 20.
// Also fails if demo/books imports @sableye/*.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  if (f === 'node_modules' || f === '.next') return []
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
})

let count = 0
for (const file of walk('demo/store')) {
  let inside = false
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    // Markers: `// <sableye>` in TS, `{/* <sableye> */}` in JSX. `<sableye:extra>` (Level 2+ features) isn't counted.
    if (/(\/\/|\/\*) <\/sableye>/.test(line)) inside = false
    else if (/(\/\/|\/\*) <sableye>/.test(line)) inside = true
    else if (inside && line.trim()) count++
  }
}
const leaks = walk('demo/books').filter((f) => /from ['"]@sableye\//.test(readFileSync(f, 'utf8')))

console.log(`Sableye SDK lines in demo/store: ${count}/20`)
if (leaks.length) console.error(`demo/books must not import @sableye/*: ${leaks.join(', ')}`)
if (count > 20 || leaks.length) process.exit(1)
