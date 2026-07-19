import type { CreateTask, Task, TaskId, TaskStatus } from "@repo/contracts";
import { TaskId as TaskIdSchema, Timestamp } from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import { PersistenceError } from "./errors.js";
import { transitionTask } from "./task-transition.js";
import type { AccessScope } from "./access-scope.js";

export class TaskNotFound extends Schema.TaggedErrorClass<TaskNotFound>()(
  "TaskNotFound",
  {
    taskId: TaskIdSchema,
  },
) {}

export class InvalidTaskTransition extends Schema.TaggedErrorClass<InvalidTaskTransition>()(
  "InvalidTaskTransition",
  {
    from: Schema.String,
    to: Schema.String,
  },
) {}

export class TaskService extends Context.Service<
  TaskService,
  {
    readonly create: (
      scope: AccessScope,
      input: CreateTask,
    ) => Effect.Effect<Task, PersistenceError>;
    readonly get: (
      scope: AccessScope,
      id: TaskId,
    ) => Effect.Effect<Task, TaskNotFound | PersistenceError>;
    readonly listByProject: (
      scope: AccessScope,
      projectId: CreateTask["projectId"],
    ) => Effect.Effect<ReadonlyArray<Task>, PersistenceError>;
    readonly transition: (
      scope: AccessScope,
      id: TaskId,
      status: TaskStatus,
    ) => Effect.Effect<
      Task,
      TaskNotFound | InvalidTaskTransition | PersistenceError
    >;
  }
>()("repo/TaskService") {}

const taskId = (value: string): TaskId =>
  Schema.decodeUnknownSync(TaskIdSchema)(`task_${value}`);

const timestamp = (value: string) => Schema.decodeUnknownSync(Timestamp)(value);

export const TaskServiceTest = Layer.effect(
  TaskService,
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<TaskId, Task>());
    const owners = yield* Ref.make(new Map<TaskId, AccessScope>());
    let sequence = 0;

    const get = (scope: AccessScope, id: TaskId) =>
      Effect.flatMap(
        Effect.all([Ref.get(state), Ref.get(owners)]),
        ([tasks, ownership]) => {
          const task = tasks.get(id);
          const owner = ownership.get(id);
          return task &&
            owner?.tenantId === scope.tenantId &&
            owner.userId === scope.userId
            ? Effect.succeed(task)
            : Effect.fail(new TaskNotFound({ taskId: id }));
        },
      );

    return TaskService.of({
      create: (scope, input) =>
        Effect.gen(function* () {
          sequence += 1;
          const now = timestamp("2026-07-16T12:00:00.000Z");
          const task: Task = {
            id: taskId(sequence.toString().padStart(26, "0")),
            projectId: input.projectId,
            title: input.title,
            description: input.description,
            status: "todo",
            createdAt: now,
            updatedAt: now,
          };
          yield* Ref.update(state, (tasks) =>
            new Map(tasks).set(task.id, task),
          );
          yield* Ref.update(owners, (current) =>
            new Map(current).set(task.id, scope),
          );
          return task;
        }),
      get,
      listByProject: (scope, projectId) =>
        Effect.map(
          Effect.all([Ref.get(state), Ref.get(owners)]),
          ([tasks, ownership]) =>
            [...tasks.values()].filter((task) => {
              const owner = ownership.get(task.id);
              return (
                task.projectId === projectId &&
                owner?.tenantId === scope.tenantId &&
                owner.userId === scope.userId
              );
            }),
        ),
      transition: (scope, id, status) =>
        Effect.flatMap(get(scope, id), (current) => {
          const result = transitionTask(current.status, status);
          if ("_tag" in result) {
            return Effect.fail(
              new InvalidTaskTransition({ from: result.from, to: result.to }),
            );
          }
          const updated: Task = {
            ...current,
            status: result.status,
            updatedAt: timestamp("2026-07-16T12:00:01.000Z"),
          };
          return Effect.as(
            Ref.update(state, (tasks) => new Map(tasks).set(id, updated)),
            updated,
          );
        }),
    });
  }),
);
