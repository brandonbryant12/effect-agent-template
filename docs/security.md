# Security model

The default tenant is intentional; users remain the isolation boundary. Every business query is scoped by both `tenantId` and `userId`. Browser clients use HttpOnly Better Auth cookies. CLI clients use Device Authorization and bearer tokens stored behind an injectable token-store interface.

## Credentials

Credential metadata travels through the application API. Secret material does not. The server issues a short-lived, principal-bound, single-use upload token. The client sends the value directly to the credential broker, which enforces authentication, token ownership, expiry, replay protection, a 16 KiB limit, UTF-8 decoding, and `no-store` responses. There is no read-secret route.

Production uses AWS Secrets Manager and a broker-specific IAM role. The server role must not read or write secret values. Workers should receive only permission to use the exact secret references needed by their session. OpenSandbox Credential Vault installs host/method/path-bound credentials into its proxy; the plaintext is never placed in sandbox environment variables, files, command arguments, logs, or the OpenCode API.

## Sandbox and runtime

- One sandbox per application session.
- Default-deny egress; allow only reviewed hosts.
- Password-protected OpenCode server reachable only through the worker adapter.
- Random server passwords and OpenCode endpoints never leave worker memory or server-owned session records.
- Approval requests expose a safe summary, not raw command payloads or secret-bearing arguments.
- Cancellation and approval decisions are authorized application commands and durable audit events.
- Teardown deletes the credential vault before terminating the sandbox.

The live adapter currently defaults to one worker replica because its active runtime connection registry is process-local. Scale workers only after adding session-affine job routing or a reconnectable encrypted runtime-control record. The Helm default makes this constraint explicit rather than pretending arbitrary horizontal scaling is safe.

## Kubernetes identities

The chart creates distinct service accounts for server, broker, and worker. Add EKS IRSA annotations in values. The broker role may create/update credential secrets under the configured prefix. The worker role may use OpenSandbox and narrowly retrieve bound secrets. The server role gets no secret-store permissions. Runtime values come from an existing Kubernetes Secret; the chart never renders secret values.

Before production, configure TLS, private database networking, AWS KMS keys, WAF/rate limits, audit-log export, backup/restore, key rotation, and a real external OpenSandbox control plane. Run a canary-secret test proving the value reaches only its intended mock upstream and never appears in logs, events, database projections, or sandbox-visible surfaces.
