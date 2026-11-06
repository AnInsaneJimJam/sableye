// The checkout's look. Default: our `light` theme, so <Checkout> looks finished with no CSS. `night` for dark sites,
// `none` for fully unstyled (style the data-sableye-* attributes yourself). Variables override the theme's colours.
// Everything is scoped under [data-sableye-theme], so nothing leaks into the merchant's page.
import type { CSSProperties } from 'react'

export interface Appearance {
  theme?: 'light' | 'night' | 'none'
  variables?: {
    /** Pay button and links. */
    colorPrimary?: string
    /** Text on the pay button. */
    colorPrimaryText?: string
    colorBackground?: string
    colorText?: string
    /** Secondary text (recipient, hints). */
    colorMuted?: string
    colorBorder?: string
    colorSuccess?: string
    colorDanger?: string
    /** Buttons and boxes, e.g. '12px'. The card itself is slightly rounder. */
    borderRadius?: string
    fontFamily?: string
  }
}

const VARS: Record<keyof NonNullable<Appearance['variables']>, string> = {
  colorPrimary: '--sb-primary', colorPrimaryText: '--sb-primary-text', colorBackground: '--sb-bg', colorText: '--sb-text',
  colorMuted: '--sb-muted', colorBorder: '--sb-border', colorSuccess: '--sb-success', colorDanger: '--sb-danger',
  borderRadius: '--sb-radius', fontFamily: '--sb-font',
}

/** Inline CSS custom properties for the merchant's overrides. */
export function appearanceStyle(a?: Appearance): CSSProperties | undefined {
  if (!a?.variables) return undefined
  const style: Record<string, string> = {}
  for (const [k, v] of Object.entries(a.variables)) if (v && k in VARS) style[VARS[k as keyof typeof VARS]] = v
  return style as CSSProperties
}

