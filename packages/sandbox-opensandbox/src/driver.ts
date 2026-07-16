export interface DriverCreateOptions {
  readonly image: string;
  readonly timeoutSeconds: number;
  readonly networkPolicy: {
    readonly defaultAction: "deny";
    readonly egress: ReadonlyArray<{
      readonly action: "allow";
      readonly target: string;
    }>;
  };
  readonly credentialProxy: { readonly enabled: true };
}

export interface DriverCredential {
  readonly name: string;
  readonly value: string;
  readonly binding: {
    readonly schemes: ReadonlyArray<"https">;
    readonly hosts: ReadonlyArray<string>;
    readonly methods: ReadonlyArray<string>;
    readonly paths: ReadonlyArray<string>;
    readonly auth:
      | { readonly type: "bearer" }
      | { readonly type: "apiKey"; readonly headerName: string };
  };
}

export interface DriverSandbox {
  readonly id: string;
  readonly exec: (command: string) => Promise<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly readFile: (path: string) => Promise<string>;
  readonly expose: (port: number) => Promise<string>;
  readonly pause: () => Promise<void>;
  readonly resume: () => Promise<DriverSandbox>;
  readonly installCredential: (credential: DriverCredential) => Promise<void>;
  readonly deleteCredentialVault: () => Promise<void>;
  readonly terminate: () => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface OpenSandboxDriver {
  readonly create: (options: DriverCreateOptions) => Promise<DriverSandbox>;
}
