import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

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
    for (const gate of [
      "lint",
      "typecheck",
      "architecture:check",
      "dependencies:check",
      "design:lint",
      "template:check",
      "test",
    ]) {
      expect(manifest.scripts?.guardrails).toContain(`pnpm ${gate}`);
    }
  });

  it("ships durable agent routing and Effect guidance", async () => {
    await expect(access(resolve(root, "AGENTS.md"))).resolves.toBeUndefined();
    await expect(
      access(resolve(root, ".agents/skills/effect/SKILL.md")),
    ).resolves.toBeUndefined();
  });

  it("pins one exact Effect 4 catalog version", async () => {
    const workspace = await readFile(
      resolve(root, "pnpm-workspace.yaml"),
      "utf8",
    );
    const catalog = workspace.split(/^catalog:$/m)[1] ?? "";
    const versions = [...catalog.matchAll(/^\s+"?[^:"]+"?:\s*(\S+)$/gm)].map(
      (entry) => entry[1],
    );
    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(new Set(versions).size).toBe(1);
    expect(versions[0]).toMatch(/^\d/);
  });

  it("runs the complete PostgreSQL matrix without duplicate CI gates", async () => {
    const workflow = await readFile(
      resolve(root, ".github/workflows/ci.yml"),
      "utf8",
    );
    for (const path of [
      "packages/db/test",
      "apps/server/test",
      "apps/worker/test",
      "packages/queue/test",
    ]) {
      expect(workflow).toContain(path);
    }
    expect(workflow).toContain("RUN_POSTGRES_TESTS");
    expect(workflow).not.toMatch(/^\s*- run: pnpm template:check\s*$/m);
  });
});
