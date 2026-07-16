import {
  CredentialId,
  CredentialUploadId,
  TenantId,
  UserId,
} from "@repo/contracts";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Effect, Redacted, Schema } from "effect";
import { ulid } from "ulid";
import type { SecretRef } from "./model.js";
import type { SecretStore } from "./store.js";

const Claims = Schema.Struct({
  uploadId: CredentialUploadId,
  credentialId: CredentialId,
  tenantId: TenantId,
  userId: UserId,
  expiresAt: Schema.Number,
});
type Claims = typeof Claims.Type;

export interface UploadScope {
  readonly tenantId: typeof TenantId.Type;
  readonly userId: typeof UserId.Type;
}

export interface CredentialUploadIntent {
  readonly uploadId: typeof CredentialUploadId.Type;
  readonly token: string;
  readonly expiresAt: Date;
}

export interface StoredCredential {
  readonly credentialId: typeof CredentialId.Type;
  readonly secretRef: SecretRef;
}

export class CredentialUploadError extends Schema.TaggedErrorClass<CredentialUploadError>()(
  "CredentialUploadError",
  {
    reason: Schema.Literals([
      "invalid",
      "wrong-principal",
      "expired",
      "replayed",
      "store-unavailable",
    ]),
  },
) {}

export interface CredentialUploadService {
  readonly issue: (
    scope: UploadScope,
    credentialId: typeof CredentialId.Type,
  ) => Effect.Effect<CredentialUploadIntent>;
  readonly consume: (
    scope: UploadScope,
    token: string,
    material: Redacted.Redacted,
  ) => Effect.Effect<StoredCredential, CredentialUploadError>;
}

export interface CredentialUploadServiceOptions {
  readonly secretStore: SecretStore;
  readonly signingKey: Redacted.Redacted;
  readonly now?: () => Date;
  readonly ttlSeconds?: number;
}

const encode = (value: string): string =>
  Buffer.from(value).toString("base64url");
const sign = (payload: string, key: string): string =>
  createHmac("sha256", key).update(payload).digest("base64url");

export const makeCredentialUploadService = (
  options: CredentialUploadServiceOptions,
): CredentialUploadService => {
  const now = options.now ?? (() => new Date());
  const ttlSeconds = options.ttlSeconds ?? 300;
  const key = Redacted.value(options.signingKey);
  const consumed = new Set<string>();

  const decode = (token: string): Claims => {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) throw new Error("invalid token");
    const expected = Buffer.from(sign(payload, key));
    const received = Buffer.from(signature);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new Error("invalid signature");
    }
    return Schema.decodeUnknownSync(Claims)(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  };

  return {
    issue: (scope, credentialId) =>
      Effect.sync(() => {
        const expiresAt = new Date(now().getTime() + ttlSeconds * 1_000);
        const claims: Claims = {
          uploadId: Schema.decodeUnknownSync(CredentialUploadId)(
            `upload_${ulid()}`,
          ),
          credentialId,
          ...scope,
          expiresAt: expiresAt.getTime(),
        };
        const payload = encode(JSON.stringify(claims));
        return {
          uploadId: claims.uploadId,
          token: `${payload}.${sign(payload, key)}`,
          expiresAt,
        };
      }),
    consume: (scope, token, material) =>
      Effect.gen(function* () {
        const claims = yield* Effect.try({
          try: () => decode(token),
          catch: () => new CredentialUploadError({ reason: "invalid" }),
        });
        if (
          claims.tenantId !== scope.tenantId ||
          claims.userId !== scope.userId
        ) {
          return yield* new CredentialUploadError({
            reason: "wrong-principal",
          });
        }
        const digest = createHash("sha256").update(token).digest("hex");
        if (consumed.has(digest)) {
          return yield* new CredentialUploadError({ reason: "replayed" });
        }
        if (claims.expiresAt <= now().getTime()) {
          return yield* new CredentialUploadError({ reason: "expired" });
        }
        const ref = yield* options.secretStore
          .put(material)
          .pipe(
            Effect.mapError(
              () => new CredentialUploadError({ reason: "store-unavailable" }),
            ),
          );
        consumed.add(digest);
        return { credentialId: claims.credentialId, secretRef: ref };
      }),
  };
};
