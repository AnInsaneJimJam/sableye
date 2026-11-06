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
    id: "mint",
    name: "Mint Ledger",
    note: "Teal base, mint edge: settlement and money moving.",
    swatch: ["#04131a", "#0d9488", "#5eead4"],
    glass: { pane: "#0d9488", void: "#04131a", edge: "#5eead4" },
  },
  {
    id: "ice",
    name: "Ice",
    note: "Cyan edges on the coldest base.",
    swatch: ["#04111c", "#0284c7", "#67e8f9"],
    glass: { pane: "#0284c7", void: "#04111c", edge: "#67e8f9" },
  },
];

export const DEFAULT_THEME = THEMES[0];

const STORAGE_KEY = "sableye-theme";

/** Restore the palette before paint on every route, including direct checkout links. */
export const THEME_INIT_SCRIPT = `(()=>{let id=${JSON.stringify(DEFAULT_THEME.id)};try{const saved=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(${JSON.stringify(THEMES.map((theme) => theme.id))}.includes(saved))id=saved}catch{}document.documentElement.dataset.theme=id})()`;
/** Fired on window when the palette changes, so the shader can follow. */
export const THEME_EVENT = "sableye:theme";

/** Resolve a saved palette ID, falling back to Midnight for unknown values. */
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

/** Apply a palette immediately and persist it when browser storage is available. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme.id;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme.glass.void);
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
  const storageHandler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      const theme = readTheme();
      document.documentElement.dataset.theme = theme.id;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme.glass.void);
      fn(theme);
    }
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(THEME_EVENT, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
