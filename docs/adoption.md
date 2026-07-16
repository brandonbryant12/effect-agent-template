# Adopting the template

1. Create a repository from the template and rename package/product labels.
2. Keep projects/tasks for the first successful local run; then replace schemas and services one vertical slice at a time.
3. Preserve the public interface → internal adapter organization. Add vendor dependencies only inside a named adapter package and extend `scripts/check-architecture.ts` with its boundary.
4. Update `apps/web/DESIGN.md` before changing visual rules. Install only source components you actually use.
5. Replace example provider/host values, create production secrets externally, and configure distinct IAM roles.
6. Add domain-specific authorization tests, data retention, audit requirements, and recovery policy.
7. Run `pnpm guardrails`, `pnpm build`, `pnpm infra:check`, real-Postgres tests, image builds, `helm lint`, and an end-to-end run before publishing.

Do not begin by creating a generic repository layer or a universal agent harness. Add application service methods that say what the product does, then implement those methods with explicit SQL and provider-neutral capabilities. Keep the deterministic implementations: they are executable documentation and the fastest way for humans and agents to verify complete flows.

When adding a new feature, the usual path is:

```text
contract schema and tagged failures
  → service interface and deterministic test
  → Postgres adapter with scoped queries and transaction tests
  → thin HTTP route
  → shared SDK method
  → CLI/browser composition
  → architecture, design, and end-to-end verification
```
