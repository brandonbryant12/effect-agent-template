import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { Redacted, Schema } from "effect";
import type { OpenCodeConnection, OpenCodeDriver } from "./model.js";

const SessionResponse = Schema.Struct({ id: Schema.String });

const authorization = (connection: OpenCodeConnection) =>
  `Basic ${Buffer.from(`opencode:${Redacted.value(connection.password)}`).toString("base64")}`;

export const makeOpenCodeSdkDriver = (): OpenCodeDriver => {
  const client = (connection: OpenCodeConnection) =>
    createOpencodeClient({
      baseUrl: connection.baseUrl,
      directory: connection.directory,
      headers: { authorization: authorization(connection) },
    });
  return {
    createSession: async (connection) => {
      const response = await client(connection).session.create();
      if (response.error) throw new Error("OpenCode session creation failed");
      return Schema.decodeUnknownSync(SessionResponse)(response.data).id;
    },
    send: async (connection, sessionId, message) => {
      const response = await client(connection).session.promptAsync({
        sessionID: sessionId,
        parts: [{ type: "text", text: message }],
      });
      if (response.error) throw new Error("OpenCode prompt failed");
    },
    events: async function* (connection, _sessionId) {
      const response = await client(connection).event.subscribe();
      for await (const event of response.stream) {
        if (
          typeof event === "object" &&
          event !== null &&
          "properties" in event
        ) {
          yield event;
        }
      }
    },
    replyPermission: async (connection, _sessionId, requestId, decision) => {
      const response = await client(connection).permission.reply({
        requestID: requestId,
        reply: decision,
      });
      if (response.error) throw new Error("OpenCode permission reply failed");
    },
    cancel: async (connection, sessionId) => {
      const response = await client(connection).session.abort({
        sessionID: sessionId,
      });
      if (response.error) throw new Error("OpenCode cancellation failed");
    },
    close: async (connection, sessionId) => {
      const response = await client(connection).session.delete({
        sessionID: sessionId,
      });
      if (response.error) throw new Error("OpenCode session cleanup failed");
    },
  };
};
