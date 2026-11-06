/** Original vector illustrations matching the reference's green technical artwork. */
export function Illustration({
  kind,
  className = "",
}: {
  kind: "rocket" | "terminal" | "bolt" | "blocks";
  className?: string;
}) {
  return (
    <svg
      className={`illustration ${className}`}
      viewBox="0 0 360 210"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round">
        {kind === "rocket" && (
          <g transform="translate(55 8) rotate(12 120 100)">
            <path
              d="m90 93-28-4-18 45 30 8M135 138l7 32 47-9 1-32"
              className="art-dark"
            />
            <path
              d="M67 133C67 66 127 16 203 30c23 65-9 122-82 131Z"
              className="art-fill"
            />
            <path d="M189 28c-3 21 6 35 24 42" />
            <ellipse cx="158" cy="83" rx="18" ry="21" className="art-dark" />
            <path
              d="M74 116c-21-8-30 9-30 31 0 16 7 20 24 22 25 2 42-4 41-22l-3-20Z"
              className="art-mid"
            />
          </g>
        )}
        {kind === "terminal" && (
          <g transform="translate(82 25)">
            <path
              d="m31 27 120-28 5 4v111L31 143l-7-4V33Z"
              className="art-dark"
            />
            <path d="m44 47 125-31v112L44 159l-7-4V51Z" className="art-fill" />
            <path d="m44 47 125-31M44 47v112" />
            <path
              d="m56 96 12 7-12 14m20-9 17-4"
              stroke="var(--art-dark)"
              strokeWidth="5"
            />
            <circle cx="149" cy="29" r="2" fill="currentColor" />
            <circle cx="156" cy="27" r="2" fill="currentColor" />
            <circle cx="163" cy="25" r="2" fill="currentColor" />
          </g>
        )}
        {kind === "bolt" && (
          <g transform="translate(72 12)">
            <path
              d="m92 19-18 52-50 22c-13 6-14 15-1 23l132 68c15 8 27 1 23-14L139 31c-5-19-39-24-47-12Z"
              className="art-fill"
            />
            <path d="m92 19-26 74c-4 12 0 20 13 27l85 49M74 71 24 93" />
            <path d="m139 75 58 33c8 5 8 11 0 15l-38 15" className="art-dark" />
          </g>
        )}
        {kind === "blocks" && (
          <g transform="translate(94 26)">
            <path d="m58 10 28-15 28 15-28 16-28-16Z" className="art-fill" />
            <path d="M58 10v15l28 16 28-16V10M86 26v15" className="art-dark" />
            <path d="m23 68 62-34 63 34-63 35-62-35Z" className="art-fill" />
            <path d="M23 68v27l62 34 63-34V68M85 103v26" className="art-mid" />
            <path
              d="m-3 125 27-15 28 15-28 16-27-16Zm119 0 27-15 28 15-28 16-27-16Z"
              className="art-fill"
            />
            <path
              d="M-3 125v26l27 16 28-16v-26m64 0v26l27 16 28-16v-26M24 141v26m119-26v26"
              className="art-dark"
            />
          </g>
        )}
      </g>
    </svg>
  );
}
