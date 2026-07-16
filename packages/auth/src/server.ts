import { TenantId } from "@repo/contracts";
import { betterAuth } from "better-auth";
import { bearer, deviceAuthorization } from "better-auth/plugins";
import { Effect, Schema } from "effect";
import { Pool } from "pg";
import { ulid } from "ulid";
import { Principal, type ClientKind } from "./principal.js";
import { AuthenticationUnavailable, Unauthorized } from "./service.js";

export interface BetterAuthRuntimeOptions {
  readonly databaseUrl: string;
  readonly baseURL: string;
  readonly secret: string;
  readonly cliClientId: string;
  readonly defaultTenantId: string;
}

export interface BetterAuthRuntime {
  readonly handler: (request: Request) => Promise<Response>;
  readonly authenticate: (
    headers: Headers,
  ) => Effect.Effect<
    typeof Principal.Type,
    Unauthorized | AuthenticationUnavailable
  >;
  readonly deviceVerificationPath: "/device";
  readonly close: () => Promise<void>;
}

const clientKind = (headers: Headers): ClientKind =>
  headers.has("authorization") ? "cli" : "browser";

export const createBetterAuthRuntime = (
  options: BetterAuthRuntimeOptions,
): BetterAuthRuntime => {
  const pool = new Pool({ connectionString: options.databaseUrl });
  const tenantId = Schema.decodeUnknownSync(TenantId)(options.defaultTenantId);

  const auth = betterAuth({
    database: pool,
    baseURL: options.baseURL,
    secret: options.secret,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    plugins: [
      bearer({ requireSignature: true }),
      deviceAuthorization({
        verificationUri: "/device",
        validateClient: (candidate) => candidate === options.cliClientId,
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await pool.query(
              `INSERT INTO users (id, tenant_id, auth_subject)
               VALUES ($1, $2, $3)
               ON CONFLICT (auth_subject) DO NOTHING`,
              [`user_${ulid()}`, tenantId, user.id],
            );
          },
        },
      },
    },
  });

  const authenticate: BetterAuthRuntime["authenticate"] = (headers) =>
    Effect.gen(function* () {
      const session = yield* Effect.tryPromise({
        try: () => auth.api.getSession({ headers }),
        catch: () =>
          new AuthenticationUnavailable({ operation: "read-auth-session" }),
      });
      if (!session) {
        return yield* new Unauthorized({ reason: "invalid" });
      }

      const result = yield* Effect.tryPromise({
        try: () =>
          pool.query<{ id: string; tenant_id: string }>(
            `SELECT id, tenant_id
             FROM users
             WHERE auth_subject = $1`,
            [session.user.id],
          ),
        catch: () =>
          new AuthenticationUnavailable({
            operation: "resolve-application-user",
          }),
      });
      const user = result.rows[0];
      if (!user) {
        return yield* new Unauthorized({ reason: "invalid" });
      }

      return yield* Schema.decodeUnknownEffect(Principal)({
        tenantId: user.tenant_id,
        userId: user.id,
        sessionId: session.session.id,
        clientKind: clientKind(headers),
      }).pipe(
        Effect.mapError(
          () =>
            new AuthenticationUnavailable({
              operation: "decode-application-user",
            }),
        ),
      );
    });

  return {
    handler: auth.handler,
    authenticate,
    deviceVerificationPath: "/device",
    close: () => pool.end(),
  };
};
