import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryRepository } from "@xiaozhuoban/data";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { assistantMutationOutbox, getAssistantOutboxPendingCount } from "./assistant/assistantOutbox";
import { createDefaultBoardWidgets, toCanvasContentPosition, useAppStore } from "./store";

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

function makeWidget(type: string, zIndex: number): WidgetInstance {
  return {
    id: `wi_${type}`,
    boardId: "board_1",
    definitionId: `wd_${type}`,
    state: {},
    bindings: [],
    position: { x: 0, y: 0 },
    size: { w: 240, h: 180 },
    zIndex,
    locked: false,
    createdAt: now,
    updatedAt: now
  };
}

class DefinitionFailingRepository extends InMemoryRepository {
  async upsertDefinition(): Promise<void> {
    throw new Error("definition offline");
  }
}

class InstanceFailingRepository extends InMemoryRepository {
  async upsertInstance(): Promise<void> {
    throw new Error("instance offline");
  }
}

function stubOutboxStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear()
  });
  vi.stubGlobal("dispatchEvent", vi.fn());
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

describe("assistant widget focus state", () => {
  it("tracks the focused widget and brings it to the front", async () => {
    useAppStore.setState({
      ...useAppStore.getState(),
      activeBoardId: "board_1",
      focusedWidgetId: undefined,
      widgetDefinitions: [makeDefinition("note"), makeDefinition("tv")],
      widgetInstances: [makeWidget("note", 1), makeWidget("tv", 2)]
    });

    await useAppStore.getState().focusWidget("wi_note");

    const focused = useAppStore.getState().widgetInstances.find((widget) => widget.id === "wi_note");
    expect(useAppStore.getState().focusedWidgetId).toBe("wi_note");
    expect(focused?.zIndex).toBe(3);
  });

  it("clears focus when the focused widget is removed", async () => {
    useAppStore.setState({
      ...useAppStore.getState(),
      activeBoardId: "board_1",
      focusedWidgetId: "wi_note",
      widgetDefinitions: [makeDefinition("note")],
      widgetInstances: [makeWidget("note", 1)]
    });

    await useAppStore.getState().removeWidgetInstance("wi_note");

    expect(useAppStore.getState().focusedWidgetId).toBeUndefined();
    expect(useAppStore.getState().widgetInstances).toEqual([]);
  });
});

describe("assistant outbox store writes", () => {
  it("keeps generated widget definition writes in the assistant outbox when persistence fails", async () => {
    stubOutboxStorage();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository = new DefinitionFailingRepository();
    useAppStore.setState({
      ...useAppStore.getState(),
      repository,
      activeBoardId: "board_1",
      boards: [
        {
          id: "board_1",
          workspaceId: "ws_1",
          name: "测试桌板",
          layoutMode: "free",
          zoom: 1,
          locked: false,
          background: { type: "color", value: "#ffffff" },
          createdAt: now,
          updatedAt: now
        }
      ],
      widgetDefinitions: [],
      widgetInstances: []
    });

    await useAppStore.getState().generateAiWidget("生成一个评分表");
    await Promise.resolve();
    await Promise.resolve();

    expect(useAppStore.getState().widgetDefinitions).toHaveLength(1);
    expect(useAppStore.getState().widgetInstances).toHaveLength(1);
    expect(await getAssistantOutboxPendingCount()).toBe(1);
  });

  it("links assistant-originated widget writes to the command operation id in outbox", async () => {
    stubOutboxStorage();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useAppStore.setState({
      ...useAppStore.getState(),
      repository: new InstanceFailingRepository(),
      activeBoardId: "board_1",
      widgetDefinitions: [makeDefinition("note")],
      widgetInstances: [makeWidget("note", 1)]
    });

    await useAppStore
      .getState()
      .updateWidgetState("wi_note", { content: "assistant write" }, { operationId: "cmd_note_write" });
    await Promise.resolve();
    await Promise.resolve();

    const mutations = await assistantMutationOutbox.list();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toMatchObject({
      type: "widget.upsert",
      operationId: "cmd_note_write"
    });
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
