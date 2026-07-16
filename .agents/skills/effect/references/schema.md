# Schema and boundary recipes

- Define runtime truth first, then derive `Schema.Type<typeof Value>`.
- Brand identifiers at the boundary; never pass unvalidated strings as IDs.
- Prefer tagged unions for lifecycle state. Optional-field combinations permit
  invalid states and make exhaustive handling harder.
- Decode `unknown` immediately after HTTP, SQL, queue, AI, or sandbox input.
- Encode deliberately for transport. Domain classes are not automatically wire
  contracts.
- Generate JSON Schema for strict AI tools from the same Effect Schema, then
  decode tool arguments again before execution.

Inspect `node_modules/effect/src/Schema.ts` for current Effect 4 constructors,
class APIs, transformations, and JSON Schema behavior.
