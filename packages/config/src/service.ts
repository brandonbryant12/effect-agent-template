import { Context, Redacted } from "effect";

export type NodeEnvironment = "development" | "test" | "production";
export type AiProvider = "fake" | "openai";
export type SandboxProvider = "fake" | "opensandbox";

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
}

export class AppConfig extends Context.Service<AppConfig, AppConfigValue>()(
  "repo/AppConfig",
) {}
