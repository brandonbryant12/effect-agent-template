import type {
  Credential,
  CredentialId,
  CredentialProvider,
} from "@repo/contracts";
import { CredentialId as CredentialIdSchema, Timestamp } from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import type { AccessScope } from "./access-scope.js";
import { PersistenceError } from "./project-service.js";

export interface CreatePendingCredential {
  readonly provider: CredentialProvider;
  readonly label: string;
}

export class CredentialNotFound extends Schema.TaggedErrorClass<CredentialNotFound>()(
  "CredentialNotFound",
  { credentialId: CredentialIdSchema },
) {}

export class CredentialService extends Context.Service<
  CredentialService,
  {
    readonly createPending: (
      scope: AccessScope,
      input: CreatePendingCredential,
    ) => Effect.Effect<Credential, PersistenceError>;
    readonly get: (
      scope: AccessScope,
      id: CredentialId,
    ) => Effect.Effect<Credential, CredentialNotFound | PersistenceError>;
  }
>()("repo/CredentialService") {}

const timestamp = (value: string) => Schema.decodeUnknownSync(Timestamp)(value);

export const CredentialServiceTest = Layer.effect(
  CredentialService,
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<CredentialId, Credential>());
    let sequence = 0;

    const get = (scope: AccessScope, id: CredentialId) =>
      Effect.flatMap(Ref.get(state), (credentials) => {
        const credential = credentials.get(id);
        return credential &&
          credential.tenantId === scope.tenantId &&
          credential.userId === scope.userId
          ? Effect.succeed(credential)
          : Effect.fail(new CredentialNotFound({ credentialId: id }));
      });

    return CredentialService.of({
      createPending: (scope, input) =>
        Effect.gen(function* () {
          sequence += 1;
          const now = timestamp("2026-07-16T12:00:00.000Z");
          const credential: Credential = {
            id: Schema.decodeUnknownSync(CredentialIdSchema)(
              `credential_${sequence.toString().padStart(26, "0")}`,
            ),
            ...scope,
            provider: input.provider,
            ownership: "personal",
            label: input.label,
            displayHint: "",
            status: "pending",
            createdAt: now,
            updatedAt: now,
          };
          yield* Ref.update(state, (credentials) =>
            new Map(credentials).set(credential.id, credential),
          );
          return credential;
        }),
      get,
    });
  }),
);
