import { Schema } from "effect";

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
  "ProjectNotFound",
  {
    projectId: Schema.String,
  },
) {}

export class ProjectConflict extends Schema.TaggedErrorClass<ProjectConflict>()(
  "ProjectConflict",
  {
    projectId: Schema.String,
    reason: Schema.Literals(["name-taken", "version-mismatch"]),
  },
) {}
