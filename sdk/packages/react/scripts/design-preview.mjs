// node scripts/design-preview.mjs dist/index.js out.html: renders the REAL CheckoutView (from the built package) in each state, light + night + a brand example.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
const { CheckoutView } = await import(new URL(`../${process.argv[2] ?? 'dist/index.js'}`, import.meta.url).href)
const summary = { amountFormatted: '24.00', symbol: 'USDT', payout: '0xF9B1a7c3374ca8d2AC63aca87D9664aa2E0bEE08', chainName: 'Whitechain Sepolia' }
const account = '0x3Cf8cD08ed6860A3ccc0436fe899a46a1B86897a'
const qrBtn = h('button', { type: 'button', 'data-sableye-qr-toggle': '', 'aria-label': 'Pay with a phone wallet' },
  h('svg', { viewBox: '0 0 24 24', width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }, h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }), h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }), h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }), h('path', { d: 'M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3' })), 'Phone')
const wcBtn = h('button', { type: 'button', 'data-sableye-walletconnect-toggle': '' }, 'WalletConnect')
const actions = h('span', { style: { display: 'contents' } }, wcBtn, qrBtn)
const states = [
  ['Ready', { status: 'ready', summary }, { actions }],
  ['Waiting for the wallet', { status: 'paying', summary, account }, {}],
  ['Error (retry offered)', { status: 'error', summary, account, error: { code: 'insufficient_balance', message: 'Not enough USDT: you have 3.50, this costs 24.00.' } }, { actions }],
  ['Paid', { status: 'success', summary, txHash: '0x4229f7de327de2a1c9e48660cc225483cba6430e3ec5ee51152ed4a99149c4e9', explorerUrl: 'https://explorer.testnet.whitechain.io/tx/0x4229' }, {}],
]
const row = (title, appearance, bg) => `<section style="background:${bg};padding:28px 32px"><h2 style="font:600 15px system-ui;color:${bg === '#fff' || bg === '#f4f3f7' ? '#333' : '#ddd'};margin:0 0 16px">${title}</h2><div style="display:grid;grid-template-columns:repeat(4,360px);gap:24px;align-items:start">${
  states.map(([name, state, extra]) => `<div><div style="font:500 12px system-ui;color:${bg === '#0b0910' ? '#999' : '#777'};margin-bottom:8px">${name}</div>${renderToStaticMarkup(h(CheckoutView, { state, appearance, ...extra, onPay: () => {}, onSwitchAccount: () => {} }))}</div>`).join('')}</div></section>`
writeFileSync(process.argv[3], `<!doctype html><meta charset="utf-8"><title>Sableye checkout: design</title><body style="margin:0">${
  row('Default: theme "light"', undefined, '#f4f3f7')}${row('theme "night"', { theme: 'night' }, '#0b0910')}${
  row('Brand variables: { colorPrimary: "#0f766e", borderRadius: "6px", fontFamily: "Georgia, serif" }', { variables: { colorPrimary: '#0f766e', borderRadius: '6px', fontFamily: 'Georgia, serif' } }, '#fff')}</body>`)
