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
| Package manager | pnpm workspace |

## Commands

```bash
pnpm install       # from the repository root
pnpm --filter sableye-frontend dev
pnpm --filter sableye-frontend build
pnpm --filter sableye-frontend start
pnpm --filter sableye-frontend lint
```

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

The live sandbox also uses `NEXT_PUBLIC_SITE_URL` for checkout, relay and webhook URLs. Keep `MERCHANT_KEY` in the repository root `.env` or the server environment. The sandbox starts a subscription keeper once per process: renewals are scheduled when due, new subscribers are discovered every 60 seconds, and failed charges retry after one hour. It needs a long-running server; retry backoff is in memory. Refunds automatically approve missing allowance when the merchant is also the payout wallet.

Edit `src/lib/site.ts` to set the product name, title and description.

## Fonts and development startup

Geist and Geist Mono are bundled in `src/app/fonts` with their SIL Open Font
Licenses and loaded through `next/font/local`. Development and production builds
do not need to contact Google Fonts. Keep these files in source control.

Run `pnpm --filter sableye-frontend dev` from the repository root and open the Local URL printed by Next.js.
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

To check the rendered product content, run the app, then `pnpm --filter sableye-frontend check:render`
(or `PORT=3111 pnpm --filter sableye-frontend check:render` if using that port).
