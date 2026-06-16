import { describe, expect, it } from "vitest";
import { ActionRegistry, ToolScopeManager, type ResolvedWidgetTarget } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { createWidgetStateActions, type WidgetStateActionStore } from "./widgetStateActions";

const NOW = "2026-06-16T12:00:00.000Z";

function createDefinition(type: string, kind: WidgetDefinition["kind"] = "system"): WidgetDefinition {
  return {
    id: `wd_${type}`,
    kind,
    type,
    name: type,
    version: 1,
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" },
    createdAt: NOW,
    updatedAt: NOW
  };
}

function createWidget(type: string, state: Record<string, unknown> = {}): WidgetInstance {
  return {
    id: `wi_${type}`,
    boardId: "board_1",
    definitionId: `wd_${type}`,
    state,
    bindings: [],
    position: { x: 0, y: 0 },
    size: { w: 240, h: 180 },
    zIndex: 1,
    locked: false,
    createdAt: NOW,
    updatedAt: NOW
  };
}

function createStore(options?: { includeAiDefinition?: boolean; includeGames?: boolean }) {
  const definitions = [
    "note",
    "todo",
    "calculator",
    "countdown",
    "weather",
    "headline",
    "market",
    "worldClock",
    "converter",
    "translate",
    "clipboard"
  ].map((type) => createDefinition(type));
  if (options?.includeGames) {
    definitions.push(createDefinition("gomoku"), createDefinition("monopoly"), createDefinition("guandan"));
  }
  if (options?.includeAiDefinition) {
    definitions.push(createDefinition("aiForm", "ai"));
  }

  let widgets = definitions
    .filter((definition) => definition.kind === "system")
    .map((definition) => createWidget(definition.type));
  widgets = widgets.map((widget) =>
    widget.id === "wi_note" ? { ...widget, state: { content: "已有内容" } } : widget
  );

  const store: WidgetStateActionStore = {
    getWidgetDefinitions: () => definitions,
    getWidgetInstances: () => widgets,
    updateWidgetState(widgetId, state) {
      widgets = widgets.map((widget) => (widget.id === widgetId ? { ...widget, state } : widget));
    }
  };

  return {
    store,
    getWidget: (type: string) => widgets.find((widget) => widget.id === `wi_${type}`),
    getDefinition: (type: string) => definitions.find((definition) => definition.type === type)
  };
}

function createRegistry(store: WidgetStateActionStore) {
  const registry = new ActionRegistry();
  createWidgetStateActions(store).forEach((action) => registry.register(action));
  return registry;
}

function targetFor(type: string): ResolvedWidgetTarget {
  return {
    widgetId: `wi_${type}`,
    definitionId: `wd_${type}`,
    type,
    name: type,
    confidence: 1,
    reason: "test"
  };
}

