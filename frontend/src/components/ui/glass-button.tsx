import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

/**
 * Liquid glass button. Source and rules: frontend/docs/liquid-glass-button.md.
 * Every button and call-to-action link on the site uses this component.
 *
 * `glassButtonStyles` is kept verbatim from the source prompt. Sableye additions
 * live in `sableyeExtensions`: an `href` prop renders an <a>, an `accent` tone for
 * the primary action, `disabled`, and the `all-unset` helper (Tailwind has none).
 */

function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}

const glassButtonStyles = `@property --angle-1 { syntax: "<angle>"; inherits: false; initial-value: -75deg; }

@property --angle-2 { syntax: "<angle>"; inherits: false; initial-value: -45deg; }

.glass-button-wrap {
  --anim-time:.4s;
  --anim-ease:cubic-bezier(.25,1,.5,1);
  --border-width:clamp(1px,.0625em,4px);
  z-index:2;
  transform-style:preserve-3d;
  transition:transform var(--anim-time)var(--anim-ease);
  position:relative
}

.glass-button-wrap:has(.glass-button:active) {
  transform:rotateX(25deg)
}

.glass-button-shadow {
  --shadow-cutoff-fix:2em;
  width:calc(100% + var(--shadow-cutoff-fix));
  height:calc(100% + var(--shadow-cutoff-fix));
  top:calc(0% - var(--shadow-cutoff-fix)/2);
  left:calc(0% - var(--shadow-cutoff-fix)/2);
  filter:blur(clamp(2px,.125em,12px));
  transition:filter var(--anim-time)var(--anim-ease);
  pointer-events:none;
  position:absolute
}

.glass-button-shadow:after {
  content:"";
  background:linear-gradient(180deg,oklch(from var(--foreground)l c h/20%),oklch(from var(--foreground)l c h/10%));
  width:calc(100% - var(--shadow-cutoff-fix) - .25em);
  height:calc(100% - var(--shadow-cutoff-fix) - .25em);
  top:0;
  right:0;
  bottom:0;
  left:0;
  top:calc(var(--shadow-cutoff-fix) - .5em);
  left:calc(var(--shadow-cutoff-fix) - .875em);
  box-sizing:border-box;
  transition:all var(--anim-time)var(--anim-ease);
  opacity:1;
  border-radius:9999px;
  padding:.125em;
  position:absolute;
  -webkit-mask-image:linear-gradient(#000 0 0),linear-gradient(#000 0 0);
  mask-image:linear-gradient(#000 0,#000 0),linear-gradient(#000 0,#000 0);
  -webkit-mask-position:0 0,0 0;
  mask-position:0 0,0 0;
  -webkit-mask-size:auto,auto;
  mask-size:auto,auto;
  -webkit-mask-repeat:repeat,repeat;
  mask-repeat:repeat,repeat;
  -webkit-mask-clip:content-box,border-box;
  mask-clip:content-box,border-box;
  -webkit-mask-origin:content-box,border-box;
  mask-origin:content-box,border-box;
  -webkit-mask-composite:xor;
  mask-composite:exclude;
  -webkit-mask-source-type:auto,auto;
  mask-mode:match-source,match-source
}

.glass-button {
  -webkit-tap-highlight-color:transparent;
  -webkit-backdrop-filter:blur(clamp(1px,.125em,4px));
  backdrop-filter:blur(clamp(1px,.125em,4px));
  transition:all var(--anim-time)var(--anim-ease);
  background:linear-gradient(-75deg,oklch(from var(--background)l c h/5%),oklch(from var(--background)l c h/20%),oklch(from var(--background)l c h/5%));
  box-shadow:inset 0 .125em .125em oklch(from var(--foreground)l c h/5%),inset 0 -.125em .125em oklch(from var(--background)l c h/50%),0 .25em .125em -.125em oklch(from var(--foreground)l c h/20%),0 0 .1em .25em inset oklch(from var(--background)l c h/20%),0 0 oklch(from var(--background)l c h)
}

.glass-button:hover {
  -webkit-backdrop-filter:blur(.01em);
  backdrop-filter:blur(.01em);
  box-shadow:inset 0 .125em .125em oklch(from var(--foreground)l c h/5%),inset 0 -.125em .125em oklch(from var(--background)l c h/50%),0 .15em .05em -.1em oklch(from var(--foreground)l c h/25%),0 0 .05em .1em inset oklch(from var(--background)l c h/50%),0 0 oklch(from var(--background)l c h);
  transform:scale(.975)
}

.glass-button-text {
  color:oklch(from var(--foreground)l c h/90%);
  text-shadow:0em .25em .05em oklch(from var(--foreground)l c h/10%);
  transition:all var(--anim-time)var(--anim-ease)
}

.glass-button:hover .glass-button-text {
  text-shadow:.025em .025em .025em oklch(from var(--foreground)l c h/12%)
}

.glass-button-text:after {
  content:"";
  width:calc(100% - var(--border-width));
  height:calc(100% - var(--border-width));
  top:calc(0% + var(--border-width)/2);
  left:calc(0% + var(--border-width)/2);
  box-sizing:border-box;
  background:linear-gradient(var(--angle-2),transparent 0%,oklch(from var(--background)l c h/50%)40% 50%,transparent 55%);
  z-index:3;
  mix-blend-mode:screen;
  pointer-events:none;
  transition:background-position calc(var(--anim-time)*1.25)var(--anim-ease),--angle-2 calc(var(--anim-time)*1.25)var(--anim-ease);
  background-position:0%;
  background-size:200% 200%;
  border-radius:9999px;
  display:block;
  position:absolute;
  overflow:clip
}

.glass-button:hover .glass-button-text:after {
  background-position:25%
}

.glass-button:active .glass-button-text:after {
  --angle-2:-15deg;
  background-position:50% 15%
}

.glass-button:after {
  content:"";
  z-index:1;
  width:calc(100% + var(--border-width));
  height:calc(100% + var(--border-width));
  top:0;
  right:0;
  bottom:0;
  left:0;
  top:calc(0% - var(--border-width)/2);
  left:calc(0% - var(--border-width)/2);
  padding:var(--border-width);
  box-sizing:border-box;
  background:conic-gradient(from var(--angle-1)at 50% 50%,oklch(from var(--foreground)l c h/50%)0%,transparent 5% 40%,oklch(from var(--foreground)l c h/50%)50%,transparent 60% 95%,oklch(from var(--foreground)l c h/50%)100%),linear-gradient(180deg,oklch(from var(--background)l c h/50%),oklch(from var(--background)l c h/50%));
  transition:all var(--anim-time)var(--anim-ease),--angle-1 .5s ease;
  box-shadow:inset 0 0 0 calc(var(--border-width)/2) oklch(from var(--background)l c h/50%);
  border-radius:9999px;
  position:absolute;
  -webkit-mask-image:linear-gradient(#000 0 0),linear-gradient(#000 0 0);
  mask-image:linear-gradient(#000 0,#000 0),linear-gradient(#000 0,#000 0);
  -webkit-mask-position:0 0,0 0;
  mask-position:0 0,0 0;
  -webkit-mask-size:auto,auto;
  mask-size:auto,auto;
  -webkit-mask-repeat:repeat,repeat;
  mask-repeat:repeat,repeat;
  -webkit-mask-clip:content-box,border-box;
  mask-clip:content-box,border-box;
  -webkit-mask-origin:content-box,border-box;
  mask-origin:content-box,border-box;
  -webkit-mask-composite:xor;
  mask-composite:exclude;
  -webkit-mask-source-type:auto,auto;
  mask-mode:match-source,match-source
}

.glass-button:hover:after {
  --angle-1:-125deg
}

.glass-button:active:after {
  --angle-1:-75deg
}

.glass-button-wrap:has(.glass-button:hover) .glass-button-shadow {
  filter:blur(clamp(2px,.0625em,6px))
}

.glass-button-wrap:has(.glass-button:hover) .glass-button-shadow:after {
  top:calc(var(--shadow-cutoff-fix) - .875em);
  opacity:1
}

.glass-button-wrap:has(.glass-button:active) .glass-button-shadow {
  filter:blur(clamp(2px,.125em,12px))
}

.glass-button-wrap:has(.glass-button:active) .glass-button-shadow:after {
  top:calc(var(--shadow-cutoff-fix) - .5em);
  opacity:.75
}

.glass-button-wrap:has(.glass-button:active) .glass-button-text {
  text-shadow:.025em .25em .05em oklch(from var(--foreground)l c h/12%)
}

.glass-button-wrap:has(.glass-button:active) .glass-button {
  box-shadow:inset 0 .125em .125em oklch(from var(--foreground)l c h/5%),inset 0 -.125em .125em oklch(from var(--background)l c h/50%),0 .125em .125em -.125em oklch(from var(--foreground)l c h/20%),0 0 .1em .25em inset oklch(from var(--background)l c h/20%),0 .225em .05em oklch(from var(--foreground)l c h/5%),0 .25em oklch(from var(--background)l c h/75%),inset 0 .25em .05em oklch(from var(--foreground)l c h/15%)
}

@media (hover: none) and (pointer: coarse) {
  .glass-button:after,
  .glass-button:hover:after,
  .glass-button:active:after {
    --angle-1: -75deg;
  }

  .glass-button .glass-button-text:after,
  .glass-button:active .glass-button-text:after {
    --angle-2: -45deg;
  }
}
`;

