import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoginPanel } from "@/features/auth/login-panel";
import { runMachine } from "@/features/agent-run/run-machine";
import { agentClient, authClient, effectClient } from "@/lib/client";
import { projectQueryOptions, taskQueryOptions } from "@repo/client-react";
import type {
  AgentRun,
  AgentRunEvent,
  ApprovalDecision,
  ApprovalId,
  CredentialId,
  ProjectId,
} from "@repo/contracts";
import { CommandId } from "@repo/contracts";
import { Schema } from "effect";
import { StatusBeacon, StatusBeaconProvider } from "@repo/ui";
import { useMachine } from "@xstate/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  KeyRound,
  ListChecks,
  LogOut,
  Plus,
  Radio,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

const terminal = (event: AgentRunEvent) =>
  event._tag === "RunCompleted" ||
  event._tag === "RunFailed" ||
  event._tag === "RunCancelled";

const EventSpine = ({
  events,
  onApproval,
}: {
  events: ReadonlyArray<AgentRunEvent>;
  onApproval: (id: ApprovalId, decision: ApprovalDecision) => void;
}) => (
  <div className="event-spine grid gap-4 pb-4">
    {events.map((event) => (
      <div className="relative pl-7" key={`${event.runId}-${event.sequence}`}>
        <span className="absolute left-[3px] top-2 size-2 rounded-full border-2 border-[#f3f6f7] bg-[#325f73] ring-1 ring-[#325f73]" />
        {event._tag === "AssistantTextCompleted" ? (
          <Message from="assistant">
            <MessageContent>
              <MessageResponse>{event.text}</MessageResponse>
            </MessageContent>
          </Message>
        ) : (
          <div className="rounded-md border border-[#d5e0e4] bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium text-sm text-[#253941]">
                {event._tag.replaceAll(/([A-Z])/g, " $1").trim()}
              </span>
              <span className="font-mono text-[10px] text-[#71858d]">
                #{event.sequence}
              </span>
            </div>
            {event._tag === "ApprovalRequested" && (
              <div className="mt-2">
                <p className="text-xs text-[#637981]">{event.safeSummary}</p>
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
              <p className="mt-1 text-xs text-red-700">{event.message}</p>
            )}
          </div>
        )}
      </div>
    ))}
  </div>
);

