import type { WorkspaceRef } from "@repo/sandbox";
import type { SecretRef, SecretStore } from "@repo/secrets";
import type { Effect } from "effect";
import type { SandboxError } from "@repo/sandbox";

export interface CredentialBindingSpec {
  readonly name: string;
  readonly hosts: ReadonlyArray<string>;
  readonly methods: ReadonlyArray<string>;
  readonly paths: ReadonlyArray<string>;
  readonly auth:
    | { readonly type: "bearer" }
    | { readonly type: "apiKey"; readonly headerName: string };
}

export interface SandboxCredentialBroker {
  readonly install: (
    workspace: WorkspaceRef,
    binding: CredentialBindingSpec,
    secretRef: SecretRef,
    secretStore: SecretStore,
  ) => Effect.Effect<void, SandboxError>;
}
