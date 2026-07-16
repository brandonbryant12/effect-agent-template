import { CredentialId, TenantId, UserId } from "@repo/contracts";
import { Effect, Redacted, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  makeCredentialUploadService,
  makeSecretStoreMemory,
} from "@repo/secrets";
import { createCredentialUploadHandler } from "../src/api.js";

const principal = {
  tenantId: Schema.decodeUnknownSync(TenantId)(
    "tenant_00000000000000000000000000",
  ),
  userId: Schema.decodeUnknownSync(UserId)("user_00000000000000000000000000"),
  sessionId: "auth-session",
  clientKind: "browser" as const,
};

describe("credential broker API", () => {
  it("accepts one bounded write and exposes no read route", async () => {
    const store = makeSecretStoreMemory();
    const uploads = makeCredentialUploadService({
      secretStore: store,
      signingKey: Redacted.make("test-signing-key-with-enough-entropy"),
    });
    const credentialId = Schema.decodeUnknownSync(CredentialId)(
      "credential_01JY0000000000000000000000",
    );
    const intent = await Effect.runPromise(
      uploads.issue(principal, credentialId),
    );
    const stored: Array<string> = [];
    const handler = createCredentialUploadHandler({
      authenticate: () => Effect.succeed(principal),
      uploads,
      maxBodyBytes: 128,
      onStored: (_principal, credential) =>
        Effect.sync(() => stored.push(credential.credentialId)),
    });

    const upload = await handler(
      new Request("https://broker.example/v1/credential-uploads", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-upload-token": intent.token,
        },
        body: "canary-secret",
      }),
    );
    expect(upload.status).toBe(204);
    expect(upload.headers.get("cache-control")).toBe("no-store");
    expect(await upload.text()).toBe("");
    expect(stored).toEqual([credentialId]);

    const replay = await handler(
      new Request("https://broker.example/v1/credential-uploads", {
        method: "POST",
        headers: { "x-upload-token": intent.token },
        body: "canary-secret",
      }),
    );
    expect(replay.status).toBe(409);
    expect(await replay.text()).not.toContain("canary-secret");

    const read = await handler(
      new Request("https://broker.example/v1/credential-uploads", {
        method: "GET",
      }),
    );
    expect(read.status).toBe(404);
  });

  it("rejects oversized bodies before storing material", async () => {
    const handler = createCredentialUploadHandler({
      authenticate: () => Effect.succeed(principal),
      uploads: makeCredentialUploadService({
        secretStore: makeSecretStoreMemory(),
        signingKey: Redacted.make("test-signing-key-with-enough-entropy"),
      }),
      maxBodyBytes: 4,
      onStored: () => Effect.void,
    });
    const response = await handler(
      new Request("https://broker.example/v1/credential-uploads", {
        method: "POST",
        headers: { "content-length": "10", "x-upload-token": "unused" },
        body: "0123456789",
      }),
    );
    expect(response.status).toBe(413);
  });
});
