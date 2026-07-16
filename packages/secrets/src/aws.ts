import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Effect, Redacted } from "effect";
import { ulid } from "ulid";
import { SecretStoreError } from "./model.js";
import type { SecretStore } from "./store.js";

export interface AwsSecretStoreOptions {
  readonly region: string;
  readonly namePrefix: string;
  readonly kmsKeyId?: string;
}

export const makeAwsSecretStore = (
  options: AwsSecretStoreOptions,
): SecretStore => {
  const client = new SecretsManagerClient({ region: options.region });
  const unavailable = (operation: string) =>
    new SecretStoreError({ operation, reason: "unavailable", retryable: true });
  const withSecret: SecretStore["withSecret"] = (ref, use) =>
    Effect.gen(function* () {
      const output = yield* Effect.tryPromise({
        try: () => client.send(new GetSecretValueCommand({ SecretId: ref.id })),
        catch: () => unavailable("read-secret"),
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
        catch: () => unavailable("create-secret"),
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
        catch: () => unavailable("delete-secret"),
      }),
  };
};
