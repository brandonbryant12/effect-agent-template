import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import type {
  AgentRunEvent,
  ApprovalDecision,
  ApprovalId,
} from "@repo/contracts";

export interface RunTranscriptProps {
  readonly events: ReadonlyArray<AgentRunEvent>;
  readonly lastPrompt: string;
  readonly onApproval: (id: ApprovalId, decision: ApprovalDecision) => void;
}

export const RunTranscript = ({
  events,
  lastPrompt,
  onApproval,
}: RunTranscriptProps) => (
  <>
    {lastPrompt && (
      <Message from="user">
        <MessageContent>{lastPrompt}</MessageContent>
      </Message>
    )}
    <div className="event-spine grid gap-4 pb-4">
      {events.map((event) => (
        <div className="relative pl-7" key={`${event.runId}-${event.sequence}`}>
          <span className="absolute left-[3px] top-2 size-2 rounded-full border-2 border-blueprint-paper bg-blueprint ring-1 ring-blueprint" />
          {event._tag === "AssistantTextCompleted" ? (
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{event.text}</MessageResponse>
              </MessageContent>
            </Message>
          ) : (
            <div className="rounded-md border border-line-soft bg-panel px-3 py-2">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-sm text-code">
                  {event._tag.replaceAll(/([A-Z])/g, " $1").trim()}
                </span>
                <span className="font-mono text-[10px] text-ink-subtle">
                  #{event.sequence}
                </span>
              </div>
              {event._tag === "ApprovalRequested" && (
                <div className="mt-2">
                  <p className="text-xs text-ink-muted">{event.safeSummary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => onApproval(event.approvalId, "once")}
                    >
                      Allow once
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onApproval(event.approvalId, "always")}
                    >
                      Allow for session
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onApproval(event.approvalId, "reject")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}
              {event._tag === "RunFailed" && (
                <p className="mt-1 text-xs text-destructive">{event.message}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  </>
);