describe("widget state assistant actions", () => {
  it("registers only stage-one system widget detail actions", () => {
    const { store } = createStore({ includeAiDefinition: true, includeGames: true });
    const actions = createWidgetStateActions(store);
    const names = actions.map((action) => action.spec.name);

    expect(names).toContain("note.write");
    expect(names).toContain("weather.set_city");
    expect(names).toContain("todo.complete_item");
    expect(names).toContain("clipboard.clear");
    expect(names.some((name) => name.includes("gomoku") || name.includes("monopoly") || name.includes("guandan"))).toBe(false);
    expect(names.some((name) => name.includes("ai"))).toBe(false);
    expect(actions.every((action) => action.spec.scope === "widget-detail")).toBe(true);
  });

  it("registers stage-one detail actions even before definitions are loaded", () => {
    const store: WidgetStateActionStore = {
      getWidgetDefinitions: () => [],
      getWidgetInstances: () => [],
      updateWidgetState() {}
    };
    const names = createWidgetStateActions(store).map((action) => action.spec.name);

    expect(names).toContain("weather.set_city");
    expect(names).toContain("note.write");
    expect(names).toContain("todo.add_item");
  });

  it("exposes widget detail actions only inside the matching scope", () => {
    const { store } = createStore();
    const manager = new ToolScopeManager(createWidgetStateActions(store).map((action) => action.spec));

    expect(manager.getInitialTools()).toEqual([]);
    expect(manager.getWidgetDetailTools("weather").map((tool) => tool.name)).toEqual(["weather.set_city"]);
    expect(manager.getWidgetDetailTools("note").map((tool) => tool.name)).toEqual(["note.write"]);
  });

  it("writes and appends note content", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      { id: "call_1", name: "note.write", arguments: { content: "明早九点开会", mode: "append" }, source: "test" },
      { target: targetFor("note"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(getWidget("note")?.state.content).toBe("已有内容\n明早九点开会");
  });

  it("adds a todo item with a due time", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      {
        id: "call_1",
        name: "todo.add_item",
        arguments: { text: "交报告", dueAt: "2026-06-17T15:00:00.000Z" },
        source: "test"
      },
      { target: targetFor("todo"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(getWidget("todo")?.state.items).toMatchObject([{ text: "交报告", dueAt: "2026-06-17T15:00:00.000Z" }]);
  });

  it("completes a matching todo item by text", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);
    await store.updateWidgetState("wi_todo", {
      items: [
        { id: "todo_1", text: "买牛奶" },
        { id: "todo_2", text: "交报告" }
      ]
    });

    const result = await registry.execute(
      { id: "call_1", name: "todo.complete_item", arguments: { text: "买牛奶" }, source: "test" },
      { target: targetFor("todo"), now: () => NOW }
    );

    expect(result).toMatchObject({ status: "success", message: "已完成待办" });
    expect(getWidget("todo")?.state.items).toEqual([{ id: "todo_2", text: "交报告" }]);
  });

  it("keeps todo items unchanged when completion text does not match", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);
    const items = [{ id: "todo_1", text: "买牛奶" }];
    await store.updateWidgetState("wi_todo", { items });

    const result = await registry.execute(
      { id: "call_1", name: "todo.complete_item", arguments: { text: "不存在" }, source: "test" },
      { target: targetFor("todo"), now: () => NOW }
    );

    expect(result).toMatchObject({ status: "failed", errorCode: "TODO_ITEM_NOT_FOUND" });
    expect(getWidget("todo")?.state.items).toEqual(items);
  });

  it("sets and starts a countdown", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      { id: "call_1", name: "countdown.set", arguments: { minutes: 10, start: true }, source: "test" },
      { target: targetFor("countdown"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(getWidget("countdown")?.state).toMatchObject({
      inputHours: "0",
      inputMinutes: "10",
      inputSeconds: "0",
      totalSeconds: 600,
      remainingSeconds: 600,
      running: true,
      targetEndsAt: Date.parse(NOW) + 600_000
    });
  });

  it("sets a supported weather city", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      { id: "call_1", name: "weather.set_city", arguments: { city: "上海" }, source: "test" },
      { target: targetFor("weather"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(getWidget("weather")?.state.cityCode).toBe("shanghai");
  });

  it("sets translate draft without running long text work in realtime", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      {
        id: "call_1",
        name: "translate.set_draft",
        arguments: { sourceText: "今天晚上吃什么", targetLang: "en" },
        source: "test"
      },
      { target: targetFor("translate"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(getWidget("translate")?.state).toMatchObject({
      sourceText: "今天晚上吃什么",
      sourceLang: "auto",
      targetLang: "en",
      translating: false
    });
  });

  it("updates converter, market, world clock, calculator, headline, and clipboard state", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    await registry.execute(
      { id: "call_1", name: "converter.set", arguments: { category: "length", value: 12, fromUnit: "m", toUnit: "km" }, source: "test" },
      { target: targetFor("converter"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_2", name: "market.set_indices", arguments: { indexCodes: ["usINX", "hkHSI"] }, source: "test" },
      { target: targetFor("market"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_3", name: "worldClock.set_zones", arguments: { zones: ["北京", "伦敦", "东京", "纽约"] }, source: "test" },
      { target: targetFor("worldClock"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_4", name: "calculator.set_display", arguments: { display: 42 }, source: "test" },
      { target: targetFor("calculator"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_5", name: "headline.request_refresh", arguments: {}, source: "test" },
      { target: targetFor("headline"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_6", name: "clipboard.add_text", arguments: { text: "一段剪贴板内容", pinned: true }, source: "test" },
      { target: targetFor("clipboard"), now: () => NOW }
    );

    expect(getWidget("converter")?.state).toMatchObject({ category: "length", inputValue: "12", fromUnit: "m", toUnit: "km" });
    expect(getWidget("market")?.state.indexCodes).toEqual(["usINX", "hkHSI"]);
    expect(getWidget("worldClock")?.state.zones).toEqual(["Asia/Shanghai", "Europe/London", "Asia/Tokyo", "America/New_York"]);
    expect(getWidget("calculator")?.state.calcDisplay).toBe("42");
    expect(getWidget("headline")?.state.headlineRefreshRequestedAt).toBe(NOW);
    expect(getWidget("clipboard")?.state.items).toMatchObject([{ text: "一段剪贴板内容", pinned: true }]);
  });

  it("marks destructive clipboard clear as confirmation-required metadata", () => {
    const { store } = createStore();
    const clearAction = createWidgetStateActions(store).find((action) => action.spec.name === "clipboard.clear");

    expect(clearAction?.spec.risk).toBe("destructive");
  });

  it("clears clipboard history while preserving pinned records by default", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);
    await registry.execute(
      { id: "call_1", name: "clipboard.add_text", arguments: { text: "普通记录" }, source: "test" },
      { target: targetFor("clipboard"), now: () => NOW }
    );
    await registry.execute(
      { id: "call_2", name: "clipboard.add_text", arguments: { text: "固定记录", pinned: true }, source: "test" },
      { target: targetFor("clipboard"), now: () => NOW }
    );

    const result = await registry.execute(
      { id: "call_3", name: "clipboard.clear", arguments: {}, source: "test" },
      { target: targetFor("clipboard"), now: () => NOW }
    );

    expect(result).toMatchObject({ status: "success", message: "已清理剪贴板历史" });
    expect(getWidget("clipboard")?.state.items).toMatchObject([{ text: "固定记录", pinned: true }]);
  });

  it("clears pinned clipboard records when explicitly requested", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);
    await registry.execute(
      { id: "call_1", name: "clipboard.add_text", arguments: { text: "固定记录", pinned: true }, source: "test" },
      { target: targetFor("clipboard"), now: () => NOW }
    );

    const result = await registry.execute(
      { id: "call_2", name: "clipboard.clear", arguments: { includePinned: true }, source: "test" },
      { target: targetFor("clipboard"), now: () => NOW }
    );

    expect(result).toMatchObject({ status: "success", message: "已清理剪贴板历史" });
    expect(getWidget("clipboard")?.state.items).toEqual([]);
  });

  it("refuses to patch a mismatched widget type", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      { id: "call_1", name: "note.write", arguments: { content: "不该写入" }, source: "test" },
      { target: targetFor("weather"), now: () => NOW }
    );

    expect(result).toMatchObject({ status: "failed", errorCode: "WIDGET_TYPE_MISMATCH" });
    expect(getWidget("note")?.state.content).toBe("已有内容");
  });
});
