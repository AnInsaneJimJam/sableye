"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type ApiError = { error: string; message: string; remedy?: string };

/** GET a sandbox API route, optionally re-polling. */
export function useApi<T>(url: string | null, intervalMs?: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json();
      if (!alive.current) return;
      if (res.ok) {
        setData(body as T);
        setError(undefined);
      } else setError(body as ApiError);
    } catch (e) {
      if (alive.current) setError({ error: "network", message: (e as Error).message });
    }
  }, [url]);
  useEffect(() => {
    alive.current = true;
    void load();
    const t = intervalMs ? setInterval(() => void load(), intervalMs) : undefined;
    return () => {
      alive.current = false;
      if (t) clearInterval(t);
    };
  }, [load, intervalMs]);
  return { data, error, reload: load };
}

/** POST JSON to a sandbox API route. Throws the API's error body (code, message, remedy). */
export async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw data as ApiError;
  return data as T;
}

export const short = (a?: string, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : "");
export const usdt = (base?: string | bigint) => (base === undefined ? "–" : (Number(base) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 }));
