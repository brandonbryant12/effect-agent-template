import { describe, expect, it } from "vitest";
import { unusedDependencies } from "../scripts/check-dependencies.js";

describe("dependency hygiene", () => {
  it("reports unused direct dependencies", () => {
    expect(
      unusedDependencies(
        {
          dependencies: {
            effect: "catalog:",
            ulid: "^3.0.0",
          },
        },
        ['import { Effect } from "effect";'],
      ),
    ).toEqual(["ulid"]);
  });

  it("allows type packages and source, CSS, or script references", () => {
    expect(
      unusedDependencies(
        {
          dependencies: {
            "@fontsource-variable/geist": "^5.0.0",
            "@types/react": "^19.0.0",
            tsx: "^4.0.0",
          },
          scripts: { dev: "tsx src/main.ts" },
        },
        ['@import "@fontsource-variable/geist";'],
      ),
    ).toEqual([]);
  });
});
