import { Schema } from "effect";

export const ProjectId = Schema.String.pipe(Schema.brand("ProjectId"));
export type ProjectId = typeof ProjectId.Type;

export const CreateProject = Schema.Struct({
  id: ProjectId,
  name: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
});
export type CreateProject = typeof CreateProject.Type;

export const decodeCreateProject = Schema.decodeUnknownSync(CreateProject);
