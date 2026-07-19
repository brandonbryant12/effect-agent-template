import { Schema } from "effect";

export const SecretRef = Schema.Struct({
  backend: Schema.Literals(["memory", "aws-secrets-manager"]),
  id: Schema.String,
});
export type SecretRef = typeof SecretRef.Type;

export class SecretStoreError extends Schema.TaggedErrorClass<SecretStoreError>()(
  "SecretStoreError",
  {
    operation: Schema.String,
    reason: Schema.Literals([
      "not-found",
      "forbidden",
      "rate-limited",
      "unavailable",
      "invalid-material",
    ]),
    retryable: Schema.Boolean,
    detail: Schema.optionalKey(Schema.String),
  },
) {}
