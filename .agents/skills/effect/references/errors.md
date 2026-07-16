# Error recipes

- Use `Schema.TaggedErrorClass` when an expected error crosses a process or
  persistence boundary.
- Keep unions small enough that the caller can make a specific decision.
- Map provider and driver errors once at their adapter boundary; retain only
  safe diagnostic metadata.
- Preserve interruption. Do not catch an interrupted fiber and retry it as a
  normal transient failure.
- Log defects once at the outer process boundary with correlation context.
- Never put prompts, response bodies, SQL values, or secrets in error messages.
