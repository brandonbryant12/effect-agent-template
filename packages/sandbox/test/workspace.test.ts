import type { AgentSessionId } from "@repo/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeSandboxWorkspaceTest } from "../src/index.js";

describe("SandboxWorkspace contract", () => {
  it("keeps one workspace per session and models its lifecycle", async () => {
    const sandbox = makeSandboxWorkspaceTest();
    const sessionId = "session_01JY0000000000000000000000" as AgentSessionId;
    const first = await Effect.runPromise(sandbox.create({ sessionId }));
    const second = await Effect.runPromise(sandbox.create({ sessionId }));
    expect(second).toEqual(first);

    await Effect.runPromise(
      sandbox.writeFile(first, "/workspace/README.md", "hello"),
    );
    expect(
      await Effect.runPromise(sandbox.readFile(first, "/workspace/README.md")),
    ).toBe("hello");
    expect(
      (await Effect.runPromise(sandbox.exec(first, ["printf", "ok"]))).stdout,
    ).toBe("ok");
    expect(
      (await Effect.runPromise(sandbox.expose(first, 4096))).url,
    ).toContain("4096");

    await Effect.runPromise(sandbox.pause(first));
    await Effect.runPromise(sandbox.resume(first));
    await Effect.runPromise(sandbox.terminate(first));
    await expect(
      Effect.runPromise(sandbox.resume(first)),
    ).rejects.toMatchObject({
      _tag: "SandboxError",
      reason: "terminated",
    });
  });
});
