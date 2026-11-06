// "Powered by Sableye": renders the exact SDK lines this app uses, read from its own source at request time.
import { snippets } from '@/lib/snippets'

export function SdkPanel({ files, extraFiles = [], title = 'The Sableye code behind this page' }: { files: string[]; extraFiles?: string[]; title?: string }) {
  const basic = snippets(files)
  const extra = snippets(extraFiles, 'sableye:extra')
  const total = basic.reduce((n, s) => n + s.lines, 0)
  return (
    <aside className="panel">
      <h3>⚡ {title}</h3>
      {basic.length > 0 && <p className="count">Basic gateway: {total} lines of Sableye (limit 20)</p>}
      {basic.map((s) => (
        <div key={s.file}>
          <div className="file">{s.file}</div>
          <pre>{s.code}</pre>
        </div>
      ))}
      {extra.length > 0 && (
        <details open={basic.length === 0}>
          <summary>Lifecycle features on this page ({extra.reduce((n, s) => n + s.lines, 0)} lines)</summary>
          {extra.map((s) => (
            <div key={s.file}>
              <div className="file">{s.file}</div>
              <pre>{s.code}</pre>
            </div>
          ))}
        </details>
      )}
    </aside>
  )
}
