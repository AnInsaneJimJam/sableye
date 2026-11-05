# Ethglobal

Frontend foundation for an AI SaaS marketing site.

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
| Package manager | bun |

## Commands

```bash
bun install        # install dependencies
bun run dev        # start the dev server on http://localhost:3000
bun run build      # production build
bun run start      # serve the production build
bun run lint       # Biome check (lint plus format diagnostics)
bun run format     # Biome format, writes files
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

Edit `src/lib/site.ts` to set the product name, title and description.

## Adding components

```bash
bunx shadcn@latest add dialog accordion
```

Components land in `src/components/ui`. They use Base UI, so composition uses the `render`
prop rather than Radix style `asChild`.

## Social images

Next.js picks up `src/app/opengraph-image.(png|tsx)` and `src/app/twitter-image.(png|tsx)`
automatically. No metadata edit is needed once a file exists.
