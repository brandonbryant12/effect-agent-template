import { setup } from "xstate";

type GraphEditorEvent =
  | { readonly type: "EDIT" }
  | { readonly type: "SAVE" }
  | { readonly type: "SAVED" }
  | { readonly type: "SAVE_FAILED" }
  | { readonly type: "RESET" };

/** Governs the canvas: dirty tracking, save flow, and failure recovery. */
export const graphEditorMachine = setup({
  types: { events: {} as GraphEditorEvent },
}).createMachine({
  id: "graph-editor",
  initial: "viewing",
  states: {
    viewing: { on: { EDIT: "editing" } },
    editing: { on: { SAVE: "saving", RESET: "viewing" } },
    saving: { on: { SAVED: "viewing", SAVE_FAILED: "saveFailed" } },
    saveFailed: { on: { SAVE: "saving", EDIT: "editing", RESET: "viewing" } },
  },
});
