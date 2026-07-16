import { Schema } from "effect";
import { ClientDecodeError, ClientNetworkError } from "./transport.js";

const frames = async function* (response: Response): AsyncIterable<string> {
  if (!response.body) {
    throw new ClientNetworkError({ operation: "read-event-stream" });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value, { stream: !chunk.done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      yield buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
    if (chunk.done) break;
  }
  if (buffer.trim()) yield buffer;
};

export const decodeSse = async function* <
  S extends Schema.ConstraintDecoder<unknown, never>,
>(response: Response, schema: S): AsyncIterable<S["Type"]> {
  for await (const frame of frames(response)) {
    const payload = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!payload) continue;
    try {
      yield Schema.decodeUnknownSync(schema)(JSON.parse(payload));
    } catch {
      throw new ClientDecodeError({ source: "event" });
    }
  }
};
