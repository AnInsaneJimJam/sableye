/** Landing compositions. Color palettes remain an independent preference. */
export const BACKGROUNDS = [
  { id: "glass-fold", name: "Glass Fold", note: "Layered glass, softly lit." },
  {
    id: "pattern-waves",
    name: "Pattern Waves",
    note: "A rolling field of fine dots.",
  },
  {
    id: "ghost-fibers",
    name: "Ghost Fibers",
    note: "Fine fibers suspended in the dark.",
  },
  {
    id: "gradient-waves",
    name: "Gradient Waves",
    note: "Satin waves at a quiet horizon.",
  },
  { id: "threads", name: "Threads", note: "Delicate lines, moving together." },
] as const;

/** A selectable landing background and its presentation label. */
export type Background = (typeof BACKGROUNDS)[number];

/** Preserve the original landing composition for first-time visitors. */
export const DEFAULT_BACKGROUND = BACKGROUNDS[0];
const STORAGE_KEY = "sableye-background";
const BACKGROUND_EVENT = "sableye:background";
/** Restore the layout before paint, using only known background IDs. */
export const BACKGROUND_INIT_SCRIPT = `(()=>{let id=${JSON.stringify(DEFAULT_BACKGROUND.id)};try{const saved=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(${JSON.stringify(BACKGROUNDS.map((background) => background.id))}.includes(saved))id=saved}catch{}document.documentElement.dataset.background=id})()`;

/** Resolve a stored ID, falling back to the original glass background. */
export function backgroundById(id: string | null): Background {
  return (
    BACKGROUNDS.find((background) => background.id === id) ?? DEFAULT_BACKGROUND
  );
}

/** Read the saved composition; unavailable storage falls back to Glass Fold. */
export function readBackground(): Background {
  if (typeof window === "undefined") return DEFAULT_BACKGROUND;
  try {
    return backgroundById(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_BACKGROUND;
  }
}

/** Switch compositions immediately and remember the choice when storage allows. */
export function applyBackground(background: Background): void {
  document.documentElement.dataset.background = background.id;
  try {
    window.localStorage.setItem(STORAGE_KEY, background.id);
  } catch {
    // The in-session switch still works when storage is blocked.
  }
  window.dispatchEvent(
    new CustomEvent(BACKGROUND_EVENT, { detail: background.id }),
  );
}

/** Observe local switches and changes from another tab. Returns a cleanup function. */
export function onBackgroundChange(
  callback: (background: Background) => void,
): () => void {
  const local = (event: Event) =>
    callback(backgroundById((event as CustomEvent<string>).detail));
  const storage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const background = readBackground();
    document.documentElement.dataset.background = background.id;
    callback(background);
  };
  window.addEventListener(BACKGROUND_EVENT, local);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(BACKGROUND_EVENT, local);
    window.removeEventListener("storage", storage);
  };
}
