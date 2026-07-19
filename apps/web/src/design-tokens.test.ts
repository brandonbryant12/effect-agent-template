import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("DESIGN.md token drift", () => {
  it("declares every DESIGN.md color in the runtime CSS theme", async () => {
    const design = await readFile(resolve(root, "DESIGN.md"), "utf8");
    const css = (
      await readFile(resolve(root, "src/styles.css"), "utf8")
    ).toLowerCase();
    const colors = design.match(/^colors:\n([\s\S]*?)^typography:/m)?.[1] ?? "";
    const tokens = [
      ...colors.matchAll(/^ {2}([\w-]+): "(#[0-9A-Fa-f]{6})"$/gm),
    ];
    expect(tokens.length).toBeGreaterThanOrEqual(14);
    for (const [, name, hex] of tokens) {
      expect(css, `token ${name} (${hex}) missing from styles.css`).toContain(
        (hex ?? "").toLowerCase(),
      );
    }
  });
});
