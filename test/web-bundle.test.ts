import { describe, expect, it } from "vitest";
import { entryBundleViolation } from "../scripts/check-web-bundle.js";

describe("web entry bundle budget", () => {
  it("reports an entry JavaScript file over 750 KiB", () => {
    expect(
      entryBundleViolation(
        { "index.html": { file: "assets/index.js", isEntry: true } },
        { "assets/index.js": 768_001 },
        768_000,
      ),
    ).toBe("assets/index.js is 768001 bytes; entry budget is 768000 bytes");
  });

  it("accepts an entry JavaScript file within budget", () => {
    expect(
      entryBundleViolation(
        { "index.html": { file: "assets/index.js", isEntry: true } },
        { "assets/index.js": 500_000 },
        768_000,
      ),
    ).toBeUndefined();
  });
});
