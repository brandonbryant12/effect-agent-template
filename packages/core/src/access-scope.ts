import type { TenantId, UserId } from "@repo/contracts";

export interface AccessScope {
  readonly tenantId: TenantId;
  readonly userId: UserId;
}
