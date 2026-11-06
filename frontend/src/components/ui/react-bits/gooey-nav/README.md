# Gooey Nav

React Bits by David Haz, copyright 2026.

Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Components/GooeyNav

The original component and CSS are included under the accompanying [MIT + Commons Clause license](./LICENSE.md). Sableye's integration adds the navigation landmark name, hides decorative icons from assistive technology, marks section links with `aria-current="location"`, and omits `aria-current` while the hero has no selected section.

Theme colors, dock appearance, phone sizing, and the unselected hero appearance are configured in `../../homepage-gooey-nav.tsx` and `../../homepage-gooey-nav.css`. The existing header owns section selection and scroll tracking.
