import { describe, expect, it } from "vitest";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { createDefaultBoardWidgets, toCanvasContentPosition } from "./store";

const now = "2026-03-11T00:00:00.000Z";

function makeDefinition(type: string): WidgetDefinition {
  return {
    id: `wd_${type}`,
    kind: "system",
    type,
    name: type,
    version: 1,
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" },
    createdAt: now,
    updatedAt: now
  };
}

describe("createDefaultBoardWidgets", () => {
  it("creates a message board widget for a new board", () => {
    const widgets = createDefaultBoardWidgets("board_1", [makeDefinition("note"), makeDefinition("messageBoard")]);

    expect(widgets).toHaveLength(1);
    expect(widgets[0]).toMatchObject({
      boardId: "board_1",
      definitionId: "wd_messageBoard",
      position: { x: 20, y: 20 },
      size: { w: 240, h: 500 },
      zIndex: 1
    });
  });

  it("returns no default widget when the message board definition is missing", () => {
    expect(createDefaultBoardWidgets("board_1", [makeDefinition("note")])).toEqual([]);
  });
});

describe("dial clock definition", () => {
  it("uses a square default size", async () => {
    const store = await import("./store");
    const useAppStore = store.useAppStore;
    useAppStore.setState({
      ...useAppStore.getState(),
      activeBoardId: "board_1",
      widgetDefinitions: [makeDefinition("dialClock")],
      widgetInstances: []
    });

    await useAppStore.getState().addWidgetInstance("wd_dialClock");

    expect(useAppStore.getState().widgetInstances[0]?.size).toEqual({ w: 240, h: 240 });
  });
});

describe("toCanvasContentPosition", () => {
  it("converts viewport coordinates into canvas content coordinates", () => {
    expect(
      toCanvasContentPosition(
        { top: 460, left: 310 },
        { top: 120, left: 40, scrollTop: 180, scrollLeft: 30, paddingTop: 12, paddingLeft: 8 }
      )
    ).toEqual({
      top: 508,
      left: 292
    });
  });
});
