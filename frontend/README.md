# Sableye frontend

The Sableye marketing site. Sableye is a USDT checkout for real businesses on Whitechain.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, React Compiler, Cache Components) |
| UI runtime | React 19 |
| Language | TypeScript 5.9 (strict) |
| Styling | Tailwind CSS 4 (CSS first config, no `tailwind.config.ts`) |
| Components | shadcn/ui v4 on Base UI primitives, `base-nova` style |
| Icons | lucide-react |
| Animation | motion |
| Theming | next-themes, class strategy, light and dark tokens in OKLCH |
| Lint and format | Biome 2 |
| Package manager | pnpm 10.24.0 (repository workspace) |

## Commands

```bash
corepack enable    # once, to use the pinned pnpm version
pnpm install --frozen-lockfile # install the repository workspace dependencies
pnpm dev           # build SDK dependencies, then start http://localhost:3000
pnpm build         # build SDK dependencies, then the production frontend
pnpm start         # serve the production build
pnpm lint          # Biome check (lint plus format diagnostics)
pnpm format        # Biome format, writes files
```

Run these commands from `frontend/` in a full checkout of this repository.
The `@sableye/*` dependencies are sibling workspace packages in `sdk/packages/`;
copying only `frontend/` or running `bun install` cannot resolve them. Use the
root `pnpm-lock.yaml` as the single lockfile. The `predev` and `prebuild` scripts
compile the SDK dependencies in dependency order because their exports use `dist/`.

## Deploy to Vercel

1. Import the **whole Git repository** into Vercel.
2. Set **Root Directory** to `frontend` and enable **Include source files outside
   of the Root Directory in the Build Step** so the sibling SDK packages are available.
3. Select **Next.js** and **Node.js 22.x**. Leave the output directory at its default.
   `vercel.json` supplies the install and build commands: install from the workspace
   root with the pinned pnpm version and frozen lockfile, then build from `frontend/`.
   Remove any old `bun install` override in the project settings.
4. Set `NEXT_PUBLIC_SITE_URL` to the public HTTPS origin (no trailing slash).
   The marketing pages and hosted `/pay` checkout do not need a merchant key to build.
5. Deploy. If retrying a previous Bun deployment, redeploy without the existing build cache.

Vercel's [monorepo settings](https://vercel.com/docs/monorepos/monorepo-faq)
describe the outside-root setting. Package versions are pinned through Corepack
and `packageManager`; no global pnpm version override is needed.

**Sandbox runtime limitation:** the interactive merchant sandbox currently writes
JSON files to `.sableye/` and starts an indexer and subscription keeper in the
server process. These require persistent writable storage and a long-running
process; they are not suitable for Vercel Functions. Deploying the frontend does
not make those sandbox APIs production-ready. Run the full sandbox on a persistent
Node.js server with a server-only `MERCHANT_KEY`, or migrate its storage and workers
before enabling it on Vercel. Never use a `NEXT_PUBLIC_` variable for the key.

## Layout

```
src/
  app/
    layout.tsx        root layout: fonts, theme provider, header, footer
    page.tsx          home page
    not-found.tsx     404 page
    globals.css       Tailwind entry plus design tokens
    sitemap.ts        sitemap.xml
    robots.ts         robots.txt
  components/
    ui/               shadcn components, owned by this repo
    layout/           site header, site footer
    sections/         page sections go here
  hooks/              client hooks
  lib/
    site.ts           site name, description, canonical URL
    seo.ts            createMetadata() helper
    utils.ts          cn()
```

## Configuration

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL` to the deployed origin.
Metadata, canonical URLs, `sitemap.xml` and `robots.txt` all read it.

Edit `src/lib/site.ts` to set the product name, title and description.

## Fonts and development startup

Geist and Geist Mono are bundled in `src/app/fonts` with their SIL Open Font
Licenses and loaded through `next/font/local`. Development and production builds
do not need to contact Google Fonts. Keep these files in source control.

Run `pnpm dev` from this directory and open the Local URL printed by Next.js.
If port 3000 is occupied, Next.js may choose another port. Stop the previous dev
server before launching another instance for this directory.

## Adding components

```bash
pnpm dlx shadcn@latest add dialog accordion
```

Components land in `src/components/ui`. They use Base UI, so composition uses the `render`
prop rather than Radix style `asChild`.

## Social images

Next.js picks up `src/app/opengraph-image.(png|tsx)` and `src/app/twitter-image.(png|tsx)`
automatically. No metadata edit is needed once a file exists.

## Homepage design

The full product homepage uses the established blue GlassFold background and the
liquid-glass language documented in [DESIGN.md](DESIGN.md). Supplied glass cards
and the Waterline navbar live in `src/components/ui`; no new dependencies are
needed. The checkout walkthrough is an illustration and never requests funds.

To check the rendered product content, run the app, then `pnpm check:render`
(or `PORT=3111 pnpm check:render` if using that port).
