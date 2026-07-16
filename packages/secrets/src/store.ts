import type { Effect, Redacted } from "effect";
import type { SecretRef, SecretStoreError } from "./model.js";

export interface SecretStore {
  readonly put: (
    material: Redacted.Redacted,
  ) => Effect.Effect<SecretRef, SecretStoreError>;
  readonly withSecret: <A, E, R>(
    ref: SecretRef,
    use: (material: Redacted.Redacted) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SecretStoreError, R>;
  readonly delete: (ref: SecretRef) => Effect.Effect<void, SecretStoreError>;
}
