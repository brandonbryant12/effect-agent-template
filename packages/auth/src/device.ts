import { Effect, Schema } from "effect";

export class DeviceAuthorizationError extends Schema.TaggedErrorClass<DeviceAuthorizationError>()(
  "DeviceAuthorizationError",
  {
    reason: Schema.Literals([
      "pending",
      "slow-down",
      "expired",
      "denied",
      "invalid-client",
      "invalid",
      "unavailable",
    ]),
  },
) {}

export interface DeviceAuthorization {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  readonly expiresInSeconds: number;
  readonly pollingIntervalSeconds: number;
}

export interface DeviceAccessToken {
  readonly token: string;
  readonly tokenType: string;
  readonly expiresInSeconds: number;
  readonly scope: string;
}

export interface DeviceAuthorizationClient {
  readonly request: (
    scope?: string,
  ) => Effect.Effect<DeviceAuthorization, DeviceAuthorizationError>;
  readonly poll: (
    deviceCode: string,
  ) => Effect.Effect<DeviceAccessToken, DeviceAuthorizationError>;
}

export interface DeviceAuthorizationClientOptions {
  readonly authBaseUrl: string;
  readonly clientId: string;
  readonly fetch?: typeof globalThis.fetch;
}

const DeviceCodeResponse = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri: Schema.String,
  verification_uri_complete: Schema.String,
  expires_in: Schema.Number,
  interval: Schema.Number,
});

const DeviceTokenResponse = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.String,
  expires_in: Schema.Number,
  scope: Schema.String,
});

const reason = (value: unknown): DeviceAuthorizationError["reason"] => {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return "invalid";
  }
  switch (value.error) {
    case "authorization_pending":
      return "pending";
    case "slow_down":
      return "slow-down";
    case "expired_token":
      return "expired";
    case "access_denied":
      return "denied";
    case "invalid_client":
      return "invalid-client";
    default:
      return "invalid";
  }
};

export const createDeviceAuthorizationClient = (
  options: DeviceAuthorizationClientOptions,
): DeviceAuthorizationClient => {
  const fetch = options.fetch ?? globalThis.fetch;
  const endpoint = (path: string) =>
    `${options.authBaseUrl.replace(/\/$/, "")}${path}`;

  const post = (path: string, body: unknown) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(endpoint(path), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        catch: () => new DeviceAuthorizationError({ reason: "unavailable" }),
      });
      const payload = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => new DeviceAuthorizationError({ reason: "invalid" }),
      });
      if (!response.ok) {
        return yield* new DeviceAuthorizationError({ reason: reason(payload) });
      }
      return payload;
    });

  return {
    request: (scope) =>
      Effect.gen(function* () {
        const payload = yield* post("/device/code", {
          client_id: options.clientId,
          ...(scope === undefined ? {} : { scope }),
        });
        const decoded = yield* Effect.try({
          try: () => Schema.decodeUnknownSync(DeviceCodeResponse)(payload),
          catch: () => new DeviceAuthorizationError({ reason: "invalid" }),
        });
        return {
          deviceCode: decoded.device_code,
          userCode: decoded.user_code,
          verificationUri: decoded.verification_uri,
          verificationUriComplete: decoded.verification_uri_complete,
          expiresInSeconds: decoded.expires_in,
          pollingIntervalSeconds: decoded.interval,
        };
      }),
    poll: (deviceCode) =>
      Effect.gen(function* () {
        const payload = yield* post("/device/token", {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: options.clientId,
        });
        const decoded = yield* Effect.try({
          try: () => Schema.decodeUnknownSync(DeviceTokenResponse)(payload),
          catch: () => new DeviceAuthorizationError({ reason: "invalid" }),
        });
        return {
          token: decoded.access_token,
          tokenType: decoded.token_type,
          expiresInSeconds: decoded.expires_in,
          scope: decoded.scope,
        };
      }),
  };
};
