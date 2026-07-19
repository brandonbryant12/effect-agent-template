import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

export interface StatusBeaconProps {
  readonly label: string;
  readonly detail: ReactNode;
  readonly tone?: "ready" | "working" | "failed";
}

export const StatusBeacon = ({
  label,
  detail,
  tone = "ready",
}: StatusBeaconProps) => (
  <Tooltip.Root>
    <Tooltip.Trigger
      aria-label={`${label}: ${tone}`}
      className="inline-flex min-h-7 items-center gap-2 rounded-full border border-border bg-card px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={
          tone === "ready"
            ? "size-1.5 rounded-full bg-success"
            : tone === "working"
              ? "size-1.5 rounded-full bg-warning"
              : "size-1.5 rounded-full bg-destructive"
        }
      />
      {label}
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={8}>
        <Tooltip.Popup className="max-w-64 rounded-md bg-code px-3 py-2 text-xs text-panel shadow-lg data-ending-style:opacity-0 data-starting-style:opacity-0">
          {detail}
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export const StatusBeaconProvider = Tooltip.Provider;
