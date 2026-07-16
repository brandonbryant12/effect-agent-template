# Concurrency and testing recipes

- Bound parallelism explicitly. Do not use unbounded `Promise.all` for work.
- Scope fibers to the owner and make shutdown order visible: stop admission,
  wait or interrupt active work, release resources.
- Preserve cancellation through streams, adapters, retries, and worker handlers.
- Use semantic stream events; persist completed values and bounded checkpoints,
  not every token fragment.
- Contract-test a capability against fake and live adapters where practical.
- Use deterministic layers, Deferred synchronization, and TestClock instead of
  sleeps or wall-clock polling.
- A concurrency test should prove the ordering or ownership invariant, not just
  finish without throwing.
