# Gradient Waves

React Bits by David Haz, copyright 2026.

Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds/GradientWaves

GradientWaves and its styles are included under the accompanying [MIT + Commons Clause license](./LICENSE.md). This is the only landing background. The surrounding integration supplies fixed Ice colors while the website stays Midnight Blue. The renderer respects reduced motion, pauses offscreen, and has a static fallback.

Integration fix: effect cleanup deletes GPU resources without calling `loseContext()`. React Strict Mode reuses the canvas during setup/cleanup checks, so forcibly losing the context left it blank.
