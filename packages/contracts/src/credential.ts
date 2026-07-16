import { Schema } from "effect";
import { Timestamp } from "./common.js";
import { CredentialId, TenantId, UserId } from "./ids.js";

export const CredentialProvider = Schema.Literals([
  "openai",
  "anthropic",
  "github",
  "custom",
]);
export type CredentialProvider = typeof CredentialProvider.Type;

export const CredentialStatus = Schema.Literals([
  "pending",
  "active",
  "revoked",
]);
export type CredentialStatus = typeof CredentialStatus.Type;

export const Credential = Schema.Struct({
  id: CredentialId,
  tenantId: TenantId,
  userId: UserId,
  provider: CredentialProvider,
  ownership: Schema.Literal("personal"),
  label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  displayHint: Schema.String.check(Schema.isMaxLength(32)),
  status: CredentialStatus,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Credential = typeof Credential.Type;
