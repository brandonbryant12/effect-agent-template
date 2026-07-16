import { describe, expect, it } from "vitest";
import { OPENCODE_CLI_VERSION, OPENCODE_SDK_VERSION } from "../src/index.js";

describe("OpenCode version pin", () => {
  it("keeps the sandbox CLI and host SDK identical", () => {
    expect(OPENCODE_CLI_VERSION).toBe(OPENCODE_SDK_VERSION);
  });
});
