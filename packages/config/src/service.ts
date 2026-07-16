import { Context, Redacted } from "effect";

export type NodeEnvironment = "development" | "test" | "production";
export type AiProvider = "fake" | "openai";
export type SandboxProvider = "fake" | "opensandbox";
export type SecretStoreProvider = "memory" | "aws";

export interface AppConfigValue {
  readonly nodeEnv: NodeEnvironment;
  readonly databaseUrl: string;
  readonly serverHost: string;
  readonly serverPort: number;
  readonly webOrigin: string;
  readonly aiProvider: AiProvider;
  readonly sandboxProvider: SandboxProvider;
  readonly openAiModel: string;
  readonly openAiApiKey?: Redacted.Redacted;
  readonly openSandboxDomain: string;
  readonly openSandboxApiKey?: Redacted.Redacted;
  readonly betterAuthSecret: Redacted.Redacted;
  readonly credentialUploadSigningKey: Redacted.Redacted;
  readonly secretStoreProvider: SecretStoreProvider;
  readonly awsRegion: string;
  readonly secretNamePrefix: string;
}

export class AppConfig extends Context.Service<AppConfig, AppConfigValue>()(
  "repo/AppConfig",
) {}
