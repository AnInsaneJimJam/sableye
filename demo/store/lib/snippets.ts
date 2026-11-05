// Pulls the exact Sableye lines out of this app's source, so the "Powered by Sableye" panel never drifts from the code.
import 'server-only'
import { readSource } from './sableye'

export interface Snippet { file: string; code: string; lines: number }

export function snippets(files: string[], tag: 'sableye' | 'sableye:extra' = 'sableye'): Snippet[] {
  const out: Snippet[] = []
  for (const file of files) {
    let cur: string[] | undefined
    const src = readSource(file).split('\n')
    const blocks: string[][] = []
    for (const line of src) {
      // Markers: `// <tag>` in TS, `{/* <tag> */}` in JSX.
      if (line.includes(`// </${tag}>`) || line.includes(`/* </${tag}> */`)) { if (cur) blocks.push(cur); cur = undefined }
      else if (line.includes(`// <${tag}>`) || line.includes(`/* <${tag}> */`)) cur = []
      else if (cur && line.trim()) cur.push(line)
    }
    if (!blocks.length) continue
    // Merge the blocks of one file, keeping indentation relative to the shallowest line.
    const all = blocks.flat()
    const indent = Math.min(...all.map((l) => l.match(/^ */)![0].length))
    out.push({ file, code: blocks.map((b) => b.map((l) => l.slice(indent)).join('\n')).join('\n  ⋯\n'), lines: all.length })
  }
  return out
}
