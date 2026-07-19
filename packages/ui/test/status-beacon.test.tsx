import { Children, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { StatusBeacon } from "../src/status-beacon.js";

const indicatorClass = (tone: "ready" | "working" | "failed"): string => {
  const root = StatusBeacon({ label: "worker", detail: "detail", tone });
  const rootChildren = Children.toArray(
    (root.props as { readonly children: ReactNode }).children,
  );
  const trigger = rootChildren[0] as ReactElement<{
    readonly children: ReactNode;
  }>;
  const triggerChildren = Children.toArray(trigger.props.children);
  const indicator = triggerChildren[0] as ReactElement<{
    readonly className: string;
  }>;
  return indicator.props.className;
};

describe("StatusBeacon", () => {
  it.each([
    ["ready", "bg-success"],
    ["working", "bg-warning"],
    ["failed", "bg-destructive"],
  ] as const)("uses the semantic %s tone", (tone, expected) => {
    expect(indicatorClass(tone)).toContain(expected);
  });
});
