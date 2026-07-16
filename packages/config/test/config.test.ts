import { describe, expect, it } from "vitest";
import { decodeAppConfig } from "../src/index.js";

describe("application configuration", () => {
  it("decodes environment input once into typed values", () => {
    const config = decodeAppConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://agent:agent@localhost:5432/agent",
      SERVER_HOST: "127.0.0.1",
      SERVER_PORT: "3001",
      WEB_ORIGIN: "http://localhost:5173",
      AI_PROVIDER: "fake",
      SANDBOX_PROVIDER: "fake",
      OPENAI_MODEL: "gpt-5.6",
      OPEN_SANDBOX_DOMAIN: "localhost:8080",
    });

    expect(config.serverPort).toBe(3001);
    expect(config.aiProvider).toBe("fake");
  });

  it("rejects a live provider without its credential", () => {
    expect(() =>
      decodeAppConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://agent:agent@localhost:5432/agent",
        SERVER_HOST: "0.0.0.0",
        SERVER_PORT: "3000",
        WEB_ORIGIN: "https://example.com",
        AI_PROVIDER: "openai",
        SANDBOX_PROVIDER: "fake",
        OPENAI_MODEL: "gpt-5.6",
        OPEN_SANDBOX_DOMAIN: "localhost:8080",
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("does not require server-only secrets in a production worker config", () => {
    const config = decodeAppConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://agent:agent@localhost:5432/agent",
      SANDBOX_PROVIDER: "opensandbox",
      OPEN_SANDBOX_API_KEY: "sandbox-key",
      SECRET_STORE_PROVIDER: "aws",
    });
    expect(config.sandboxProvider).toBe("opensandbox");
  });
});
