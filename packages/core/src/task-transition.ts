import type { TaskStatus } from "@repo/contracts/task";

export interface InvalidTaskTransitionResult {
  readonly _tag: "InvalidTaskTransition";
  readonly from: TaskStatus;
  readonly to: TaskStatus;
}

export interface TaskTransition {
  readonly status: TaskStatus;
}

const allowed: Readonly<Record<TaskStatus, ReadonlySet<TaskStatus>>> = {
  todo: new Set(["in-progress", "cancelled"]),
  "in-progress": new Set(["blocked", "done", "cancelled"]),
  blocked: new Set(["in-progress", "cancelled"]),
  done: new Set(),
  cancelled: new Set(),
};

export const transitionTask = (
  from: TaskStatus,
  to: TaskStatus,
): TaskTransition | InvalidTaskTransitionResult =>
  allowed[from].has(to)
    ? { status: to }
    : { _tag: "InvalidTaskTransition", from, to };
