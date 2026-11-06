/** Fixed Midnight Blue palette for site navigation, surfaces, and interaction effects. */
export const SITE_THEME = {
  id: "midnight",
  name: "Midnight Blue",
  glass: { pane: "#5263b8", void: "#080f1f", edge: "#72dacb" },
} as const;

/** Ice is scoped to the Gradient Waves artwork; it does not change the site palette. */
export const GRADIENT_WAVE_COLORS = {
  pane: "#367eaa",
  void: "#04111c",
  edge: "#b9acf4",
} as const;
