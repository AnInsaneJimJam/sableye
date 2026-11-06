# Sableye: liquid glass

A dark, blue liquid-glass language for a merchant and developer audience. Preserve
the established GlassFold background, Satoshi wordmark and navy/blue palette.
Design settings: variance 7, motion 4, density 3. This is a web approximation of
liquid glass, using layered highlights, blur and a WebGL navigation effect.

## Foundation

- Background: #080f1f. Foreground: #f8fafc. Supporting copy: #acbbd2.
- Blue is the only decorative accent: #60a5fa, with #2563eb for filled surfaces.
- Green or red are reserved for actual payment states, not decoration.
- Satoshi for display, Geist for text, Geist Mono for code. All are self-hosted.
- Cards use 24, 28 or 32px radii; buttons and navigation use pill shapes. Small
  checkout controls use 12px radii.
- Glass uses translucent navy, a fine pale-blue rim, an upper inner highlight and
  soft blue-tinted shadows. Do not apply refraction to text.
- Keep one dark theme across every section. Provide opaque navy surfaces for
  reduced transparency and browsers without backdrop filters.

## Composition and motion

The homepage explains the product in this order: promise and checkout walkthrough,
merchant capabilities, payment flow, integration, business context, trust and
limits, FAQs, then a final action. Vary section composition and leave room between
ideas. No invented adoption numbers, endorsements or customer quotes.

Use the existing animated GlassFold as the hero background, fading into the same
navy as the rest of the page. Keep content legible with a scrim. The shader navbar
is the main interaction flourish; pause it offscreen and when the tab is hidden.
Cards containing content do not drag. Reduced motion removes entry movement,
physics and smooth scrolling. Keep keyboard focus visible.

## Product accuracy

The walkthrough is an illustration, never a wallet or payment request. Explain
merchant-sponsored gas as conditional on token support and relayer configuration.
Show testnet availability and distinguish block inclusion from finality. Never
promise instant finality, production readiness, a public npm release, an audit, or
future Arkiv/Swarm features as shipped.

## Files and reuse

- Components: `src/components/ui`, imported as `@/components/ui`.
- Sections: `src/components/sections`.
- Styles and shared tokens: `src/app/globals.css`.
- The existing `components.json` points shadcn to these paths. Keep the `ui` folder:
  registry components and their imports expect this shared, predictable location.
- TypeScript, Tailwind 4, shadcn, Motion and Lucide are already installed. No setup
  migration is necessary. Add future shadcn components with
  `bunx shadcn@latest add <component>` from `frontend`.
- `liquid-weather-glass.tsx` adapts the supplied card with strict types, per-instance
  filter IDs, reduced motion and an explicit keyboard-accessible expansion button.
- `liquid-glass-navbar.tsx` adapts Nimbus UI Waterline by
  https://guglielmogiannattasio.it. Keep attribution and the CSS fallback.

## Supporting asset

`public/images/chai-shop.webp` was generated with the built-in ImageGen tool and
compressed to WebP. It illustrates the business use case and is not a customer
endorsement or a photograph of an actual Sableye merchant.

Generation prompt: “An intimate modern Mumbai chai shop counter at blue hour,
close up of two small clear glasses of steaming masala chai on a dark brushed
steel counter, soft out of focus shop interior, no people. Horizontal 3:2;
glasses in right half, counter negative space on left. Atmospheric midnight navy,
cool blue edge light, small warm highlights in tea, realistic premium hospitality
editorial photography. No text, logos, coins, crypto graphics or watermark.”
