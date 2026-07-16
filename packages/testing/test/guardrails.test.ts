import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

describe("repository guardrail contract", () => {
  it("exposes the complete confidence command chain", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(manifest.scripts).toMatchObject({
      build: expect.any(String),
      typecheck: expect.any(String),
      lint: expect.any(String),
      guardrails: expect.any(String),
      "effect:reference:sync": expect.any(String),
      "db:migrate": expect.any(String),
      "compose:up": expect.any(String),
      "compose:down": expect.any(String),
    });
  });

  it("ships durable agent routing and Effect guidance", async () => {
    await expect(access(resolve(root, "AGENTS.md"))).resolves.toBeUndefined();
    await expect(
      access(resolve(root, ".agents/skills/effect/SKILL.md")),
    ).resolves.toBeUndefined();
  });

  it("pins one Effect 4 catalog version", async () => {
    const workspace = await readFile(
      resolve(root, "pnpm-workspace.yaml"),
      "utf8",
    );
    expect(workspace.match(/4\.0\.0-beta\.98/g)).toHaveLength(3);
  });
});
