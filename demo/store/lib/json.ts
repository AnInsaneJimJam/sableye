/** Response.json that handles bigint (as decimal strings). */
export const json = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...init?.headers },
  })
