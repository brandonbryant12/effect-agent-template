import { Schema } from "effect";
import { Description, Name, Timestamp } from "./common.js";
import { ProjectId, TaskId } from "./ids.js";

export const TaskStatus = Schema.Literals([
  "todo",
  "in-progress",
  "blocked",
  "done",
  "cancelled",
]);
export type TaskStatus = typeof TaskStatus.Type;

export const Task = Schema.Struct({
  id: TaskId,
  projectId: ProjectId,
  title: Name,
  description: Description,
  status: TaskStatus,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Task = typeof Task.Type;

export const CreateTask = Schema.Struct({
  projectId: ProjectId,
  title: Name,
  description: Description,
});
export type CreateTask = typeof CreateTask.Type;

export const CreateTaskBody = Schema.Struct({
  title: Name,
  description: Description,
});
export type CreateTaskBody = typeof CreateTaskBody.Type;

export const TransitionTask = Schema.Struct({ status: TaskStatus });
export type TransitionTask = typeof TransitionTask.Type;

export const decodeTask = Schema.decodeUnknownSync(Task);
