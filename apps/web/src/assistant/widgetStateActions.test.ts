import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry, ToolScopeManager, type ResolvedWidgetTarget } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { createWidgetStateActions, type WidgetStateActionStore } from "./widgetStateActions";

const NOW = "2026-06-16T12:00:00.000Z";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
  const calls: Array<{ name: string; args: unknown[] }> = [];

  const store: WidgetStateActionStore = {
    getWidgetDefinitions: () => definitions,
    getWidgetInstances: () => widgets,
    updateWidgetState(widgetId, state, persistOptions) {
      calls.push({ name: "updateWidgetState", args: [widgetId, state, persistOptions] });
      widgets = widgets.map((widget) => (widget.id === widgetId ? { ...widget, state } : widget));
    }
  };

  return {
    store,
    calls,
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
    expect(names).toContain("note.clear");
    expect(names).toContain("weather.set_city");
    expect(names).toContain("todo.complete_item");
    expect(names).toContain("todo.clear_completed");
    expect(names).toContain("countdown.pause");
    expect(names).toContain("countdown.resume");
    expect(names).toContain("countdown.reset");
    expect(names).toContain("clipboard.clear");
    expect(names.some((name) => name.includes("gomoku") || name.includes("monopoly") || name.includes("guandan"))).toBe(false);
    expect(names.some((name) => name.includes("ai"))).toBe(false);
    expect(actions.every((action) => action.spec.scope === "widget-detail")).toBe(true);
  });

  it("passes command operation ids to persistent widget state writes", async () => {
    const { store, calls } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      {
        id: "cmd_note_write",
        name: "note.write",
        arguments: { content: "新的内容" },
        source: "test"
      },
      { target: targetFor("note"), operationId: "cmd_note_write" }
    );

    expect(result.status).toBe("success");
    expect(calls[0]).toEqual({
      name: "updateWidgetState",
      args: ["wi_note", { content: "新的内容" }, { operationId: "cmd_note_write" }]
    });
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
    expect(manager.getWidgetDetailTools("note").map((tool) => tool.name)).toEqual(["note.write", "note.clear"]);
    expect(manager.getWidgetDetailTools("todo").map((tool) => tool.name)).toEqual([
      "todo.add_item",
      "todo.complete_item",
      "todo.clear_completed"
    ]);
    expect(manager.getWidgetDetailTools("countdown").map((tool) => tool.name)).toEqual([
      "countdown.set",
      "countdown.pause",
      "countdown.resume",
      "countdown.reset"
    ]);
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

  it("clears note content and marks the action destructive", async () => {
    const { store, getWidget } = createStore();
    const actions = createWidgetStateActions(store);
    const registry = createRegistry(store);
    const clearAction = actions.find((action) => action.spec.name === "note.clear");

    const result = await registry.execute(
      { id: "call_1", name: "note.clear", arguments: {}, source: "test" },
      { target: targetFor("note"), now: () => NOW }
    );

    expect(clearAction?.spec.risk).toBe("destructive");
    expect(result).toMatchObject({ status: "success", message: "已清空便签" });
    expect(getWidget("note")?.state.content).toBe("");
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

  it("clears completed todo items and marks the action destructive", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);
    const clearAction = createWidgetStateActions(store).find((action) => action.spec.name === "todo.clear_completed");
    await store.updateWidgetState("wi_todo", {
      items: [
        { id: "todo_1", text: "已完成任务", completed: true },
        { id: "todo_2", text: "保留任务" }
      ]
    });

    const result = await registry.execute(
      { id: "call_1", name: "todo.clear_completed", arguments: {}, source: "test" },
      { target: targetFor("todo"), now: () => NOW }
    );

    expect(clearAction?.spec.risk).toBe("destructive");
    expect(result).toMatchObject({ status: "success", message: "已清理已完成待办" });
    expect(getWidget("todo")?.state.items).toEqual([{ id: "todo_2", text: "保留任务" }]);
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

  it("pauses, resumes, and resets a countdown without removing it", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);
    await store.updateWidgetState("wi_countdown", {
      inputHours: "0",
      inputMinutes: "10",
      inputSeconds: "0",
      totalSeconds: 600,
      remainingSeconds: 420,
      running: true,
      targetEndsAt: Date.parse(NOW) + 420_000
    });

    const pauseResult = await registry.execute(
      { id: "call_1", name: "countdown.pause", arguments: {}, source: "test" },
      { target: targetFor("countdown"), now: () => NOW }
    );
    expect(pauseResult).toMatchObject({ status: "success", message: "已暂停倒计时" });
    expect(getWidget("countdown")?.state).toMatchObject({ remainingSeconds: 420, running: false, targetEndsAt: 0 });

    const resumeResult = await registry.execute(
      { id: "call_2", name: "countdown.resume", arguments: {}, source: "test" },
      { target: targetFor("countdown"), now: () => NOW }
    );
    expect(resumeResult).toMatchObject({ status: "success", message: "已继续倒计时" });
    expect(getWidget("countdown")?.state).toMatchObject({
      remainingSeconds: 420,
      running: true,
      targetEndsAt: Date.parse(NOW) + 420_000
    });

    const resetResult = await registry.execute(
      { id: "call_3", name: "countdown.reset", arguments: {}, source: "test" },
      { target: targetFor("countdown"), now: () => NOW }
    );
    expect(resetResult).toMatchObject({ status: "success", message: "已重置倒计时" });
    expect(getWidget("countdown")?.state).toMatchObject({
      totalSeconds: 600,
      remainingSeconds: 600,
      running: false,
      targetEndsAt: 0
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

  it("sets supported international weather cities", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      { id: "call_1", name: "weather.set_city", arguments: { city: "纽约" }, source: "test" },
      { target: targetFor("weather"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(getWidget("weather")?.state.cityCode).toBe("new-york");
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

  it("normalizes natural Nasdaq market arguments to the Nasdaq 100 code", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    await registry.execute(
      { id: "call_1", name: "market.set_indices", arguments: { indexCodes: ["NASDAQ", "纳斯达克"] }, source: "test" },
      { target: targetFor("market"), now: () => NOW }
    );

    expect(getWidget("market")?.state.indexCodes).toEqual(["usNDX"]);
  });

  it("resolves specific stock names online before updating market targets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "usAAPL", label: "苹果 AAPL" })));
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    await registry.execute(
      { id: "call_1", name: "market.set_indices", arguments: { query: "看苹果股票" }, source: "test" },
      { target: targetFor("market"), now: () => NOW }
    );

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/market/search?q="));
    expect(getWidget("market")?.state.indexCodes).toEqual(["usAAPL"]);
    expect(getWidget("market")?.state.marketSymbolLabels).toEqual({ usAAPL: "苹果 AAPL" });
  });

  it("cleans stock lookup command wording before online market search", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "usTSLA", label: "特斯拉 TSLA" })));
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    await registry.execute(
      { id: "call_1", name: "market.set_indices", arguments: { query: "打开特斯拉股价和走势图" }, source: "test" },
      { target: targetFor("market"), now: () => NOW }
    );

    expect(fetch).toHaveBeenCalledWith("/api/market/search?q=%E7%89%B9%E6%96%AF%E6%8B%89");
    expect(getWidget("market")?.state.indexCodes).toEqual(["usTSLA"]);
    expect(getWidget("market")?.state.marketSymbolLabels).toEqual({ usTSLA: "特斯拉 TSLA" });
  });

  it("completes todo items by ordinal wording", async () => {
    const { store, getWidget } = createStore();
    const todo = getWidget("todo");
    if (!todo) throw new Error("missing todo widget");
    await store.updateWidgetState(todo.id, {
      items: [
        { id: "todo_1", text: "复测手机 Safari" },
        { id: "todo_2", text: "检查线上 trace" }
      ]
    });
    const registry = createRegistry(store);

    await registry.execute(
      { id: "call_1", name: "todo.complete_item", arguments: { text: "第一条待办" }, source: "test" },
      { target: targetFor("todo"), now: () => NOW }
    );

    expect(getWidget("todo")?.state.items).toEqual([{ id: "todo_2", text: "检查线上 trace" }]);
  });

  it("resolves weather cities online before updating weather coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          cityCode: "geo:1886760",
          name: "苏州",
          label: "苏州 (江苏 · 中国)",
          latitude: 31.30408,
          longitude: 120.59538,
          timezone: "Asia/Shanghai",
          worldClockZone: "Asia/Shanghai|geo-1886760"
        })
      )
    );
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    await registry.execute(
      { id: "call_1", name: "weather.set_city", arguments: { city: "苏州" }, source: "test" },
      { target: targetFor("weather"), now: () => NOW }
    );

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/geo/search?q="));
    expect(getWidget("weather")?.state.cityCode).toBe("geo:1886760");
    expect(getWidget("weather")?.state.weatherCity).toMatchObject({
      label: "苏州 (江苏 · 中国)",
      latitude: 31.30408,
      longitude: 120.59538
    });
  });

  it("resolves world clock city names online before updating zones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          cityCode: "geo:5809844",
          name: "西雅图",
          label: "西雅图 (华盛顿州 · 美国)",
          latitude: 47.60621,
          longitude: -122.33207,
          timezone: "America/Los_Angeles",
          worldClockZone: "America/Los_Angeles|geo-5809844"
        })
      )
    );
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    await registry.execute(
      { id: "call_1", name: "worldClock.set_zones", arguments: { zones: ["西雅图"], compact: true }, source: "test" },
      { target: targetFor("worldClock"), now: () => NOW }
    );

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/geo/search?q="));
    expect(getWidget("worldClock")?.state.zones).toEqual(["Asia/Shanghai", "America/Los_Angeles|geo-5809844"]);
    expect(getWidget("worldClock")?.state.worldClockZoneLabels).toEqual({
      "America/Los_Angeles|geo-5809844": "西雅图"
    });
  });

  it("accepts area, time, and currency converter categories", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    await registry.execute(
      { id: "call_1", name: "converter.set", arguments: { category: "area", value: 10, fromUnit: "sqm", toUnit: "sqcm" }, source: "test" },
      { target: targetFor("converter"), now: () => NOW }
    );
    expect(getWidget("converter")?.state).toMatchObject({ category: "area", inputValue: "10", fromUnit: "sqm", toUnit: "sqcm" });

    await registry.execute(
      { id: "call_2", name: "converter.set", arguments: { category: "time", value: 80, fromUnit: "minute", toUnit: "hour" }, source: "test" },
      { target: targetFor("converter"), now: () => NOW }
    );
    expect(getWidget("converter")?.state).toMatchObject({ category: "time", inputValue: "80", fromUnit: "minute", toUnit: "hour" });

    await registry.execute(
      { id: "call_3", name: "converter.set", arguments: { category: "currency", value: 5, fromUnit: "usd", toUnit: "cny" }, source: "test" },
      { target: targetFor("converter"), now: () => NOW }
    );
    expect(getWidget("converter")?.state).toMatchObject({ category: "currency", inputValue: "5", fromUnit: "usd", toUnit: "cny" });
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

  it("sets an optional countdown label", async () => {
    const { store, getWidget } = createStore();
    const registry = createRegistry(store);

    const result = await registry.execute(
      { id: "call_1", name: "countdown.set", arguments: { totalSeconds: 90, start: true, label: "泡茶" }, source: "test" },
      { target: targetFor("countdown"), now: () => NOW }
    );

    expect(result.status).toBe("success");
    expect(getWidget("countdown")?.state).toMatchObject({ totalSeconds: 90, label: "泡茶" });
  });
});
