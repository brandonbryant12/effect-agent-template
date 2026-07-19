import { Effect } from "effect";
import { createServer } from "node:http";

export interface ServeHttpOptions {
  /** fetch-style handler; everything app-specific lives behind this. */
  readonly handler: (request: Request) => Promise<Response>;
  readonly port: number;
  readonly host: string;
  /** Base used to build absolute request URLs. Defaults to the Host header. */
  readonly publicUrl?: string;
  /** Requests with larger bodies are rejected with 413 before buffering. */
  readonly maxBodyBytes?: number;
  /** Runs after the listener closes on SIGINT/SIGTERM, before resolving. */
  readonly onClose?: () => Promise<unknown>;
  /** Receives bridge-level failures before the generic 500 is returned. */
  readonly onError?: (error: unknown) => void;
}

/**
 * Bridges node:http to a fetch-style handler and blocks until SIGINT or
 * SIGTERM closes the listener. Both public HTTP apps boot through this one
 * helper so request buffering, header conversion, body limits, and shutdown
 * behave identically.
 */
export const serveHttp = (options: ServeHttpOptions): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Array<Buffer> = [];
        let size = 0;
        for await (const chunk of incoming) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.byteLength;
          if (
            options.maxBodyBytes !== undefined &&
            size > options.maxBodyBytes
          ) {
            outgoing.writeHead(413, { "cache-control": "no-store" });
            outgoing.end();
            return;
          }
          chunks.push(buffer);
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            value.forEach((entry) => headers.append(name, entry));
          } else if (value !== undefined) headers.set(name, value);
        }
        const base =
          options.publicUrl ?? `http://${incoming.headers.host ?? "localhost"}`;
        const request = new Request(`${base}${incoming.url ?? "/"}`, {
          method: incoming.method ?? "GET",
          headers,
          ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks) }),
        });
        const response = await options.handler(request);
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers.entries()),
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        options.onError?.(error);
        outgoing.writeHead(500, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        outgoing.end(JSON.stringify({ error: "internal_error" }));
      }
    });
    server.listen(options.port, options.host);
    const close = () =>
      server.close(() => {
        void (options.onClose?.() ?? Promise.resolve()).finally(() =>
          resume(Effect.void),
        );
      });
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    return Effect.sync(() => server.close());
  });
