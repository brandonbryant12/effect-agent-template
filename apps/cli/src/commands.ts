import type { AgentClient } from "@repo/client";
import {
  AgentSessionId,
  CommandId,
  ConversationId,
  CredentialProvider,
  ProjectId,
  TaskId,
  TaskStatus,
} from "@repo/contracts";
import { Effect, Schema, Stream } from "effect";
import { ulid } from "ulid";

export type CliCommand =
  | { readonly _tag: "Help" }
  | { readonly _tag: "ProjectsList" }
  | { readonly _tag: "ProjectsCreate"; readonly name: string }
  | { readonly _tag: "TasksList"; readonly projectId: ProjectId }
  | {
      readonly _tag: "TasksCreate";
      readonly projectId: ProjectId;
      readonly title: string;
    }
  | {
      readonly _tag: "TasksTransition";
      readonly taskId: TaskId;
      readonly status: TaskStatus;
    }
  | {
      readonly _tag: "SessionsCreate";
      readonly projectId: ProjectId;
      readonly conversationId: ConversationId;
    }
  | {
      readonly _tag: "RunsStart";
      readonly sessionId: AgentSessionId;
      readonly projectId: ProjectId;
      readonly conversationId: ConversationId;
      readonly taskId: TaskId | null;
      readonly prompt: string;
    }
  | {
      readonly _tag: "CredentialsAdd";
      readonly provider: CredentialProvider;
      readonly label: string;
    };

const decode = <S extends Schema.ConstraintDecoder<unknown, never>>(
  schema: S,
  value: string | undefined,
): S["Type"] | undefined => {
  try {
    return Schema.decodeUnknownSync(schema)(value);
  } catch {
    return undefined;
  }
};

export const parseCommand = (args: ReadonlyArray<string>): CliCommand => {
  const [resource, action, ...values] = args;
  if (resource === "projects" && action === "list" && values.length === 0) {
    return { _tag: "ProjectsList" };
  }
  if (resource === "projects" && action === "create" && values[0]) {
    return { _tag: "ProjectsCreate", name: values.join(" ") };
  }
  if (resource === "tasks" && action === "list") {
    const projectId = decode(ProjectId, values[0]);
    return projectId ? { _tag: "TasksList", projectId } : { _tag: "Help" };
  }
  if (resource === "tasks" && action === "create") {
    const projectId = decode(ProjectId, values[0]);
    return projectId && values[1]
      ? { _tag: "TasksCreate", projectId, title: values.slice(1).join(" ") }
      : { _tag: "Help" };
  }
  if (resource === "tasks" && action === "transition") {
    const taskId = decode(TaskId, values[0]);
    const status = decode(TaskStatus, values[1]);
    return taskId && status
      ? { _tag: "TasksTransition", taskId, status }
      : { _tag: "Help" };
  }
  if (resource === "sessions" && action === "create") {
    const projectId = decode(ProjectId, values[0]);
    const conversationId = decode(ConversationId, values[1]);
    return projectId && conversationId
      ? { _tag: "SessionsCreate", projectId, conversationId }
      : { _tag: "Help" };
  }
  if (resource === "runs" && action === "start") {
    const sessionId = decode(AgentSessionId, values[0]);
    const projectId = decode(ProjectId, values[1]);
    const conversationId = decode(ConversationId, values[2]);
    const prompt = values.slice(3).join(" ");
    return sessionId && projectId && conversationId && prompt
      ? {
          _tag: "RunsStart",
          sessionId,
          projectId,
          conversationId,
          taskId: null,
          prompt,
        }
      : { _tag: "Help" };
  }
  if (resource === "credentials" && action === "add") {
    const provider = decode(CredentialProvider, values[0]);
    return provider && values[1]
      ? { _tag: "CredentialsAdd", provider, label: values.slice(1).join(" ") }
      : { _tag: "Help" };
  }
  return { _tag: "Help" };
};

export interface CliCommandDependencies {
  readonly client: AgentClient;
  readonly output: (value: unknown) => Effect.Effect<void>;
  readonly readSecret: (prompt: string) => Effect.Effect<string>;
  readonly uploadSecret: (
    upload: { readonly url: string; readonly token: string },
    secret: string,
  ) => Effect.Effect<void, unknown>;
}

export const help = `effect-agent commands:
  login
  projects list
  projects create <name>
  tasks list <project-id>
  tasks create <project-id> <title>
  tasks transition <task-id> <todo|in-progress|blocked|done|cancelled>
  sessions create <project-id> <conversation-id>
  runs start <session-id> <project-id> <conversation-id> <prompt>
  credentials add <openai|anthropic|github|custom> <label>`;

export const runCommand = (
  command: CliCommand,
  dependencies: CliCommandDependencies,
) => {
  const print = (effect: Effect.Effect<unknown, unknown>) =>
    effect.pipe(Effect.flatMap(dependencies.output));
  switch (command._tag) {
    case "Help":
      return dependencies.output(help);
    case "ProjectsList":
      return print(dependencies.client.projects.list());
    case "ProjectsCreate":
      return print(
        dependencies.client.projects.create({
          name: command.name,
          description: null,
        }),
      );
    case "TasksList":
      return print(dependencies.client.tasks.list(command.projectId));
    case "TasksCreate":
      return print(
        dependencies.client.tasks.create(command.projectId, {
          title: command.title,
          description: null,
        }),
      );
    case "TasksTransition":
      return print(
        dependencies.client.tasks.transition(command.taskId, command.status),
      );
    case "SessionsCreate":
      return print(
        dependencies.client.sessions.create({
          projectId: command.projectId,
          conversationId: command.conversationId,
        }),
      );
    case "RunsStart":
      return dependencies.client.runs
        .start(
          command.sessionId,
          Schema.decodeUnknownSync(CommandId)(`command_${ulid()}`),
          {
            projectId: command.projectId,
            conversationId: command.conversationId,
            taskId: command.taskId,
            prompt: command.prompt,
          },
        )
        .pipe(
          Effect.tap(dependencies.output),
          Effect.flatMap((run) =>
            dependencies.client.runs
              .events(run.id)
              .pipe(Stream.runForEach(dependencies.output)),
          ),
        );
    case "CredentialsAdd":
      return Effect.gen(function* () {
        const pending = yield* dependencies.client.credentials.beginUpload({
          provider: command.provider,
          label: command.label,
        });
        const secret = yield* dependencies.readSecret("Credential value: ");
        yield* dependencies.uploadSecret(pending.upload, secret);
        yield* dependencies.output({
          credentialId: pending.credential.id,
          status: "uploaded",
        });
      });
  }
};
