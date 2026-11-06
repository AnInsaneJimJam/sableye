// JSON responses (bigint-safe) and error mapping that keeps Sableye's code + remedy.
export const json = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...init?.headers },
  });

export function fail(e: unknown, status = 400) {
  const err = e as { code?: string; message?: string; remedy?: string; status?: number };
  return json(
    { error: err.code ?? "error", message: (err.message ?? String(e)).split(" Remedy:")[0], remedy: err.remedy },
    { status: err.status ?? status },
  );
}

export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    return fail(e);
  }
}
