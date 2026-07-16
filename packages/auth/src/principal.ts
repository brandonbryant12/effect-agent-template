import { TenantId, UserId } from "@repo/contracts";
import { Schema } from "effect";

export const ClientKind = Schema.Literals(["browser", "cli", "service"]);
export type ClientKind = typeof ClientKind.Type;

export const Principal = Schema.Struct({
  tenantId: TenantId,
  userId: UserId,
  sessionId: Schema.String.check(Schema.isMinLength(1)),
  clientKind: ClientKind,
});
export type Principal = typeof Principal.Type;
