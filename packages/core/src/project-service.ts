import type {
  CreateProject,
  Project,
  ProjectId,
  UpdateProject,
} from "@repo/contracts";
import { ProjectId as ProjectIdSchema, Timestamp } from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import type { AccessScope } from "./access-scope.js";
import { PersistenceError } from "./errors.js";

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
  "ProjectNotFound",
  { projectId: ProjectIdSchema },
) {}

export class ProjectService extends Context.Service<
  ProjectService,
  {
    readonly create: (
      scope: AccessScope,
      input: CreateProject,
    ) => Effect.Effect<Project, PersistenceError>;
    readonly get: (
      scope: AccessScope,
      id: ProjectId,
    ) => Effect.Effect<Project, ProjectNotFound | PersistenceError>;
    readonly list: (
      scope: AccessScope,
    ) => Effect.Effect<ReadonlyArray<Project>, PersistenceError>;
    readonly update: (
      scope: AccessScope,
      id: ProjectId,
      input: UpdateProject,
    ) => Effect.Effect<Project, ProjectNotFound | PersistenceError>;
    readonly remove: (
      scope: AccessScope,
      id: ProjectId,
    ) => Effect.Effect<void, ProjectNotFound | PersistenceError>;
  }
>()("repo/ProjectService") {}

const projectId = (value: string): ProjectId =>
  Schema.decodeUnknownSync(ProjectIdSchema)(`project_${value}`);

const timestamp = (value: string) => Schema.decodeUnknownSync(Timestamp)(value);

export const ProjectServiceTest = Layer.effect(
  ProjectService,
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<ProjectId, Project>());
    const owners = yield* Ref.make(new Map<ProjectId, AccessScope>());
    let sequence = 0;

    const create = (scope: AccessScope, input: CreateProject) =>
      Effect.gen(function* () {
        sequence += 1;
        const now = timestamp("2026-07-16T12:00:00.000Z");
        const project: Project = {
          id: projectId(sequence.toString().padStart(26, "0")),
          name: input.name,
          description: input.description,
          createdAt: now,
          updatedAt: now,
        };
        yield* Ref.update(state, (projects) =>
          new Map(projects).set(project.id, project),
        );
        yield* Ref.update(owners, (current) =>
          new Map(current).set(project.id, scope),
        );
        return project;
      });

    const get = (scope: AccessScope, id: ProjectId) =>
      Effect.flatMap(
        Effect.all([Ref.get(state), Ref.get(owners)]),
        ([projects, ownership]) => {
          const project = projects.get(id);
          const owner = ownership.get(id);
          return project &&
            owner?.tenantId === scope.tenantId &&
            owner.userId === scope.userId
            ? Effect.succeed(project)
            : Effect.fail(new ProjectNotFound({ projectId: id }));
        },
      );

    return ProjectService.of({
      create,
      get,
      list: (scope) =>
        Effect.map(
          Effect.all([Ref.get(state), Ref.get(owners)]),
          ([projects, ownership]) =>
            [...projects.values()].filter((project) => {
              const owner = ownership.get(project.id);
              return (
                owner?.tenantId === scope.tenantId &&
                owner.userId === scope.userId
              );
            }),
        ),
      update: (scope, id, input) =>
        Effect.flatMap(get(scope, id), (current) => {
          const updated: Project = {
            ...current,
            ...input,
            updatedAt: timestamp("2026-07-16T12:00:01.000Z"),
          };
          return Effect.as(
            Ref.update(state, (projects) => new Map(projects).set(id, updated)),
            updated,
          );
        }),
      remove: (scope, id) =>
        Effect.flatMap(get(scope, id), () =>
          Effect.asVoid(
            Effect.all([
              Ref.update(state, (projects) => {
                const next = new Map(projects);
                next.delete(id);
                return next;
              }),
              Ref.update(owners, (ownership) => {
                const next = new Map(ownership);
                next.delete(id);
                return next;
              }),
            ]),
          ),
        ),
    });
  }),
);
