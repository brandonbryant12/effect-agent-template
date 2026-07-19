import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import {
  CredentialSecretError,
  CredentialSecretService,
} from "../credential-secret-service.js";

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
