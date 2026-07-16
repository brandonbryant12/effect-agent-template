import { Effect } from "effect";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileTokenStore } from "../src/auth-store.js";

describe("portable CLI token store", () => {
  it("persists bearer tokens in an owner-only file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "effect-agent-token-"));
    const path = join(directory, "nested", "token");
    const store = createFileTokenStore(path);
    await Effect.runPromise(store.set("secret-token"));
    expect(await Effect.runPromise(store.get)).toBe("secret-token");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await Effect.runPromise(store.clear);
    expect(await Effect.runPromise(store.get)).toBeUndefined();
  });
});
