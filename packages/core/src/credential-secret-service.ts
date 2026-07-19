import type { CredentialId, TenantId, UserId } from "@repo/contracts";
import { Context, Effect, Layer, Schema } from "effect";

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

export const makeCredentialSecretServiceTest = (
  onActivate: (input: ActivateCredentialSecret) => Effect.Effect<void> = () =>
    Effect.void,
) =>
  Layer.succeed(
    CredentialSecretService,
    CredentialSecretService.of({ activate: onActivate }),
  );

export const CredentialSecretServiceTest = makeCredentialSecretServiceTest();
