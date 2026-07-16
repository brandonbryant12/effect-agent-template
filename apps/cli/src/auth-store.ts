import { type AuthTokenStore, ClientAuthError } from "@repo/client";
import { Effect } from "effect";
import { execFile } from "node:child_process";

type Execute = (
  command: string,
  args: ReadonlyArray<string>,
) => Promise<{ readonly stdout: string }>;

const execute: Execute = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, [...args], (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout });
    });
  });

export interface KeychainTokenStoreOptions {
  readonly service: string;
  readonly account: string;
  readonly execute?: Execute;
}

export const createMacOsKeychainTokenStore = (
  options: KeychainTokenStoreOptions,
): AuthTokenStore => {
  const run = options.execute ?? execute;
  const unavailable = () =>
    new ClientAuthError({ reason: "token-store-unavailable" });
  return {
    get: Effect.tryPromise({
      try: () =>
        run("security", [
          "find-generic-password",
          "-s",
          options.service,
          "-a",
          options.account,
          "-w",
        ]).then(({ stdout }) => stdout.trim() || undefined),
      catch: unavailable,
    }),
    set: (token) =>
      Effect.tryPromise({
        try: () =>
          run("security", [
            "add-generic-password",
            "-U",
            "-s",
            options.service,
            "-a",
            options.account,
            "-w",
            token,
          ]).then(() => undefined),
        catch: unavailable,
      }),
    clear: Effect.tryPromise({
      try: () =>
        run("security", [
          "delete-generic-password",
          "-s",
          options.service,
          "-a",
          options.account,
        ]).then(() => undefined),
      catch: unavailable,
    }),
  };
};
