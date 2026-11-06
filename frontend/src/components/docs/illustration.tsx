const artwork = {
  rocket: "rocket",
  terminal: "cli",
  bolt: "editor",
  blocks: "components",
} as const;

/** Locally hosted reference artwork, including the original grid and shading. */
export function Illustration({ kind }: { kind: keyof typeof artwork }) {
  const filename = artwork[kind];
  return (
    <span className="illustration" aria-hidden="true">
      <img
        className="artwork-dark"
        src={`/docs/illustrations/${filename}-dark.png`}
        width={680}
        height={404}
        alt=""
        draggable={false}
      />
      <img
        className="artwork-light"
        src={`/docs/illustrations/${filename}.png`}
        width={680}
        height={404}
        alt=""
        draggable={false}
      />
    </span>
  );
}

/** The reference's complete background composition preserves each figure's placement. */
export function HeroIllustration() {
  return (
    <div className="hero-art" aria-hidden="true">
      <img
        className="artwork-dark"
        src="/docs/illustrations/background-dark.svg"
        width={1152}
        height={388}
        alt=""
        draggable={false}
      />
      <img
        className="artwork-light"
        src="/docs/illustrations/background-light.svg"
        width={1152}
        height={388}
        alt=""
        draggable={false}
      />
    </div>
  );
}
