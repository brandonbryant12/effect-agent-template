import { describe, expect, it } from "vitest";
import { ApiRoutes, buildPath, decodeParams, matchPath } from "../src/http.js";

const names = Object.keys(ApiRoutes) as ReadonlyArray<keyof typeof ApiRoutes>;

describe("ApiRoutes table", () => {
  it("declares params for exactly the tokens in each path", () => {
    for (const name of names) {
      const definition = ApiRoutes[name];
      const tokens = [...definition.path.matchAll(/:(\w+)/g)]
        .map((match) => match[1])
        .sort();
      expect(Object.keys(definition.params).sort(), name).toEqual(tokens);
    }
  });

  it("has no duplicate method and path pairs", () => {
    const seen = new Set<string>();
    for (const name of names) {
      const definition = ApiRoutes[name];
      const key = `${definition.method} ${definition.path}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("round-trips a built path through the matcher", () => {
    const projectId = "project_01JY0000000000000000000000";
    const path = buildPath(ApiRoutes.getProject, {
      projectId: projectId as never,
    });
    expect(path).toBe(`/projects/${projectId}`);
    const raw = matchPath(ApiRoutes.getProject, path);
    expect(raw).toEqual({ projectId });
    const params = decodeParams(ApiRoutes.getProject, raw ?? {});
    expect(params.projectId).toBe(projectId);
  });

  it("rejects malformed path parameters at decode time", () => {
    const raw = matchPath(ApiRoutes.getProject, "/projects/not-a-project-id");
    expect(raw).toEqual({ projectId: "not-a-project-id" });
    expect(() => decodeParams(ApiRoutes.getProject, raw ?? {})).toThrow();
  });

  it("does not match paths with missing or extra segments", () => {
    expect(matchPath(ApiRoutes.getProject, "/projects")).toBeNull();
    expect(matchPath(ApiRoutes.getProject, "/projects/a/b")).toBeNull();
    expect(matchPath(ApiRoutes.listProjects, "/projects/")).toBeNull();
  });
});
