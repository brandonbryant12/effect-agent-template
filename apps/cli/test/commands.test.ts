import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands.js";

describe("CLI commands", () => {
  it("parses project, task, session, run, and credential workflows", () => {
    expect(parseCommand(["projects", "list"])).toEqual({
      _tag: "ProjectsList",
    });
    expect(parseCommand(["projects", "create", "Demo"])).toEqual({
      _tag: "ProjectsCreate",
      name: "Demo",
    });
    expect(
      parseCommand([
        "tasks",
        "create",
        "project_01JY0000000000000000000000",
        "Ship it",
      ]),
    ).toMatchObject({ _tag: "TasksCreate", title: "Ship it" });
    expect(
      parseCommand([
        "sessions",
        "create",
        "project_01JY0000000000000000000000",
        "conversation_01JY0000000000000000000000",
      ]),
    ).toMatchObject({ _tag: "SessionsCreate" });
    expect(
      parseCommand([
        "runs",
        "start",
        "session_01JY0000000000000000000000",
        "project_01JY0000000000000000000000",
        "conversation_01JY0000000000000000000000",
      ]),
    ).toMatchObject({ _tag: "RunsStart", taskId: null });
    expect(parseCommand(["credentials", "add", "openai", "Personal"])).toEqual({
      _tag: "CredentialsAdd",
      provider: "openai",
      label: "Personal",
    });
  });

  it("returns help for malformed or unknown commands", () => {
    expect(parseCommand([])).toEqual({ _tag: "Help" });
    expect(parseCommand(["projects", "create"])).toEqual({ _tag: "Help" });
    expect(parseCommand(["credentials", "add", "unknown", "x"])).toEqual({
      _tag: "Help",
    });
  });
});
