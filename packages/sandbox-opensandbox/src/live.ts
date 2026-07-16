import {
  ConnectionConfig,
  Sandbox as OpenSandbox,
} from "@alibaba-group/opensandbox";
import {
  SandboxError,
  type SandboxWorkspace,
  type WorkspaceRef,
} from "@repo/sandbox";
import { Effect, Redacted } from "effect";
import type {
  CredentialBindingSpec,
  SandboxCredentialBroker,
} from "./credential-broker.js";
import type {
  DriverCredential,
  DriverSandbox,
  OpenSandboxDriver,
} from "./driver.js";

export interface OpenSandboxOptions {
  readonly domain: string;
  readonly apiKey: Redacted.Redacted;
  readonly image: string;
  readonly allowedHosts: ReadonlyArray<string>;
  readonly timeoutSeconds?: number;
}

export interface OpenSandboxDriverOptions {
  readonly driver: OpenSandboxDriver;
  readonly image: string;
  readonly allowedHosts: ReadonlyArray<string>;
  readonly timeoutSeconds?: number;
}

export interface OpenSandboxAdapter {
  readonly workspace: SandboxWorkspace;
  readonly credentials: SandboxCredentialBroker;
}

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'"'"'`)}'`;

const failure = (operation: string) =>
  new SandboxError({ operation, reason: "unavailable", retryable: true });

const makeSdkDriver = (
  domain: string,
  apiKey: Redacted.Redacted,
): OpenSandboxDriver => {
  const config = new ConnectionConfig({
    domain,
    apiKey: Redacted.value(apiKey),
  });

  const wrap = (sandbox: OpenSandbox): DriverSandbox => {
    let vaultCreated = false;
    return {
      id: sandbox.id,
      exec: async (command) => {
        const execution = await sandbox.commands.run(command);
        return {
          exitCode: execution.exitCode ?? (execution.error ? 1 : 0),
          stdout: execution.logs.stdout.map((line) => line.text).join(""),
          stderr: execution.logs.stderr.map((line) => line.text).join(""),
        };
      },
      writeFile: (path, content) =>
        sandbox.files.writeFiles([{ path, data: content }]),
      readFile: (path) => sandbox.files.readFile(path),
      expose: (port) => sandbox.getEndpointUrl(port),
      pause: () => sandbox.pause(),
      resume: async () => wrap(await sandbox.resume()),
      installCredential: async (credential) => {
        const binding = {
          name: credential.name,
          match: {
            schemes: [...credential.binding.schemes],
            hosts: [...credential.binding.hosts],
            methods: [...credential.binding.methods],
            paths: [...credential.binding.paths],
          },
          auth:
            credential.binding.auth.type === "bearer"
              ? {
                  type: "bearer" as const,
                  credential: credential.name,
                }
              : {
                  type: "apiKey" as const,
                  name: credential.binding.auth.headerName,
                  credential: credential.name,
                },
        };
        const material = {
          name: credential.name,
          source: { type: "inline" as const, value: credential.value },
        };
        if (!vaultCreated) {
          await sandbox.credentialVault.create({
            credentials: [material],
            bindings: [binding],
          });
          vaultCreated = true;
        } else {
          await sandbox.credentialVault.patch({
            credentials: { add: [material] },
            bindings: { add: [binding] },
          });
        }
      },
      deleteCredentialVault: async () => {
        if (vaultCreated) await sandbox.credentialVault.delete();
        vaultCreated = false;
      },
      terminate: () => sandbox.kill(),
      close: () => sandbox.close(),
    };
  };

  return {
    create: async (options) =>
      wrap(
        await OpenSandbox.create({
          connectionConfig: config,
          image: options.image,
          timeoutSeconds: options.timeoutSeconds,
          networkPolicy: {
            defaultAction: options.networkPolicy.defaultAction,
            egress: options.networkPolicy.egress.map((rule) => ({ ...rule })),
          },
          credentialProxy: options.credentialProxy,
        }),
      ),
  };
};