/** Sableye additions. Kept separate so the verbatim block above can be diffed against the source. */
const sableyeExtensions = `
@layer base { .all-unset { all: unset; } }
.glass-button-wrap { display:inline-block; width:fit-content }
.glass-button-wrap[data-tone="accent"] .glass-button {
  background:linear-gradient(-75deg,oklch(0.7137 calc(0.1434 * var(--t-accent-sat)) calc(var(--t-accent-hue) + -8.26deg) / 0.140),oklch(0.7137 calc(0.1434 * var(--t-accent-sat)) calc(var(--t-accent-hue) + -8.26deg) / 0.340),oklch(0.7137 calc(0.1434 * var(--t-accent-sat)) calc(var(--t-accent-hue) + -8.26deg) / 0.140))
}
.glass-button-text svg { flex-shrink:0 }
.glass-button-wrap[data-disabled] { pointer-events:none; opacity:.55 }
@media (prefers-reduced-transparency: reduce) {
  .glass-button { -webkit-backdrop-filter:none; backdrop-filter:none; background:oklch(0.2336 calc(0.0496 * var(--t-base-sat)) calc(var(--t-base-hue) + -1.76deg)) }
}
`;

const glassButtonVariants = cva(
  "relative isolate all-unset inline-block cursor-pointer rounded-full transition-all",
  {
    variants: {
      size: {
        default: "text-base font-medium",
        sm: "text-sm font-medium",
        lg: "text-lg font-medium",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const glassButtonTextVariants = cva(
  "glass-button-text relative flex items-center justify-center gap-2.5 whitespace-nowrap select-none tracking-tight",
  {
    variants: {
      size: {
        default: "px-6 py-3.5",
        sm: "px-4 py-2",
        lg: "px-8 py-4",
        icon: "flex h-10 w-10 items-center justify-center",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type Common = VariantProps<typeof glassButtonVariants> & {
  contentClassName?: string;
  /** "accent" adds a blue tint for the one primary action in a group. */
  tone?: "clear" | "accent";
};

export type GlassButtonProps = Common &
  (
    | (React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
    | (React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
        disabled?: boolean;
      })
  );

/** Shared stylesheet, hoisted and de-duplicated by React 19 however many buttons render. */
function GlassButtonStyles() {
  return (
    <style href="sableye-glass-button" precedence="default">
      {glassButtonStyles + sableyeExtensions}
    </style>
  );
}

const GlassButton = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  GlassButtonProps
>(
  (
    { className, children, size, contentClassName, tone = "clear", ...props },
    ref,
  ) => {
    const disabled = "disabled" in props ? props.disabled : undefined;
    const inner = (
      <span className={cn(glassButtonTextVariants({ size }), contentClassName)}>
        {children}
      </span>
    );
    return (
      <>
        <GlassButtonStyles />
        <div
          className={cn(
            "glass-button-wrap cursor-pointer rounded-full",
            className,
          )}
          data-tone={tone}
          data-disabled={disabled ? "" : undefined}
        >
          {props.href !== undefined ? (
            <a
              className={cn("glass-button", glassButtonVariants({ size }))}
              ref={ref as React.Ref<HTMLAnchorElement>}
              aria-disabled={disabled || undefined}
              {...(({ disabled: _omit, ...rest }) => rest)(
                props as React.AnchorHTMLAttributes<HTMLAnchorElement> & {
                  disabled?: boolean;
                },
              )}
            >
              {inner}
            </a>
          ) : (
            <button
              type="button"
              className={cn("glass-button", glassButtonVariants({ size }))}
              ref={ref as React.Ref<HTMLButtonElement>}
              {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
            >
              {inner}
            </button>
          )}
          <div className="glass-button-shadow rounded-full"></div>
        </div>
      </>
    );
  },
);
GlassButton.displayName = "GlassButton";

export { GlassButton, glassButtonVariants };

export default GlassButton;
