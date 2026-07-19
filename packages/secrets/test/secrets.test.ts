import { CredentialId, TenantId, UserId } from "@repo/contracts";
import { Effect, Redacted, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  classifySecretStoreError,
  makeCredentialUploadService,
  makeSecretStoreMemory,
} from "../src/index.js";

const scope = {
  tenantId: Schema.decodeUnknownSync(TenantId)(
    "tenant_00000000000000000000000000",
  ),
  userId: Schema.decodeUnknownSync(UserId)("user_00000000000000000000000000"),
};
const other = {
  ...scope,
  userId: Schema.decodeUnknownSync(UserId)("user_01JY0000000000000000000000"),
};
const credentialId = Schema.decodeUnknownSync(CredentialId)(
  "credential_01JY0000000000000000000000",
);

describe("secret management", () => {
  it.each([
    [{ name: "ResourceNotFoundException", status: 404 }, "not-found", false],
    [{ name: "AccessDeniedException", status: 403 }, "forbidden", false],
    [{ name: "ThrottlingException", status: 429 }, "rate-limited", true],
  ] as const)("classifies AWS failure %j as %s", (cause, reason, retryable) => {
    expect(classifySecretStoreError("read-secret", cause)).toMatchObject({
      reason,
      retryable,
    });
  });

  it("keeps material behind callback-scoped redaction", async () => {
    const store = makeSecretStoreMemory();
    const ref = await Effect.runPromise(
      store.put(Redacted.make("canary-secret")),
    );
    const observed = await Effect.runPromise(
      store.withSecret(ref, (material) =>
        Effect.succeed(Redacted.value(material).startsWith("canary")),
      ),
    );
    expect(observed).toBe(true);
    expect(JSON.stringify(ref)).not.toContain("canary-secret");
    await Effect.runPromise(store.delete(ref));
    await expect(
      Effect.runPromise(store.withSecret(ref, () => Effect.void)),
    ).rejects.toMatchObject({ _tag: "SecretStoreError", reason: "not-found" });
  });

  it("rejects wrong-principal, expired, and replayed upload intents", async () => {
    let now = new Date("2026-07-16T12:00:00.000Z");
    const uploads = makeCredentialUploadService({
      secretStore: makeSecretStoreMemory(),
      signingKey: Redacted.make("test-signing-key-with-enough-entropy"),
      now: () => now,
      ttlSeconds: 60,
    });
    const intent = await Effect.runPromise(uploads.issue(scope, credentialId));
    await expect(
      Effect.runPromise(
        uploads.consume(other, intent.token, Redacted.make("secret")),
      ),
    ).rejects.toMatchObject({
      _tag: "CredentialUploadError",
      reason: "wrong-principal",
    });

    await Effect.runPromise(
      uploads.consume(scope, intent.token, Redacted.make("secret")),
    );
    await expect(
      Effect.runPromise(
        uploads.consume(scope, intent.token, Redacted.make("secret")),
      ),
    ).rejects.toMatchObject({
      _tag: "CredentialUploadError",
      reason: "replayed",
    });

    const expired = await Effect.runPromise(uploads.issue(scope, credentialId));
    now = new Date("2026-07-16T12:02:00.000Z");
    await expect(
      Effect.runPromise(
        uploads.consume(scope, expired.token, Redacted.make("secret")),
      ),
    ).rejects.toMatchObject({
      _tag: "CredentialUploadError",
      reason: "expired",
    });
  });
});