export const makeOpenSandboxWorkspaceWithDriver = (
  options: OpenSandboxDriverOptions,
): OpenSandboxAdapter => {
  const bySession = new Map<string, DriverSandbox>();
  const byId = new Map<string, DriverSandbox>();
  const find = (
    workspace: WorkspaceRef,
    operation: string,
  ): Effect.Effect<DriverSandbox, SandboxError> => {
    const sandbox = byId.get(workspace.id);
    return sandbox
      ? Effect.succeed(sandbox)
      : Effect.fail(
          new SandboxError({
            operation,
            reason: "not-found",
            retryable: false,
          }),
        );
  };

  const workspace: SandboxWorkspace = {
    create: ({ sessionId }) => {
      const existing = bySession.get(sessionId);
      if (existing) return Effect.succeed({ id: existing.id, sessionId });
      return Effect.tryPromise({
        try: () =>
          options.driver.create({
            image: options.image,
            timeoutSeconds: options.timeoutSeconds ?? 3_600,
            networkPolicy: {
              defaultAction: "deny",
              egress: options.allowedHosts.map((target) => ({
                action: "allow",
                target,
              })),
            },
            credentialProxy: { enabled: true },
          }),
        catch: () => failure("create-workspace"),
      }).pipe(
        Effect.map((sandbox) => {
          bySession.set(sessionId, sandbox);
          byId.set(sandbox.id, sandbox);
          return { id: sandbox.id, sessionId };
        }),
      );
    },
    resume: (ref) =>
      find(ref, "resume-workspace").pipe(
        Effect.flatMap((sandbox) =>
          Effect.tryPromise({
            try: () => sandbox.resume(),
            catch: () => failure("resume-workspace"),
          }),
        ),
        Effect.tap((resumed) =>
          Effect.sync(() => {
            byId.set(ref.id, resumed);
            bySession.set(ref.sessionId, resumed);
          }),
        ),
        Effect.asVoid,
      ),
    exec: (ref, command) =>
      find(ref, "exec").pipe(
        Effect.flatMap((sandbox) =>
          Effect.tryPromise({
            try: () => sandbox.exec(command.map(shellQuote).join(" ")),
            catch: () => failure("exec"),
          }),
        ),
      ),
    writeFile: (ref, path, content) =>
      find(ref, "write-file").pipe(
        Effect.flatMap((sandbox) =>
          Effect.tryPromise({
            try: () => sandbox.writeFile(path, content),
            catch: () => failure("write-file"),
          }),
        ),
      ),
    readFile: (ref, path) =>
      find(ref, "read-file").pipe(
        Effect.flatMap((sandbox) =>
          Effect.tryPromise({
            try: () => sandbox.readFile(path),
            catch: () => failure("read-file"),
          }),
        ),
      ),
    expose: (ref, port) =>
      find(ref, "expose-port").pipe(
        Effect.flatMap((sandbox) =>
          Effect.tryPromise({
            try: () => sandbox.expose(port),
            catch: () => failure("expose-port"),
          }),
        ),
        Effect.map((url) => ({ port, url })),
      ),
    pause: (ref) =>
      find(ref, "pause-workspace").pipe(
        Effect.flatMap((sandbox) =>
          Effect.tryPromise({
            try: () => sandbox.pause(),
            catch: () => failure("pause-workspace"),
          }),
        ),
      ),
    terminate: (ref) =>
      find(ref, "terminate-workspace").pipe(
        Effect.flatMap((sandbox) =>
          Effect.tryPromise({
            try: async () => {
              try {
                await sandbox.deleteCredentialVault();
              } finally {
                try {
                  await sandbox.terminate();
                } finally {
                  await sandbox.close();
                }
              }
            },
            catch: () => failure("terminate-workspace"),
          }),
        ),
        Effect.tap(() =>
          Effect.sync(() => {
            byId.delete(ref.id);
            bySession.delete(ref.sessionId);
          }),
        ),
      ),
  };

  const credentials: SandboxCredentialBroker = {
    install: (ref, binding: CredentialBindingSpec, secretRef, secretStore) =>
      find(ref, "install-credential").pipe(
        Effect.flatMap((sandbox) =>
          secretStore.withSecret(secretRef, (material) =>
            Effect.tryPromise({
              try: () =>
                sandbox.installCredential({
                  name: binding.name,
                  value: Redacted.value(material),
                  binding: {
                    schemes: ["https"],
                    hosts: binding.hosts,
                    methods: binding.methods,
                    paths: binding.paths,
                    auth: binding.auth,
                  },
                } satisfies DriverCredential),
              catch: () => failure("install-credential"),
            }),
          ),
        ),
        Effect.mapError((error) =>
          error instanceof SandboxError
            ? error
            : failure("read-credential-for-install"),
        ),
      ),
  };

  return { workspace, credentials };
};

export const makeOpenSandboxWorkspace = (
  options: OpenSandboxOptions,
): OpenSandboxAdapter =>
  makeOpenSandboxWorkspaceWithDriver({
    driver: makeSdkDriver(options.domain, options.apiKey),
    image: options.image,
    allowedHosts: options.allowedHosts,
    ...(options.timeoutSeconds === undefined
      ? {}
      : { timeoutSeconds: options.timeoutSeconds }),
  });
