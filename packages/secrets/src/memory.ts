import { Effect, Redacted } from "effect";
import { ulid } from "ulid";
import { SecretStoreError } from "./model.js";
import type { SecretStore } from "./store.js";

export const makeSecretStoreMemory = (): SecretStore => {
  const secrets = new Map<string, string>();
  return {
    put: (material) =>
      Effect.sync(() => {
        const id = `secret_${ulid()}`;
        secrets.set(id, Redacted.value(material));
        return { backend: "memory", id };
      }),
    withSecret: (ref, use) => {
      const material = secrets.get(ref.id);
      return material === undefined
        ? Effect.fail(
            new SecretStoreError({
              operation: "read-secret",
              reason: "not-found",
              retryable: false,
            }),
          )
        : use(Redacted.make(material));
    },
    delete: (ref) =>
      Effect.sync(() => {
        secrets.delete(ref.id);
      }),
  };
};
