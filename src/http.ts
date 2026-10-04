/**
 * A small HTTP request helper.
 *
 * Dependency-light on purpose: timeout, bounded retry, and the shape of an error all live
 * in one place. A non-2xx is returned as data (status and body), not thrown, because a
 * venue's error body is often what carries the reason a caller acts on.
 */

export interface HttpResponse<T> {
  ok: boolean;
  status: number;
  body: T | null;
  /** the raw text, for an error body a typed parse missed */
  text: string;
  /** parsed `retry-after` seconds, when the server sends one */
  retryAfterSec?: number;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  attempts?: number;
  /** the UA to send; defaults to a generic one */
  userAgent?: string;
}

export async function request<T>(url: string, opts: RequestOptions = {}): Promise<HttpResponse<T>> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const attempts = opts.attempts ?? 3;
  let last: HttpResponse<T> = { ok: false, status: 0, body: null, text: "" };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          "user-agent": opts.userAgent ?? "kaz/0.1",
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
          ...opts.headers,
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: controller.signal,
      });
      const text = await res.text();
      let body: T | null = null;
      try {
        body = text ? (JSON.parse(text) as T) : null;
      } catch {
        body = null;
      }
      const retryAfter = res.headers.get("retry-after");
      last = {
        ok: res.ok,
        status: res.status,
        body,
        text,
        ...(retryAfter ? { retryAfterSec: Number(retryAfter) || undefined } : {}),
      };
      // A throttled or unhappy server deserves a backoff, not a retry storm.
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < attempts - 1) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      return last;
    } catch {
      if (attempt < attempts - 1) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
