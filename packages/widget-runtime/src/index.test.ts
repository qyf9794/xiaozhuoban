import { describe, expect, it } from "vitest";
import { formPlugin, WidgetRuntime } from "./index";

describe("WidgetRuntime", () => {
  it("applies registered plugin", () => {
    const runtime = new WidgetRuntime();
    runtime.register(formPlugin);

    const result = runtime.execute(
      {
        id: "wi_1",
        boardId: "b_1",
        definitionId: "wd_1",
        state: { title: "A", note: "B" },
        bindings: [],
        position: { x: 0, y: 0 },
        size: { w: 2, h: 2 },
        zIndex: 1,
        locked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: "wd_1",
        kind: "ai",
        type: "form",
        name: "test",
        version: 1,
        inputSchema: { fields: [] },
        outputSchema: { fields: [] },
        uiSchema: { layout: "single-column" },
        logicSpec: { derived: [{ target: "filled", expression: "count_filled" }] },
        storagePolicy: { strategy: "local" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    );

    expect(result.state.filled).toBe(2);
  });
});
