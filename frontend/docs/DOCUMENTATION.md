# Documentation website

The documentation is served by the main Next.js app at `/docs`; guides use `/docs/<slug>`. Deploy the frontend once. No separate docs server, basePath, rewrite, or hosting project is needed.

## Run

From the repository root: `pnpm --filter sableye-frontend dev`. Open http://localhost:3000/docs. Run `pnpm dev` inside `frontend/` to start the same app.

## Edit

- Pages and route metadata: `src/app/docs/`.
- Shell, search, navigation, syntax highlighting and copy actions: `src/components/docs/`.
- Guide data: `src/lib/docs/content.ts` and `src/lib/docs/content/details.ts`.
- Merchant feature guides: `src/lib/docs/content/merchant.ts` (package selection, setup, WalletConnect, coupons, emails, PDFs, storage, Arkiv, browser checkout, coding-agent setup, sandbox and local webhook forwarding).
- Scoped styles: `src/app/docs/docs.css` under `.docs-root`.
- Artwork and logo: `public/docs/` (URLs begin `/docs/illustrations/` and `/docs/logo.svg`).
- Fonts and the document root are shared with the frontend. Theme changes stay on the docs wrapper and do not change the homepage theme.

Use DocsLink for internal documentation links; it adds `/docs` exactly once. Add guide records and sidebar entries together. Routes, search, Markdown copies and pagination use the content data. Prism parses syntax on the server, while copy actions preserve original source text.

Keep the website and root `llms.txt` aligned with the implemented SDK. Check public interfaces in `sdk/packages/*/src/` and actual CLI flags in `sdk/packages/server/bin/`. The public package is sableye (currently 0.3.0, Node >=22); @sableye/* names are internal workspaces. Document the checked-out implementation rather than future roadmap APIs. Quickstart uses a lazy server client so importing a Next.js route does not require build-time secrets. Persistent workers, single-process file storage, optional WalletConnect dependencies and view-key access boundaries must remain explicit in examples.

The source audit remains in `project-docs/SDK_AUDIT.md`; references there to `docs-site/` describe its historical location before consolidation.

The package build generates version-matched Markdown from the same guide data and copies llms.txt into its reference. Run `pnpm --filter ./sdk/packages/sableye build` after building SDK dependencies to validate that export. Run `pnpm --filter sableye-frontend build` to validate the unified site. Existing artwork attribution remains at `public/docs/illustrations/SOURCES.md`.
