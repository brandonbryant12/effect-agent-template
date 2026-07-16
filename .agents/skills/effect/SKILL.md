---
name: effect
description: Use for any Effect, Schema, service, Layer, Stream, SQL, HTTP, worker, concurrency, configuration, or Effect test change in this repository.
---

# Effect 4 repository workflow

The lockfile and installed source are the authority. Before writing Effect code:

1. Read the public interface of the owning package.
2. Inspect the exact installed declaration and implementation under
   `node_modules/effect/src`; use `.cache/effect/<version>` only when broader
   upstream context is useful.
3. Read only the focused reference below that matches the task.
4. Write a failing behavior or contract test.
5. Keep provider and data details behind one meaningful capability boundary.
6. Run the focused test, `pnpm typecheck`, then the relevant guardrails.

## Reference routing

- Schemas, branded IDs, classes, and boundary decoding: `references/schema.md`
- Expected errors and defects: `references/errors.md`
- Services, layers, scopes, and test substitution: `references/services-layers.md`
- SQL, transactions, idempotency, and queues: `references/data-access.md`
- Fibers, streams, interruption, workers, and tests: `references/concurrency-testing.md`

## Repository rules

- Prefer pure functions for pure domain logic.
- Use `Context.Service` for authority, resources, lifecycle, or substitution.
- Keep environment requirements visible in Effect types until an app layer
  provides them.
- Decode once at the boundary and retain validated types internally.
- Model expected failures as narrow schema-backed tagged errors.
- Do not catch defects merely to turn them into vague expected errors.
- Acquire clients and pools in scoped layers; do not construct them in handlers.
- Never perform network calls inside database transactions.
- Avoid timing sleeps in tests; use TestClock, Deferred, test layers, and
  deterministic identifiers.
