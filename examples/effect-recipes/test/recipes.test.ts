import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { decodeCreateProject } from "../src/schema-boundary.js";
import { greet, GreetingTest } from "../src/services-layers.js";

describe("Effect 4 recipes", () => {
  it("decodes a boundary before domain use", () => {
    expect(decodeCreateProject({ id: "project_1", name: "  Demo  " })).toEqual({
      id: "project_1",
      name: "Demo",
    });
  });

  it("substitutes a capability with a Layer", async () => {
    await expect(
      Effect.runPromise(Effect.provide(greet("agent"), GreetingTest)),
    ).resolves.toBe("Hello, agent");
  });
});
