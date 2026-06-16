import { describe, expect, it } from "vitest";
import { ActionRegistry } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { getWidgetSizePolicy, registerBoardActions, type BoardActionStore } from "./boardActions";

const now = "2026-06-16T00:00:00.000Z";

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

function makeWidget(type: string, overrides: Partial<WidgetInstance> = {}): WidgetInstance {
  return {
    id: `wi_${type}`,
    boardId: "board_1",
    definitionId: `wd_${type}`,
    state: {},
    bindings: [],
    position: { x: 0, y: 0 },
    size: { w: 240, h: 180 },
    zIndex: 1,
    locked: false,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createStore(seed?: { definitions?: WidgetDefinition[]; widgets?: WidgetInstance[] }) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const definitions = seed?.definitions ?? [makeDefinition("note"), makeDefinition("tv")];
  const widgets = seed?.widgets ?? [makeWidget("note"), makeWidget("tv", { size: { w: 240, h: 480 } })];
  const store: BoardActionStore = {
    getWidgetDefinitions: () => definitions,
    getWidgetInstances: () => widgets,
    addWidgetInstance: (...args) => {
      calls.push({ name: "addWidgetInstance", args });
    },
    removeWidgetInstance: (...args) => {
      calls.push({ name: "removeWidgetInstance", args });
    },
    updateWidgetPosition: (...args) => {
      calls.push({ name: "updateWidgetPosition", args });
    },
    updateWidgetSize: (...args) => {
      calls.push({ name: "updateWidgetSize", args });
    },
    focusWidget: (...args) => {
      calls.push({ name: "focusWidget", args });
    },
    fullscreenWidget: (...args) => {
      calls.push({ name: "fullscreenWidget", args });
    },
    bringWidgetToFront: (...args) => {
      calls.push({ name: "bringWidgetToFront", args });
    },
    autoAlignWidgets: (...args) => {
      calls.push({ name: "autoAlignWidgets", args });
    },
    setActiveBoard: (...args) => {
      calls.push({ name: "setActiveBoard", args });
    },
    addBoard: (...args) => {
      calls.push({ name: "addBoard", args });
    },
    renameBoard: (...args) => {
      calls.push({ name: "renameBoard", args });
    }
  };
  return { store, calls };
}

function createRegistry(store: BoardActionStore) {
  const registry = new ActionRegistry();
  registerBoardActions(registry, store);
  return registry;
}

describe("getWidgetSizePolicy", () => {
  it("allows tv resize with clamping", () => {
    const policy = getWidgetSizePolicy("tv");

    expect(policy.resizable).toBe(true);
    expect(policy.clamp?.(1000, 999)).toEqual({ w: 498, h: 480 });
  });

  it("marks non-tv widgets as fixed-size for assistant resize", () => {
    const policy = getWidgetSizePolicy("note");

    expect(policy.resizable).toBe(false);
    expect(policy.reason).toContain("固定");
  });
});

describe("registerBoardActions", () => {
  it("registers desktop scoped board actions", () => {
    const { store } = createStore();
    const registry = createRegistry(store);

    expect(registry.list("desktop").map((spec) => spec.name)).toEqual([
      "board.add_widget",
      "widget.focus",
      "widget.fullscreen_focus",
      "widget.remove",
      "widget.move",
      "widget.resize",
      "widget.bring_to_front",
      "board.auto_align",
      "board.switch",
      "board.create",
      "board.rename"
    ]);
  });

  it("adds an existing widget", async () => {
    const { store, calls } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute({
      id: "call_1",
      name: "board.add_widget",
      arguments: { definitionId: "wd_weather", mobileMode: true },
      source: "test"
    });

    expect(result.status).toBe("success");
    expect(calls).toEqual([{ name: "addWidgetInstance", args: ["wd_weather", { mobileMode: true }] }]);
  });

  it("moves a widget with rounded coordinates", async () => {
    const { store, calls } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute({
      id: "call_1",
      name: "widget.move",
      arguments: { widgetId: "wi_note", x: 12.3, y: 45.8 },
      source: "test"
    });

    expect(result.status).toBe("success");
    expect(calls).toEqual([{ name: "updateWidgetPosition", args: ["wi_note", 12, 46] }]);
  });

  it("focuses and fullscreen-focuses existing widgets", async () => {
    const { store, calls } = createStore();
    const registry = createRegistry(store);

    await registry.execute({ id: "1", name: "widget.focus", arguments: { widgetId: "wi_tv" }, source: "test" });
    await registry.execute({ id: "2", name: "widget.fullscreen_focus", arguments: { widgetId: "wi_tv" }, source: "test" });

    expect(calls).toEqual([
      { name: "focusWidget", args: ["wi_tv"] },
      { name: "fullscreenWidget", args: ["wi_tv"] }
    ]);
  });

  it("returns a failure when fullscreen focus is not supported", async () => {
    const { store } = createStore();
    const registry = createRegistry({ ...store, fullscreenWidget: undefined });

    const result = await registry.execute({
      id: "call_1",
      name: "widget.fullscreen_focus",
      arguments: { widgetId: "wi_tv" },
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "FULLSCREEN_UNAVAILABLE"
    });
  });

  it("refuses to resize fixed-size widgets without mutating", async () => {
    const { store, calls } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute({
      id: "call_1",
      name: "widget.resize",
      arguments: { widgetId: "wi_note", w: 320, h: 240 },
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "WIDGET_SIZE_FIXED"
    });
    expect(calls).toEqual([]);
  });

  it("resizes tv widgets with existing clamp rules", async () => {
    const { store, calls } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute({
      id: "call_1",
      name: "widget.resize",
      arguments: { widgetId: "wi_tv", w: 999, h: 120 },
      source: "test"
    });

    expect(result.status).toBe("success");
    expect(calls).toEqual([{ name: "updateWidgetSize", args: ["wi_tv", 498, 480] }]);
  });

  it("auto-aligns widgets using supplied viewport data", async () => {
    const { store, calls } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute({
      id: "call_1",
      name: "board.auto_align",
      arguments: { viewportWidth: 390, mobileMode: true },
      source: "test"
    });

    expect(result.status).toBe("success");
    expect(calls).toEqual([{ name: "autoAlignWidgets", args: [390, { mobileMode: true }] }]);
  });

  it("switches, creates, renames, removes, and brings widgets forward", async () => {
    const { store, calls } = createStore();
    const registry = createRegistry(store);

    await registry.execute({ id: "1", name: "board.switch", arguments: { boardId: "board_2" }, source: "test" });
    await registry.execute({ id: "2", name: "board.create", arguments: { name: "新桌板" }, source: "test" });
    await registry.execute({
      id: "3",
      name: "board.rename",
      arguments: { boardId: "board_2", name: " 工作 " },
      source: "test"
    });
    await registry.execute({ id: "4", name: "widget.remove", arguments: { widgetId: "wi_note" }, source: "test" });
    await registry.execute({
      id: "5",
      name: "widget.bring_to_front",
      arguments: { widgetId: "wi_note" },
      source: "test"
    });

    expect(calls).toEqual([
      { name: "setActiveBoard", args: ["board_2"] },
      { name: "addBoard", args: ["新桌板"] },
      { name: "renameBoard", args: ["board_2", "工作"] },
      { name: "removeWidgetInstance", args: ["wi_note"] },
      { name: "bringWidgetToFront", args: ["wi_note"] }
    ]);
  });

  it("returns a failure when bring-to-front is not supported", async () => {
    const { store } = createStore();
    const registry = createRegistry({ ...store, bringWidgetToFront: undefined });

    const result = await registry.execute({
      id: "call_1",
      name: "widget.bring_to_front",
      arguments: { widgetId: "wi_note" },
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "BRING_TO_FRONT_UNAVAILABLE"
    });
  });
});
