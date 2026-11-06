# Sableye documentation app

An independent Next.js app based on the setup in `frontend/`, with the dark Mintlify-style layout from the supplied references. The Markdown project documents live separately in `docs/`; the website content lives in `src/lib/content.ts`.

## Run

From the repository root:

```sh
pnpm install
pnpm --filter sableye-docs dev
```

Open **http://localhost:3001/docs**. The app uses `basePath: '/docs'`, including its assets and nested guide routes. It does not require a merchant key or SDK build.

```sh
pnpm --filter sableye-docs typecheck
pnpm --filter sableye-docs build
pnpm --filter sableye-docs start
```

## Extend the docs

- Add a page to `pages` in `src/lib/content.ts`: unique `slug`, title, group, description, and sections.
- Add its slug to `navigation` in the same file. Use `children` for expandable sidebar groups.
- Sections support text, code examples, notes, and tables. Their IDs become anchors and the right-hand outline.
- Search, previous/next links, copied Markdown, metadata, and static routes derive from the page data. Array order controls previous/next pagination.
- Edit the landing cards in `src/app/page.tsx`, the shell in `src/components/docs-shell.tsx`, and scoped app styling in `src/app/globals.css`.

The header search supports Ctrl/Cmd+K, arrow keys, Enter, and Escape. Page actions copy content or download Markdown. Theme selection stays in local storage. The mobile menu and page outline are collapsible. All search is local; no AI service, tracker, wallet connection, or payment is triggered by this docs app.

## Hosting under the main website

Deploy `docs/` as its own Next.js app with access to the workspace root. Route `/docs` and `/docs/*` on the public domain to this app, preserving the prefix (including `/docs/_next/*`). The marketing app continues to own the other paths. This repository change does not alter the marketing app or configure a live hosting proxy.

For a Next.js marketing deployment, add rewrites to its configuration using your deployed docs origin:

```ts
async rewrites() {
  return [
    { source: '/docs', destination: 'https://YOUR-DOCS-ORIGIN/docs' },
    { source: '/docs/:path*', destination: 'https://YOUR-DOCS-ORIGIN/docs/:path*' },
  ]
}
```

Fonts are copied from the frontend with their licenses. Card illustrations and the decorative SVG background are local copies of the Mintlify reference artwork; sources are recorded in `public/illustrations/SOURCES.md`. The project uses the same Next.js, React, TypeScript, and icon versions as the frontend, without copying its payment dependencies or server secrets.
