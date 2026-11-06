import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { liveCode } from '../src/lib/sandbox/live-code.ts';
import { productBySlug } from '../src/lib/sandbox/products.ts';

const example = (slug, fields = {}) => liveCode(slug, productBySlug(slug).code, fields);
const parses = (code) => assert.deepEqual(ts.createSourceFile('example.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.map(d => d.messageText), []);

test('invoice preview matches defaults, optional fields and in-progress input', () => {
  const initial = example('invoices').sableye.code;
  assert.match(initial, /amount: "1.00"/);
  assert.match(initial, /expiresIn: 1800/);
  assert.doesNotMatch(initial, /ada@example|WELCOME10|order_123/);
  const code = example('invoices', { amount: '', expiresIn: 300, email: 'ada@example.com', name: 'Ada', description: 'Tea', coupon: 'SAVE1' }).sableye.code;
  for (const fragment of ['amount: ""', 'expiresIn: 300', 'email: "ada@example.com"', 'name: "Ada"', 'description: "Tea"', 'coupon: "SAVE1"']) assert.ok(code.includes(fragment), fragment);
  parses(code);
});

test('user quotes, backslashes, newlines and markup remain literal string data', () => {
  const name = `Tea "special"\\menu\n<script>alert(1)</script>`;
  const codes = example('payment-links', { amount: '0.01', name });
  assert.ok(codes.sableye.code.includes(JSON.stringify(name)));
  assert.ok(codes.stripe.code.includes(JSON.stringify(name)));
  parses(codes.sableye.code);
  parses(codes.stripe.code);
});

test('Stripe cents preserve decimal precision without floating point rounding', () => {
  assert.match(example('payment-links', { amount: '90071992547409.91' }).stripe.code, /unit_amount: 9007199254740991/);
  assert.match(example('invoices', { amount: '1.01' }).stripe.code, /amount: 101,/);
});

test('refund preview follows the edited order and supports clearing a partial refund', () => {
  const fields = { refundOrder: 'sbx_1042', refundAmount: '4.25' };
  assert.match(example('refunds', fields).sableye.code, /orderId: "sbx_1042", amount: "4.25"/);
  assert.match(example('refunds', fields).stripe.code, /amount: 425/);
  assert.doesNotMatch(example('refunds', { ...fields, refundAmount: '' }).sableye.code, /amount:/);
});

test('subscription amount, interval and cap reflect the actual plan and chosen cycles', () => {
  const code = example('subscriptions', { planAmount: '1250000', planInterval: '120', cycles: 6 }).sableye.code;
  assert.match(code, /amount: "1.25", interval: 120/);
  assert.match(code, /const cap = 7500000n/);
  assert.match(code, /writeContract/);
  parses(code);
});

test('dashboard range and books wallet follow the active inputs', () => {
  assert.match(example('dashboard', { bucket: 'week' }).sableye.code, /bucket: "week", from: Date.now\(\) - 84/);
  assert.match(example('books', { merchant: '0x123', hasViewKey: 1 }).sableye.code, /const merchant = "0x123"/);
  assert.match(example('books', { hasViewKey: 1 }).sableye.code, /process.env.VIEW_KEY/);
});
