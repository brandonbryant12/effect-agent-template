import type { CredentialId, TenantId, UserId } from "@repo/contracts";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export class CredentialSecretError extends Schema.TaggedErrorClass<CredentialSecretError>()(
  "CredentialSecretError",
  { operation: Schema.String },
) {}

export interface ActivateCredentialSecret {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly credentialId: CredentialId;
  readonly secretRef: string;
}

export class CredentialSecretService extends Context.Service<
  CredentialSecretService,
  {
    readonly activate: (
      input: ActivateCredentialSecret,
    ) => Effect.Effect<void, CredentialSecretError>;
  }
>()("repo/CredentialSecretService") {}

export const CredentialSecretServiceLive = Layer.effect(
  CredentialSecretService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    return CredentialSecretService.of({
      activate: (input) =>
        sql`
          UPDATE credentials
          SET secret_ref = ${input.secretRef}, status = 'active', updated_at = ${new Date()}
          WHERE id = ${input.credentialId}
            AND tenant_id = ${input.tenantId}
            AND user_id = ${input.userId}
          RETURNING id
        `.pipe(
          Effect.flatMap((result) =>
            result.length === 0
              ? Effect.fail(
                  new CredentialSecretError({
                    operation: "activate-credential-secret-scope",
                  }),
                )
              : Effect.void,
          ),
          Effect.catchTag("SqlError", () =>
            Effect.fail(
              new CredentialSecretError({
                operation: "activate-credential-secret",
              }),
            ),
          ),
        ),
    });
  }),
);
