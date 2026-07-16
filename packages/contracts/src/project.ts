import { Schema } from "effect";
import { Description, Name, Timestamp } from "./common.js";
import { ProjectId } from "./ids.js";

export const Project = Schema.Struct({
  id: ProjectId,
  name: Name,
  description: Description,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Project = typeof Project.Type;

export const CreateProject = Schema.Struct({
  name: Name,
  description: Description,
});
export type CreateProject = typeof CreateProject.Type;

export const UpdateProject = Schema.Struct({
  name: Name,
  description: Description,
});
export type UpdateProject = typeof UpdateProject.Type;

export const decodeProject = Schema.decodeUnknownSync(Project);