const Workbench = ({ userName }: { userName: string }) => {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery(projectQueryOptions(effectClient));
  const [selectedId, setSelectedId] = useState<ProjectId>();
  const [run, setRun] = useState<AgentRun>();
  const [events, setEvents] = useState<ReadonlyArray<AgentRunEvent>>([]);
  const [lastPrompt, setLastPrompt] = useState("");
  const [credentialNotice, setCredentialNotice] = useState("");
  const [sessionCredentialIds, setSessionCredentialIds] = useState<
    ReadonlyArray<CredentialId>
  >([]);
  const runToken = useRef(0);
  const [runState, sendRun] = useMachine(runMachine);
  const projects = projectsQuery.data ?? [];
  const selected =
    projects.find((project) => project.id === selectedId) ?? projects[0];
  useEffect(
    () => () => {
      runToken.current += 1;
    },
    [],
  );
  const tasksQuery = useQuery({
    ...taskQueryOptions(effectClient, selected?.id ?? ("" as ProjectId)),
    enabled: Boolean(selected),
  });

  const createProject = useMutation({
    mutationFn: (name: string) =>
      agentClient.projects.create({ name, description: null }),
    onSuccess: async (project) => {
      setSelectedId(project.id);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const createTask = useMutation({
    mutationFn: (title: string) =>
      agentClient.tasks.create(selected!.id, { title, description: null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["projects", selected?.id, "tasks"],
      });
    },
  });

  const startRun = async (prompt: string) => {
    if (!selected || !prompt.trim()) return;
    const token = ++runToken.current;
    setLastPrompt(prompt);
    setEvents([]);
    sendRun({ type: "START" });
    try {
      const conversation = await agentClient.conversations.create({
        projectId: selected.id,
        title: prompt.slice(0, 80),
      });
      const session = await agentClient.sessions.create({
        projectId: selected.id,
        conversationId: conversation.id,
        credentialIds: sessionCredentialIds,
      });
      const admitted = await agentClient.runs.start(
        session.id,
        Schema.decodeUnknownSync(CommandId)(
          `command_${crypto.randomUUID().replaceAll("-", "").slice(0, 26).toUpperCase()}`,
        ),
        {
          projectId: selected.id,
          conversationId: conversation.id,
          taskId: null,
          prompt,
        },
      );
      setRun(admitted);
      sendRun({ type: "CONNECTED" });
      let cursor = 0;
      let done = false;
      while (!done && runToken.current === token) {
        let received = false;
        for await (const event of agentClient.runs.events(
          admitted.id,
          cursor,
        )) {
          received = true;
          cursor = event.sequence;
          setEvents((current) => [...current, event]);
          if (event._tag === "ApprovalRequested") {
            sendRun({ type: "APPROVAL_REQUIRED" });
          }
          if (event._tag === "RunCompleted") sendRun({ type: "COMPLETED" });
          if (event._tag === "RunFailed") sendRun({ type: "FAILED" });
          if (terminal(event)) done = true;
        }
        if (!done) {
          if (!received) sendRun({ type: "DISCONNECTED" });
          await new Promise((resolve) => setTimeout(resolve, 900));
          if (runToken.current === token) sendRun({ type: "CONNECTED" });
        }
      }
    } catch {
      sendRun({ type: "FAILED" });
    }
  };

  const replyApproval = async (id: ApprovalId, decision: ApprovalDecision) => {
    await agentClient.approvals.reply(id, decision);
    sendRun({ type: decision === "reject" ? "REJECTED" : "APPROVED" });
  };

  const cancelRun = async () => {
    if (!run) return;
    runToken.current += 1;
    await agentClient.runs.cancel(run.id);
    sendRun({ type: "CANCEL" });
  };

  const uploadCredential = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const provider = String(data.get("provider")) as
      "openai" | "anthropic" | "github" | "custom";
    const label = String(data.get("label"));
    const secret = String(data.get("secret"));
    if (!label || !secret) return;
    setCredentialNotice("Uploading…");
    const pending = await agentClient.credentials.beginUpload({
      provider,
      label,
    });
    const response = await fetch(pending.upload.url, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "text/plain",
        "x-upload-token": pending.upload.token,
      },
      body: secret,
    });
    if (!response.ok) throw new Error("Credential upload was rejected");
    form.reset();
    setSessionCredentialIds((current) => [
      ...new Set([...current, pending.credential.id]),
    ]);
    setCredentialNotice("Credential stored. The value cannot be read back.");
  };

  return (
    <StatusBeaconProvider>
      <TooltipProvider>
        <main className="min-h-screen bg-[#f3f6f7] text-[#16252d]">
          <header className="session-tape flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-[#c8d6db] px-4 py-2 md:px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-7 items-center justify-center rounded-md bg-[#325f73] text-white">
                <Sparkles className="size-3.5" />
              </div>
              <span className="font-semibold tracking-[-0.02em]">
                Agent Ledger
              </span>
              <span className="hidden font-mono text-[10px] uppercase tracking-widest text-[#71858d] sm:inline">
                reference workbench
              </span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBeacon
                detail="Authenticated browser session through Better Auth."
                label="auth"
              />
              <StatusBeacon
                detail="Durable state and queue leases are stored in Postgres."
                label="durable"
              />
              <StatusBeacon
                detail={`Run state: ${String(runState.value)}`}
                label="worker"
                tone={
                  runState.matches("failed")
                    ? "failed"
                    : runState.matches("running")
                      ? "working"
                      : "ready"
                }
              />
              <Button
                aria-label="Sign out"
                onClick={() => authClient.signOut()}
                size="icon-sm"
                variant="ghost"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>

          <div className="ledger-layout grid min-h-[calc(100vh-48px)] lg:grid-cols-[220px_minmax(280px,0.72fr)_minmax(420px,1.28fr)]">
            <aside className="border-b border-[#c8d6db] bg-[#e8eff1] p-4 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#637981]">
                  Projects
                </span>
                <Plus className="size-3.5 text-[#637981]" />
              </div>
              <div className="grid gap-1.5">
                {projects.map((project) => (
                  <button
                    className={`flex items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors ${selected?.id === project.id ? "bg-[#325f73] text-white" : "hover:bg-white/70"}`}
                    key={project.id}
                    onClick={() => setSelectedId(project.id)}
                  >
                    <span className="truncate">{project.name}</span>
                    <ChevronRight className="size-3.5 opacity-60" />
                  </button>
                ))}
              </div>
              <form
                className="mt-4 flex gap-2"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const name = String(new FormData(form).get("name"));
                  if (name) createProject.mutate(name);
                  form.reset();
                }}
              >
                <Input
                  className="h-8 bg-white text-xs"
                  name="name"
                  placeholder="New project"
                />
                <Button
                  aria-label="Create project"
                  size="icon-sm"
                  variant="outline"
                >
                  <Plus className="size-3.5" />
                </Button>
              </form>
              <div className="mt-8 border-t border-[#c8d6db] pt-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#71858d]">
                  Signed in
                </div>
                <div className="mt-1 truncate text-xs font-medium">
                  {userName}
                </div>
              </div>
            </aside>

            <section className="border-b border-[#c8d6db] bg-white p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#c64f36]">
                    Active project
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                    {selected?.name ?? "Start a project"}
                  </h1>
                </div>
                <Badge
                  className="border-[#c8d6db] bg-transparent text-[#325f73]"
                  variant="outline"
                >
                  {tasksQuery.data?.length ?? 0} tasks
                </Badge>
              </div>
              <div className="mt-6 flex items-center gap-2 border-b border-[#d5e0e4] pb-3">
                <ListChecks className="size-4 text-[#325f73]" />
                <span className="text-sm font-semibold">Task field</span>
              </div>
              <div className="mt-3 grid gap-2">
                {tasksQuery.data?.map((task) => (
                  <div
                    className="group rounded-lg border border-[#d5e0e4] p-3 hover:border-[#8ea9b4]"
                    key={task.id}
                  >
                    <div className="flex items-start gap-3">
                      {task.status === "done" ? (
                        <CheckCircle2 className="mt-0.5 size-4 text-[#2f7d65]" />
                      ) : (
                        <CircleDashed className="mt-0.5 size-4 text-[#71858d]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{task.title}</div>
                        <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[#71858d]">
                          {task.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {selected && !tasksQuery.data?.length && (
                  <div className="rounded-lg border border-dashed border-[#b6c8cf] p-6 text-center text-sm text-[#637981]">
                    Add the first task to define the work.
                  </div>
                )}
              </div>
              {selected && (
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const title = String(new FormData(form).get("title"));
                    if (title) createTask.mutate(title);
                    form.reset();
                  }}
                >
                  <Input name="title" placeholder="Add a task" />
                  <Button className="bg-[#325f73] hover:bg-[#284e5e]">
                    Add
                  </Button>
                </form>
              )}
              <div className="mt-8 rounded-lg bg-[#f3f6f7] p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4 text-[#c64f36]" /> Personal
                  credentials
                </div>
                <p className="mt-2 text-xs leading-5 text-[#637981]">
                  Secret values use the narrow broker and never return through
                  the application API.
                </p>
                <form
                  className="mt-3 grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void uploadCredential(event.currentTarget).catch(() =>
                      setCredentialNotice(
                        "Upload failed. The secret was not retained.",
                      ),
                    );
                  }}
                >
                  <select
                    className="h-9 rounded-md border border-[#b6c8cf] bg-white px-3 text-xs"
                    name="provider"
                    defaultValue="openai"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="github">GitHub</option>
                    <option value="custom">Custom</option>
                  </select>
                  <Input name="label" placeholder="Credential label" required />
                  <Input
                    autoComplete="off"
                    name="secret"
                    placeholder="Secret value"
                    required
                    type="password"
                  />
                  <Button type="submit" variant="outline">
                    Store credential
                  </Button>
                  {credentialNotice && (
                    <p
                      aria-live="polite"
                      className="text-[11px] leading-4 text-[#637981]"
                    >
                      {credentialNotice}
                    </p>
                  )}
                </form>
              </div>
            </section>

            <section className="flex min-h-[650px] flex-col bg-[#f8fafb]">
              <div className="flex items-center justify-between border-b border-[#d5e0e4] px-5 py-4">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#637981]">
                    Session record
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {run ? `Run ${run.id.slice(-8)}` : "No run admitted"}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[#637981]">
                  <Radio className="size-3.5" /> {String(runState.value)}
                  {run &&
                    !runState.matches("completed") &&
                    !runState.matches("failed") &&
                    !runState.matches("cancelled") && (
                      <Button size="sm" variant="ghost" onClick={cancelRun}>
                        Cancel
                      </Button>
                    )}
                </div>
              </div>
              <Conversation className="min-h-0 flex-1">
                <ConversationContent className="mx-auto w-full max-w-3xl gap-5 p-5">
                  {!events.length && !lastPrompt ? (
                    <ConversationEmptyState
                      description="Ask the agent to implement, inspect, or explain work in this project."
                      icon={<Sparkles className="size-6" />}
                      title="The session record is empty"
                    />
                  ) : (
                    <>
                      {lastPrompt && (
                        <Message from="user">
                          <MessageContent>{lastPrompt}</MessageContent>
                        </Message>
                      )}
                      <EventSpine events={events} onApproval={replyApproval} />
                    </>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
              <div className="border-t border-[#d5e0e4] bg-white p-4">
                <PromptInput
                  className="mx-auto max-w-3xl rounded-xl border-[#b6c8cf] bg-white shadow-sm"
                  onSubmit={async ({ text }) => startRun(text)}
                >
                  <PromptInputBody>
                    <PromptInputTextarea
                      disabled={
                        !selected ||
                        (!runState.matches("idle") &&
                          !runState.matches("completed") &&
                          !runState.matches("failed") &&
                          !runState.matches("cancelled"))
                      }
                      name="message"
                      placeholder={
                        selected
                          ? "Describe the work for this agent session…"
                          : "Create a project first"
                      }
                    />
                  </PromptInputBody>
                  <PromptInputFooter>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#71858d]">
                      One sandbox / session
                    </span>
                    <PromptInputSubmit
                      className="bg-[#c64f36] text-white hover:bg-[#ad402b]"
                      status={
                        runState.matches("running") ||
                        runState.matches("connecting") ||
                        runState.matches("reconnecting")
                          ? "streaming"
                          : runState.matches("failed")
                            ? "error"
                            : "ready"
                      }
                    />
                  </PromptInputFooter>
                </PromptInput>
              </div>
            </section>
          </div>
        </main>
      </TooltipProvider>
    </StatusBeaconProvider>
  );
};

export const App = () => {
  const session = authClient.useSession();
  if (session.isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f3f6f7] text-sm text-[#637981]">
        Reading session…
      </div>
    );
  }
  if (!session.data?.user) return <LoginPanel />;
  return (
    <Workbench userName={session.data.user.name || session.data.user.email} />
  );
};
