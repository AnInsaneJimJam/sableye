# Sableye: liquid glass

A dark liquid-glass language for a merchant and developer audience. Preserve
the Satoshi wordmark and the fixed Midnight Blue palette. Gradient Waves is the
only landing background, with Ice colors scoped to its artwork. There are no
appearance switchers or saved theme preferences.
Design settings: variance 7, motion 4, density 3. This is a web approximation of
liquid glass, using layered highlights, blur and a WebGL navigation effect.

## Foundation

- Background: #080f1f. Foreground: #f8fafc. Supporting copy: #acbbd2.
- Midnight uses #60a5fa for decorative accents and #2563eb for filled surfaces;
  Ice is used only within the Gradient Waves artwork.
- Green or red are reserved for actual payment states, not decoration.
- Satoshi for display, Geist for text, Geist Mono for code. All are self-hosted.
- Cards use 24, 28 or 32px radii; buttons and navigation use pill shapes. Small
  checkout controls use 12px radii.
- Glass uses translucent navy, a fine pale-blue rim, an upper inner highlight and
  soft blue-tinted shadows. Do not apply refraction to text.
- Keep one dark theme across every section. Provide opaque navy surfaces for
  reduced transparency and browsers without backdrop filters.

## Composition and motion

The homepage explains the product in this order: promise,
merchant capabilities, payment flow, integration, business context, trust and
limits, FAQs, then a final action. Vary section composition and leave room between
ideas. No invented adoption numbers, endorsements or customer quotes.

The first product grid uses React Bits Magic Bento through `product-bento.tsx`.
Keep it as one uninterrupted surface with zero gaps, no individual card borders,
and thin internal dividers that catch the active palette's cursor light. Reserve
generous, separate layout space for each complete illustration and its text. Omit
the small category labels; keep only the main headings and descriptions. Keep cards
stationary, selectable, responsive, and readable with reduced motion.

The `/sandbox` overview reuses this connected bento surface and the warm heading
color. Keep one short description per product, with line illustrations for featured
demos. Remove redundant navigation and comparison labels from the overview; the
deeper product pages keep their sidebar, full explanations and live controls.
Scope overview styling to `.sandbox-overview` and its containing shell.

Keep the hero limited to its original headline, supporting sentence, and two
actions. Do not add cards, diagrams, labels, or other content. Change positioning,
typography, and background framing for Gradient Waves; see
`docs/landing-compositions.md`. The Ice-colored artwork
fades into the Midnight Blue page. Keep content legible with a scrim. The homepage's
React Bits Gooey Nav is the main interaction flourish; its active pill and particles
use Midnight Blue. Preserve anchor links, section highlighting, keyboard access,
reduced motion, and the static fallback when WebGL is unavailable.
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
- `glass-button.tsx` is the only button. Every button and call-to-action link uses
  `GlassButton`. Rules, and the verbatim source prompt: `docs/liquid-glass-button.md`.
- `homepage-gooey-nav.tsx` adapts React Bits Gooey Nav, with source and license in
  `src/components/ui/react-bits/gooey-nav/`. The bottom dock keeps the existing
  homepage links and stays clear of the viewport edges on smaller screens.
