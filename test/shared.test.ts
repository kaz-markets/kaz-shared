/**
 * The shared helpers: the request helper's retry/parse behaviour and the token bucket's
 * math. No network, no sockets.
 */
import { describe, it, expect } from "vitest";
import { request, sleep } from "../src/http.ts";
import { TokenBucket } from "../src/ratelimit.ts";

describe("the request helper", () => {
  it("returns a non-2xx as data, not a throw", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "nope" }), { status: 400 })) as unknown as typeof fetch;
    try {
      const res = await request<{ error: string }>("https://example.test/x", { attempts: 1 });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "nope" });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("parses a retry-after header", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("", { status: 429, headers: { "retry-after": "2" } })) as unknown as typeof fetch;
    try {
      const res = await request("https://example.test/x", { attempts: 1 });
      expect(res.status).toBe(429);
      expect(res.retryAfterSec).toBe(2);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("tolerates a body that is not JSON", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("plain text", { status: 200 })) as unknown as typeof fetch;
    try {
      const res = await request("https://example.test/x", { attempts: 1 });
      expect(res.ok).toBe(true);
      expect(res.body).toBeNull();
      expect(res.text).toBe("plain text");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("the token bucket", () => {
  it("spends the burst, then refills over time", () => {
    const bucket = new TokenBucket(100, 10);
    expect(bucket.tryTake(10)).toBe(true);
    expect(bucket.tryTake(1)).toBe(false); // spent the burst
    // After a simulated 50ms at 100/s, ~5 tokens are back.
    expect(bucket.tryTake(4, Date.now() + 50)).toBe(true);
  });

  it("waits for a token rather than failing", async () => {
    const bucket = new TokenBucket(1000, 1);
    expect(bucket.tryTake(1)).toBe(true);
    const start = Date.now();
    await bucket.take(1);
    expect(Date.now() - start).toBeGreaterThan(0);
  });

  it("never exceeds the burst", () => {
    const bucket = new TokenBucket(10, 5);
    expect(bucket.available).toBe(5);
    expect(bucket.tryTake(5)).toBe(true);
    expect(bucket.available).toBeLessThanOrEqual(5);
  });
});

void sleep;
