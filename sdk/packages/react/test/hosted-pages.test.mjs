// Exercise the actual hosted pages: phone QR links use ?i=, existing payment links use #.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import ts from 'typescript'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import * as core from '@sableye/core'

const require = createRequire(import.meta.url)
const pages = [
  '../../../../frontend/src/app/pay/page.tsx',
  '../../../../demo/store/app/pay/page.tsx',
  '../../create-whitechain-checkout/template/app/pay/page.tsx',
]

test('every hosted checkout accepts phone query links and existing fragment links', async () => {
  for (const page of pages) {
    const source = readFileSync(new URL(page, import.meta.url), 'utf8')
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', js)((name) => {
      if (name === '@sableye/core') return core
      if (name === '@sableye/react') return {
        Checkout: ({ invoice }) => createElement('div', { 'data-test-invoice': invoice }),
      }
      if (name === 'next/link') return ({ children }) => createElement('a', null, children)
      if (name.endsWith('.css')) return {}
      return require(name)
    }, module, module.exports)

    for (const suffix of ['?i=invoice-payload', '#invoice-payload']) {
      const dom = new JSDOM('<div id="root"></div>', { url: `https://shop.example/pay${suffix}` })
      Object.assign(globalThis, {
        window: dom.window, document: dom.window.document, location: dom.window.location,
        addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window),
        IS_REACT_ACT_ENVIRONMENT: true,
      })
      const root = createRoot(document.getElementById('root'))
      try {
        await act(async () => root.render(createElement(module.exports.default)))
        assert.equal(document.querySelector('[data-test-invoice]')?.getAttribute('data-test-invoice'), 'invoice-payload', `${page} ${suffix}`)
      } finally {
        await act(async () => root.unmount())
        dom.window.close()
      }
    }
  }
})
