# Service and Layer recipes

Use `Context.Service<Self, Shape>()("repo/Capability")` when a capability owns
external authority, resource lifetime, provider variability, or a useful test
substitution. Use ordinary functions otherwise.

- Public service shapes explain inputs, outputs, errors, ordering, atomicity,
  cancellation, ownership, and performance expectations.
- Keep live layers near implementations and test layers near the public
  capability when consumers need them.
- Acquire pools, SDK clients, and subscriptions with scoped constructors.
- Assemble layers only in app composition roots. Handlers request capabilities;
  they do not build dependencies.
- A seam is meaningful when the implementation can be deleted and replaced
  without changing consumers.
