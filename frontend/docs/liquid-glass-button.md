# Liquid glass buttons

**Rule: every button and call-to-action link on the Sableye site is a `GlassButton`**
(`src/components/ui/glass-button.tsx`). Don't hand-roll button CSS, and don't use
`<a className="…">` or `<button className="…">` for actions. This applies to the
homepage, the sandbox and any new page. Humans and AI agents both follow it.

```tsx
import { GlassButton } from "@/components/ui/glass-button";

<GlassButton tone="accent" href="/sandbox">Try the sandbox <ArrowUpRight size={17} /></GlassButton> // primary link
<GlassButton size="sm" href={url}>Read the report</GlassButton>                                   // secondary link
<GlassButton size="sm" onClick={save} disabled={busy}>Save</GlassButton>                          // button
```

- `href` renders an `<a>`; without it you get a `<button type="button">`.
- `tone="accent"` (a blue tint) marks the one primary action in a group. Default is `clear`.
- Sizes: `sm` for in-card and sandbox actions, `default` for hero actions, `lg` rarely, `icon` for icon-only.
- Position the button with `className` on the wrapper (for example `margin-left: auto`). Never restyle the glass itself.
- The one exception is the checkout widget's Pay button: it's rendered by `@sableye/react`,
  so `sandbox.css` gives `[data-sableye-pay]` a CSS approximation of the same glass.

## What was changed from the source prompt

The CSS in `glassButtonStyles` is **verbatim**. Everything Sableye-specific is in
`sableyeExtensions` and the component body:

- `href` support (link variant), `tone="accent"`, `disabled` and `aria-disabled` for links;
- `.all-unset` defined in `@layer base` (Tailwind has no such utility, and the base layer lets Tailwind utilities still win);
- the wrapper is `inline-block` and `width: fit-content` so the shadow hugs the button;
- the stylesheet is rendered once through React 19's `<style href precedence>`, not once per button;
- a reduced-transparency fallback.

Prerequisites (all present): shadcn structure with `@/components/ui`, Tailwind 4, TypeScript,
`class-variance-authority`, and `--background` / `--foreground` tokens (the site forces the dark theme).

## Source prompt (verbatim)

You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
````tsx
glass-button.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

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


const glassButtonVariants = cva(
  "relative isolate all-unset cursor-pointer rounded-full transition-all",
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
  "glass-button-text relative block select-none tracking-tighter",
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

export interface GlassButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, ...props }, ref) => {
    return (
      <>
        <style>{glassButtonStyles}</style>
        <div
          className={cn(
            "glass-button-wrap cursor-pointer rounded-full",
            className,
          )}
        >
          <button
            className={cn("glass-button", glassButtonVariants({ size }))}
            ref={ref}
            {...props}
          >
            <span
              className={cn(
                glassButtonTextVariants({ size }),
                contentClassName,
              )}
            >
              {children}
            </span>
          </button>
          <div className="glass-button-shadow rounded-full"></div>
        </div>
      </>
    );
  },
);
GlassButton.displayName = "GlassButton";

export { GlassButton, glassButtonVariants };

export default GlassButton;


demo.tsx
import { GlassButton } from "@/components/ui/glass-button";

const ZapIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const DottedBackground = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    height="100%"
    width="100%"
    className="pointer-events-none absolute inset-0 z-0"
  >
    <defs>
      <pattern
        patternUnits="userSpaceOnUse"
        height="30"
        width="30"
        id="dottedGrid"
      >
        <circle
          fill="oklch(from var(--foreground) l c h / 30%)"
          r="1"
          cy="2"
          cx="2"
        ></circle>
      </pattern>
    </defs>
    <rect fill="url(#dottedGrid)" height="100%" width="100%"></rect>
  </svg>
);

export default function GlassButtonDemo() {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center gap-8 bg-background p-10">
      <DottedBackground />
      <div className="z-10 text-center">
        <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
          <GlassButton size="sm">Small</GlassButton>
          <GlassButton
            size="default"
            contentClassName="flex items-center gap-2"
          >
            <span>Generate</span>

            <ZapIcon className="h-5 w-5" />
          </GlassButton>
          <GlassButton size="lg">Submit</GlassButton>
          <GlassButton size="icon">
            <ZapIcon className="h-5 w-5" />
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
````

Install NPM dependencies:
```bash
class-variance-authority
```