const T = '[data-sableye-theme]'
export const CHECKOUT_CSS = `
${T}{--sb-primary:#7c3aed;--sb-primary-text:#fff;--sb-bg:#fff;--sb-text:#1a1523;--sb-muted:#6b6578;--sb-border:#e8e5ef;--sb-soft:#f6f4fa;--sb-success:#15803d;--sb-success-bg:#ecfdf3;--sb-danger:#b42318;--sb-danger-bg:#fef3f2;--sb-radius:12px;--sb-font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
box-sizing:border-box;display:flex;flex-direction:column;gap:18px;width:100%;max-width:400px;padding:24px;background:var(--sb-bg);color:var(--sb-text);border:1px solid var(--sb-border);border-radius:calc(var(--sb-radius) + 6px);font:14px/1.45 var(--sb-font);-webkit-font-smoothing:antialiased;box-shadow:0 1px 2px rgb(20 14 36/.04),0 12px 32px -8px rgb(20 14 36/.12)}
${T}[data-sableye-theme=night]{--sb-primary:#8b5cf6;--sb-bg:#16131f;--sb-text:#f4f2f8;--sb-muted:#a39cb4;--sb-border:#2c2639;--sb-soft:#1f1b2b;--sb-success:#4ade80;--sb-success-bg:#11291c;--sb-danger:#f87171;--sb-danger-bg:#2d1516;box-shadow:0 12px 32px -8px rgb(0 0 0/.5)}
${T} *{box-sizing:border-box}
${T} p{margin:0}
${T} code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:1px 6px;border-radius:6px;background:var(--sb-soft);border:1px solid var(--sb-border)}
${T} a{color:var(--sb-primary);font-weight:550;text-underline-offset:3px}
${T} [data-sableye-summary]{display:flex;flex-direction:column;gap:2px}
${T} [data-sableye-label]{font-size:12px;font-weight:550;letter-spacing:.04em;text-transform:uppercase;color:var(--sb-muted)}
${T} [data-sableye-amount]{font-size:32px;font-weight:680;letter-spacing:-.025em;line-height:1.15;font-variant-numeric:tabular-nums}
${T} [data-sableye-amount] small{margin-left:7px;font-size:15px;font-weight:600;letter-spacing:0;color:var(--sb-muted)}
${T} [data-sableye-to]{font-size:13px;color:var(--sb-muted);font-variant-numeric:tabular-nums}
${T} [data-sableye-actions]{display:flex;flex-wrap:wrap;gap:8px}
${T} button{font:inherit;cursor:pointer;border-radius:var(--sb-radius);transition:background-color .15s,border-color .15s,filter .15s,transform .05s}
${T} button:focus-visible{outline:2px solid var(--sb-primary);outline-offset:2px}
${T} button:active{transform:translateY(1px)}
${T} [data-sableye-pay]{flex:1 1 100%;min-height:48px;padding:0 18px;border:0;background:var(--sb-primary);color:var(--sb-primary-text);font-size:15px;font-weight:620;box-shadow:inset 0 1px 0 rgb(255 255 255/.18),0 1px 2px rgb(20 14 36/.2)}
${T} [data-sableye-pay]:hover{filter:brightness(1.08)}
${T} [data-sableye-actions]{justify-content:center;column-gap:4px}
${T} [data-sableye-walletconnect-toggle],${T} [data-sableye-qr-toggle]{min-height:32px;padding:0 10px;display:inline-flex;align-items:center;gap:6px;border:0;background:none;color:var(--sb-muted);font-size:13px;font-weight:550}
${T} [data-sableye-walletconnect-toggle]:hover,${T} [data-sableye-qr-toggle]:hover{color:var(--sb-text);background:var(--sb-soft)}
${T} [data-sableye-wallet-picker] button{min-height:36px;padding:0 12px;border:1px solid var(--sb-border);background:var(--sb-bg);color:var(--sb-text);font-weight:550}
${T} [aria-expanded=true]{color:var(--sb-primary)!important}
${T} [data-sableye-progress]{display:flex;align-items:center;gap:10px;color:var(--sb-muted)}
${T} [data-sableye-progress]::before{content:"";flex:none;width:15px;height:15px;border-radius:50%;border:2px solid var(--sb-border);border-top-color:var(--sb-primary);animation:sb-spin .8s linear infinite}
${T} [data-sableye-success],${T} [data-sableye-error]{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:12px 14px;border-radius:var(--sb-radius);font-weight:550}
${T} [data-sableye-success]{background:var(--sb-success-bg);color:var(--sb-success)}
${T} [data-sableye-error]{background:var(--sb-danger-bg);color:var(--sb-danger)}
${T} [data-sableye-success]::before,${T} [data-sableye-error]::before{flex:none;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;color:var(--sb-bg);font-size:12px;font-weight:800;line-height:1}
${T} [data-sableye-success]::before{background:var(--sb-success)}
${T} [data-sableye-error]::before{background:var(--sb-danger)}
${T} [data-sableye-success]::before{content:"✓"}
${T} [data-sableye-error]::before{content:"!"}
${T} [data-sableye-success] a{color:inherit;margin-left:auto;white-space:nowrap}
${T} [data-sableye-error]{flex-wrap:nowrap;align-items:flex-start}
${T} [data-sableye-account]{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;color:var(--sb-muted)}
${T} [data-sableye-switch-account]{padding:0;border:0;background:none;color:var(--sb-primary);font-size:13px;font-weight:550}
${T} [data-sableye-switch-account]::before{content:"· ";color:var(--sb-muted)}
${T} [data-sableye-phone-pay],${T} [data-sableye-walletconnect]{display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;border:1px solid var(--sb-border);border-radius:var(--sb-radius);background:var(--sb-soft);text-align:center}
${T} [data-sableye-qr-code]{padding:10px;border-radius:10px;background:#fff}
${T} [data-sableye-wallet-picker]{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}
${T} [data-sableye-wallet-picker] [aria-checked=true]{border-color:var(--sb-primary);color:var(--sb-primary)}
${T} [data-sableye-phone-hint]{font-size:13px;color:var(--sb-muted)}
${T} [data-sableye-phone-warning]{font-size:13px;color:var(--sb-danger)}
${T} [data-sableye-wallet-link]{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border-radius:var(--sb-radius);background:var(--sb-primary);color:var(--sb-primary-text);text-decoration:none}
${T} [data-sableye-footer]{text-align:center;font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--sb-muted);opacity:.7}
@keyframes sb-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){${T} [data-sableye-progress]::before{animation:none}${T} button{transition:none}}
`
