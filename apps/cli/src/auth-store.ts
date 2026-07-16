import { type AuthTokenStore, ClientAuthError } from "@repo/client";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

export const createFileTokenStore = (path: string): AuthTokenStore => {
  const unavailable = () =>
    new ClientAuthError({ reason: "token-store-unavailable" });
  return {
    get: Effect.tryPromise({
      try: () =>
        readFile(path, "utf8")
          .then((value) => value.trim() || undefined)
          .catch((error: NodeJS.ErrnoException) =>
            error.code === "ENOENT" ? undefined : Promise.reject(error),
          ),
      catch: unavailable,
    }),
    set: (token) =>
      Effect.tryPromise({
        try: async () => {
          await mkdir(dirname(path), { recursive: true, mode: 0o700 });
          await writeFile(path, `${token}\n`, { mode: 0o600 });
          await chmod(path, 0o600);
        },
        catch: unavailable,
      }),
    clear: Effect.tryPromise({
      try: () => rm(path, { force: true }),
      catch: unavailable,
    }),
  };
};

export const createPlatformTokenStore = (
  options: Omit<KeychainTokenStoreOptions, "execute">,
): AuthTokenStore =>
  process.platform === "darwin"
    ? createMacOsKeychainTokenStore(options)
    : createFileTokenStore(
        join(homedir(), ".config", "effect-agent", "access-token"),
      );
