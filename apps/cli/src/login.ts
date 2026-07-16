import type {
  DeviceAuthorizationClient,
  DeviceAuthorizationError,
} from "@repo/auth";
import type { AuthTokenStore, ClientAuthError } from "@repo/client";
import { Effect } from "effect";

export interface DeviceLoginDependencies {
  readonly device: DeviceAuthorizationClient;
  readonly tokenStore: AuthTokenStore;
  readonly presentVerification: (
    verificationUriComplete: string,
    userCode: string,
  ) => Effect.Effect<void>;
  readonly sleep: (seconds: number) => Effect.Effect<void>;
}

export const loginWithDevice = (
  dependencies: DeviceLoginDependencies,
): Effect.Effect<void, DeviceAuthorizationError | ClientAuthError> =>
  Effect.gen(function* () {
    const authorization = yield* dependencies.device.request("agent");
    yield* dependencies.presentVerification(
      authorization.verificationUriComplete,
      authorization.userCode,
    );

    const poll = (
      interval: number,
    ): Effect.Effect<string, DeviceAuthorizationError> =>
      dependencies.device.poll(authorization.deviceCode).pipe(
        Effect.map((token) => token.token),
        Effect.catchTag("DeviceAuthorizationError", (error) => {
          if (error.reason === "pending") {
            return dependencies
              .sleep(interval)
              .pipe(Effect.andThen(Effect.suspend(() => poll(interval))));
          }
          if (error.reason === "slow-down") {
            const slower = interval + 5;
            return dependencies
              .sleep(slower)
              .pipe(Effect.andThen(Effect.suspend(() => poll(slower))));
          }
          return Effect.fail(error);
        }),
      );

    const token = yield* poll(authorization.pollingIntervalSeconds);
    yield* dependencies.tokenStore.set(token);
  });
