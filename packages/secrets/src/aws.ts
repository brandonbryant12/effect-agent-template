import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { errorStatus, safeErrorDetail } from "@repo/observability";
import { Effect, Redacted } from "effect";
import { ulid } from "ulid";
import { SecretStoreError } from "./model.js";
import type { SecretStore } from "./store.js";

export interface AwsSecretStoreOptions {
  readonly region: string;
  readonly namePrefix: string;
  readonly kmsKeyId?: string;
}

export const classifySecretStoreError = (
  operation: string,
  cause: unknown,
): SecretStoreError => {
  const status = errorStatus(cause);
  const name =
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    typeof cause.name === "string"
      ? cause.name
      : "";
  const reason =
    status === 404 || name.includes("NotFound")
      ? "not-found"
      : status === 401 || status === 403 || name.includes("AccessDenied")
        ? "forbidden"
        : status === 429 || name.includes("Throttl")
          ? "rate-limited"
          : "unavailable";
  const detail = safeErrorDetail(cause);
  return new SecretStoreError({
    operation,
    reason,
    retryable: reason === "rate-limited" || reason === "unavailable",
    ...(detail === undefined ? {} : { detail }),
  });
};

export const makeAwsSecretStore = (
  options: AwsSecretStoreOptions,
): SecretStore => {
  const client = new SecretsManagerClient({ region: options.region });
  const withSecret: SecretStore["withSecret"] = (ref, use) =>
    Effect.gen(function* () {
      const output = yield* Effect.tryPromise({
        try: () => client.send(new GetSecretValueCommand({ SecretId: ref.id })),
        catch: (cause) => classifySecretStoreError("read-secret", cause),
      });
      if (output.SecretString === undefined) {
        return yield* new SecretStoreError({
          operation: "read-secret",
          reason: "invalid-material",
          retryable: false,
        });
      }
      return yield* use(Redacted.make(output.SecretString));
    });
  return {
    put: (material) =>
      Effect.tryPromise({
        try: async () => {
          const name = `${options.namePrefix}/${ulid()}`;
          const output = await client.send(
            new CreateSecretCommand({
              Name: name,
              SecretString: Redacted.value(material),
              ...(options.kmsKeyId === undefined
                ? {}
                : { KmsKeyId: options.kmsKeyId }),
            }),
          );
          return {
            backend: "aws-secrets-manager" as const,
            id: output.ARN ?? name,
          };
        },
        catch: (cause) => classifySecretStoreError("create-secret", cause),
      }),
    withSecret,
    delete: (ref) =>
      Effect.tryPromise({
        try: () =>
          client
            .send(
              new DeleteSecretCommand({
                SecretId: ref.id,
                ForceDeleteWithoutRecovery: true,
              }),
            )
            .then(() => undefined),
        catch: (cause) => classifySecretStoreError("delete-secret", cause),
      }),
  };
};
