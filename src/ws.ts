/**
 * A small reconnecting WebSocket client.
 *
 * The caller supplies the URL, optional upgrade headers, a function to send once open (the
 * subscribe/auth frame), and a message handler. This owns backoff, ping and the close/error
 * handling, so a venue adapter cannot get reconnection wrong.
 */
import type { RawData, WebSocket as WsSocket } from "ws";

export interface WsClientOptions {
  url: string;
  /** Headers for the upgrade request (e.g. a signed handshake). */
  headers?: () => Record<string, string>;
  /** Called once the socket is open: send the subscribe/auth frame(s). */
  onOpen?: (send: (data: string) => void) => void;
  /** One text frame. */
  onMessage: (data: string) => void;
  /** Connection state, for logging or health. */
  onState?: (state: "connecting" | "open" | "closed") => void;
  /** Ping the server on an interval (ms), for a server that wants it. */
  pingMs?: number;
  /** The frame sent for a ping. Defaults to a JSON `{ "type": "ping" }`. */
  pingFrame?: () => string;
  maxBackoffMs?: number;
}

export interface WsClient {
  close(): void;
}

export function connectWs(opts: WsClientOptions): WsClient {
  let socket: WsSocket | null = null;
  let stopped = false;
  let backoff = 500;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const open = async (): Promise<void> => {
    if (stopped) return;
    opts.onState?.("connecting");
    const { WebSocket: Ws } = await import("ws");
    const s = new Ws(opts.url, { headers: opts.headers?.() ?? {}, handshakeTimeout: 20_000 });
    socket = s;

    s.on("open", () => {
      backoff = 500;
      opts.onState?.("open");
      opts.onOpen?.((data) => {
        try {
          s.send(data);
        } catch {
          // the close handler owns recovery
        }
      });
      if (opts.pingMs) {
        pingTimer = setInterval(() => {
          try {
            s.send(opts.pingFrame ? opts.pingFrame() : JSON.stringify({ type: "ping" }));
          } catch {
            // ignored; close/error handles it
          }
        }, opts.pingMs);
        pingTimer.unref?.();
      }
    });
    s.on("message", (raw: RawData) => {
      opts.onMessage(raw.toString());
    });
    s.on("close", () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      socket = null;
      if (stopped) return;
      opts.onState?.("closed");
      reconnectTimer = setTimeout(() => void open(), backoff);
      reconnectTimer.unref?.();
      backoff = Math.min(backoff * 2, opts.maxBackoffMs ?? 30_000);
    });
    s.on("error", () => {
      // the close handler owns recovery
    });
  };

  void open();

  return {
    close(): void {
      stopped = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        socket?.close();
      } catch {
        // already gone
      }
      socket = null;
    },
  };
}
