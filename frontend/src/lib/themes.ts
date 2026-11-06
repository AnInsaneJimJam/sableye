/**
 * The candidate palettes for the site.
 *
 * A theme is six numbers: a hue and a saturation for each of the three
 * families (base, ink, accent), declared in globals.css under
 * `:root[data-theme="..."]`. Lightness never changes, so contrast holds.
 *
 * The three glass colours live here rather than in CSS because the landing
 * background is a WebGL shader, and a shader uniform needs a literal colour.
 */
export type Theme = {
  id: string;
  name: string;
  /** What the palette is going for, in one line. */
  note: string;
  /** Background, pane and edge, in that order: the switcher shows them. */
  swatch: [string, string, string];
  /** The GlassFold uniforms: pane body, void, lit edge. */
  glass: { pane: string; void: string; edge: string };
};

export const THEMES: Theme[] = [
  {
    id: "midnight",
    name: "Midnight Blue",
    note: "The palette on the site today.",
    swatch: ["#080f1f", "#2563eb", "#60a5fa"],
    glass: { pane: "#2563eb", void: "#080f1f", edge: "#60a5fa" },
  },
  {
    id: "iris",
    name: "Iris",
    note: "The same night at a shorter wavelength.",
    swatch: ["#0c0820", "#7c3aed", "#a78bfa"],
    glass: { pane: "#7c3aed", void: "#0c0820", edge: "#a78bfa" },
  },
  {
    id: "mint",
    name: "Mint Ledger",
    note: "Teal base, mint edge: settlement and money moving.",
    swatch: ["#04131a", "#0d9488", "#5eead4"],
    glass: { pane: "#0d9488", void: "#04131a", edge: "#5eead4" },
  },
  {
    id: "amber",
    name: "Graphite Amber",
    note: "Near-neutral graphite with one warm accent.",
    swatch: ["#0b0b0d", "#b45309", "#fbbf24"],
    glass: { pane: "#b45309", void: "#0b0b0d", edge: "#fbbf24" },
  },
  {
    id: "ice",
    name: "Ice",
    note: "Cyan edges on the coldest base.",
    swatch: ["#04111c", "#0284c7", "#67e8f9"],
    glass: { pane: "#0284c7", void: "#04111c", edge: "#67e8f9" },
  },
  {
    id: "rose",
    name: "Rose Noir",
    note: "Warm plum under a rose edge. The only one that is not cold.",
    swatch: ["#140910", "#be123c", "#fb7185"],
    glass: { pane: "#be123c", void: "#140910", edge: "#fb7185" },
  },
];

export const DEFAULT_THEME = THEMES[0];

const STORAGE_KEY = "sableye-theme";
/** Fired on window when the palette changes, so the shader can follow. */
export const THEME_EVENT = "sableye:theme";

export function themeById(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/** The stored choice. Safe to call on the server: it returns the default. */
export function readTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    return themeById(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme.id;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    // A blocked localStorage only costs us the choice on the next reload.
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme.id }));
}

/** Calls back whenever the palette changes. Returns the unsubscribe function. */
export function onThemeChange(fn: (theme: Theme) => void): () => void {
  const handler = (e: Event) =>
    fn(themeById((e as CustomEvent<string>).detail));
  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}
