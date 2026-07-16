import { Context } from "effect";

export interface CorrelationContextValue {
  readonly requestId?: string;
  readonly projectId?: string;
  readonly taskId?: string;
  readonly conversationId?: string;
  readonly runId?: string;
  readonly jobId?: string;
  readonly providerRequestId?: string;
}

export const CorrelationContext = Context.Reference<CorrelationContextValue>(
  "repo/CorrelationContext",
  { defaultValue: () => ({}) },
);
