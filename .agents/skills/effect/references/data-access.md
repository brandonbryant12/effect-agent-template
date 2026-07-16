# Data access recipes

- Use explicit SQL columns and stable projections. Decode every returned row.
- Keep queries with the use case that owns their invariants; avoid a universal
  repository abstraction.
- Use one transaction for state, event, and job records that must become visible
  together.
- Require caller-provided command IDs or database uniqueness for externally
  retried writes.
- Claim jobs with database locking and leases; handlers remain idempotent under
  at-least-once delivery.
- Classify expected absence, conflict, lease loss, and retryable infrastructure
  failure separately.
- Never hold a database transaction open across AI, sandbox, or other network
  calls.
