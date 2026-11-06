# React Bits backgrounds

Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds
Retrieved November 6, 2026. Copyright (c) 2026 David Haz.

PatternWaves, GhostFibers, GradientWaves, and Threads are vendored here with their original styles and license. They use WebGL 2; PatternWaves additionally uses `ogl`. See [LICENSE.md](./LICENSE.md) for the MIT + Commons Clause terms.

Sableye's palette colors, composition, performance settings, reduced-motion handling, and lazy loading are configured in `../landing-background.tsx` and `app/landing-backgrounds.css`. Keep product-specific tuning outside these source files.

Integration fixes: GradientWaves deletes its GPU resources without calling `loseContext()` during effect cleanup. React Strict Mode reuses their canvas during setup/cleanup checks; forcibly losing that context left the remounted renderer blank.
