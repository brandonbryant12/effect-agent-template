import type { AgentClient } from "@repo/client";
import { skipToken } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { graphRunQueryOptions, taskQueryOptions } from "../src/options.js";

const client = {} as AgentClient;

describe("query options", () => {
  it("skips task requests until a project is selected", () => {
    expect(taskQueryOptions(client, undefined).queryFn).toBe(skipToken);
  });

  it("skips graph-run requests until a run is selected", () => {
    expect(graphRunQueryOptions(client, undefined).queryFn).toBe(skipToken);
  });
});
