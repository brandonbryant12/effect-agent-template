import { Redacted, Schema } from "effect";
import type { AppConfigValue } from "./service.js";

const RawConfig = Schema.Struct({
  nodeEnv: Schema.Literals(["development", "test", "production"]),
  databaseUrl: Schema.String,
  serverHost: Schema.String,
  serverPort: Schema.NumberFromString.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: 65_535 }),
  ),
  webOrigin: Schema.String,
  aiProvider: Schema.Literals(["fake", "openai"]),
  sandboxProvider: Schema.Literals(["fake", "opensandbox"]),
  openAiModel: Schema.String,
  openAiApiKey: Schema.optionalKey(Schema.String),
  openSandboxDomain: Schema.String,
  openSandboxApiKey: Schema.optionalKey(Schema.String),
});

type Environment = Readonly<Record<string, string | undefined>>;

export const decodeAppConfig = (environment: Environment): AppConfigValue => {
  const raw = Schema.decodeUnknownSync(RawConfig)({
    nodeEnv: environment.NODE_ENV ?? "development",
    databaseUrl: environment.DATABASE_URL,
    serverHost: environment.SERVER_HOST ?? "0.0.0.0",
    serverPort: environment.SERVER_PORT ?? "3000",
    webOrigin: environment.WEB_ORIGIN ?? "http://localhost:5173",
    aiProvider: environment.AI_PROVIDER ?? "fake",
    sandboxProvider: environment.SANDBOX_PROVIDER ?? "fake",
    openAiModel: environment.OPENAI_MODEL ?? "gpt-5.6",
    openSandboxDomain: environment.OPEN_SANDBOX_DOMAIN ?? "localhost:8080",
    ...(environment.OPENAI_API_KEY
      ? { openAiApiKey: environment.OPENAI_API_KEY }
      : {}),
    ...(environment.OPEN_SANDBOX_API_KEY
      ? { openSandboxApiKey: environment.OPEN_SANDBOX_API_KEY }
      : {}),
  });

  if (raw.aiProvider === "openai" && !raw.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
  }
  if (raw.sandboxProvider === "opensandbox" && !raw.openSandboxApiKey) {
    throw new Error(
      "OPEN_SANDBOX_API_KEY is required when SANDBOX_PROVIDER=opensandbox",
    );
  }

  return {
    nodeEnv: raw.nodeEnv,
    databaseUrl: raw.databaseUrl,
    serverHost: raw.serverHost,
    serverPort: raw.serverPort,
    webOrigin: raw.webOrigin,
    aiProvider: raw.aiProvider,
    sandboxProvider: raw.sandboxProvider,
    openAiModel: raw.openAiModel,
    ...(raw.openAiApiKey
      ? { openAiApiKey: Redacted.make(raw.openAiApiKey) }
      : {}),
    openSandboxDomain: raw.openSandboxDomain,
    ...(raw.openSandboxApiKey
      ? { openSandboxApiKey: Redacted.make(raw.openSandboxApiKey) }
      : {}),
  };
};
