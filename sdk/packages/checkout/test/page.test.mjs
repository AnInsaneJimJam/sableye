// Smoke test of the built page: `pnpm --filter @sableye/checkout build` first. Wallet flows are covered by the core and react tests.
import { readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dist = new URL('../dist/', import.meta.url)
const assets = readdirSync(new URL('assets/', dist))
const bundle = assets.find((f) => f.startsWith('index-') && f.endsWith('.js'))
const html = readFileSync(new URL('index.html', dist), 'utf8')

test('static output: relative paths, nothing loaded from third parties', () => {
  assert.match(html, /src="\.\/assets\//)
  assert.doesNotMatch(html, /src="https?:|href="https?:/)
})

test('the page renders the empty state, then reports a bad link with its remedy', async () => {
  const dom = new JSDOM('<!doctype html><main id="app"></main>', { url: 'http://localhost/pay' })
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, location: dom.window.location,
    addEventListener: dom.window.addEventListener.bind(dom.window), Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, MutationObserver: dom.window.MutationObserver,
  })
  await import(pathToFileURL(new URL(`assets/${bundle}`, dist).pathname).href)
  const app = document.querySelector('#app')
  const until = async (check) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20))
    assert.ok(check(), app.innerHTML)
  }
  await until(() => app.querySelector('[data-sableye-empty]'))

  dom.window.location.hash = '#not-a-real-link'
  await until(() => app.querySelector('[data-sableye-error]'))
  assert.equal(app.querySelector('[data-sableye-error]').dataset.sableyeCode, 'invalid_payment_link')
  assert.match(app.textContent, /Remedy:/)
  assert.equal(app.querySelector('button'), null)
})
