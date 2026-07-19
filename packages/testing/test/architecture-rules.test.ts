import { describe, expect, it } from "vitest";
import { sourceViolations } from "../../../scripts/check-architecture.js";

describe("architecture source rules", () => {
  it("rejects branded identifier assertions in production", () => {
    expect(
      sourceViolations(
        "apps/web/src/example.ts",
        "const projectId = value as ProjectId;\n",
      ),
    ).toContain(
      "apps/web/src/example.ts: asserts a branded identifier instead of decoding it",
    );
  });

  it("rejects invented empty rows at persistence boundaries", () => {
    expect(
      sourceViolations(
        "packages/core/src/internal/example.ts",
        "return decode(rows[0] ?? {});\n",
      ),
    ).toContain(
      "packages/core/src/internal/example.ts: invents an empty persistence row instead of handling absence",
    );
  });
});
