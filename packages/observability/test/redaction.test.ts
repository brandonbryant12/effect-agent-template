import { describe, expect, it } from "vitest";
import { errorStatus, safeErrorDetail } from "../src/index.js";

describe("safe provider diagnostics", () => {
  it("retains useful metadata while redacting likely credentials", () => {
    const detail = safeErrorDetail({
      name: "ProviderFailure",
      message:
        "request rejected authorization=Bearer top-secret password=hunter2",
      status: 429,
    });

    expect(detail).toContain("ProviderFailure");
    expect(detail).toContain("429");
    expect(detail).not.toContain("top-secret");
    expect(detail).not.toContain("hunter2");
  });

  it("bounds diagnostic detail and reads common status shapes", () => {
    expect(
      safeErrorDetail({ message: "x".repeat(500) })?.length,
    ).toBeLessThanOrEqual(240);
    expect(errorStatus({ $metadata: { httpStatusCode: 403 } })).toBe(403);
  });
});
