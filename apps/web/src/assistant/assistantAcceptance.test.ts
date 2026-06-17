import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  createDefaultIntentShortcutRouter,
  type AssistantToolCall,
  type AssistantToolResult,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { AssistantHarness, type AssistantRealtimeAdapter } from "./AssistantHarness";
import { registerBoardActions } from "./boardActions";
import { createWidgetStateActions } from "./widgetStateActions";

const NOW = "2026-06-16T12:00:00.000Z";

function definition(type: string, name: string): WidgetDefinition {
  return {
    id: `wd_${type}`,
    kind: "system",
    type,
    name,
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

function widget(type: string): WidgetInstance {
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
    createdAt: NOW,
    updatedAt: NOW
  };
}

function createAcceptanceHarness(options?: { modelCall?: AssistantToolCall | null; initialWidgetTypes?: string[] }) {
  const definitions = [
    definition("weather", "天气"),
    definition("countdown", "倒计时"),
    definition("note", "便签"),
    definition("todo", "待办"),
    definition("clipboard", "剪贴板"),
    definition("translate", "翻译"),
    definition("converter", "换算"),
    definition("calculator", "计算器"),
    definition("market", "行情"),
    definition("worldClock", "世界时钟"),
    definition("headline", "新闻")
  ];
  let widgets = (
    options?.initialWidgetTypes ?? [
      "weather",
      "countdown",
      "note",
      "todo",
      "clipboard",
      "translate",
      "converter",
      "calculator",
      "market",
      "worldClock",
      "headline"
    ]
  ).map(widget);
  let boards = [{ id: "board_1", name: "我的桌板" }];
  let activeBoardId = "board_1";
  const sentResults: AssistantToolResult[] = [];
  const modelInputs: string[] = [];
  const registry = new ActionRegistry();
  const adapter = {
    getWidgetInstances: () => widgets,
    getWidgetDefinitions: () => definitions,
    addWidgetInstance(definitionId: string) {
      const target = definitions.find((item) => item.id === definitionId);
      if (!target) return undefined;
      const instance = widget(target.type);
      widgets = [...widgets, instance];
      return instance;
    },
    removeWidgetInstance(widgetId: string) {
      widgets = widgets.filter((item) => item.id !== widgetId);
    },
    updateWidgetPosition() {},
    updateWidgetSize() {},
    updateWidgetState(widgetId: string, state: Record<string, unknown>) {
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, state } : item));
    },
    autoAlignWidgets() {},
    setActiveBoard(boardId: string) {
      activeBoardId = boardId;
    },
    addBoard(name?: string) {
      const id = `board_${boards.length + 1}`;
      boards = [...boards, { id, name: name?.trim() || `桌板 ${boards.length + 1}` }];
      activeBoardId = id;
    },
    renameBoard(boardId: string, name: string) {
      boards = boards.map((board) => (board.id === boardId ? { ...board, name } : board));
    }
  };
  registerBoardActions(registry, adapter);
  createWidgetStateActions(adapter).forEach((action) => registry.register(action));

  const realtime: AssistantRealtimeAdapter = {
    updateTools() {},
    sendToolResult(_call, result) {
      sentResults.push(result);
    },
    requestToolCall(input) {
      modelInputs.push(input);
      return options?.modelCall ?? null;
    }
  };
  const getContextInput = (): ContextSummarizerInput => ({
    boardId: activeBoardId,
    boardName: boards.find((board) => board.id === activeBoardId)?.name,
    availableBoards: boards.map((board) => ({
      boardId: board.id,
      name: board.name,
      active: board.id === activeBoardId || undefined
    })),
    focusedWidgetId: "wi_weather",
    availableDefinitions: definitions.map((item) => ({
      definitionId: item.id,
      type: item.type,
      name: item.name
    })),
    widgets: widgets.map((item, index) => {
      const def = definitions.find((candidate) => candidate.id === item.definitionId)!;
      return {
        widgetId: item.id,
        definitionId: item.definitionId,
        type: def.type,
        name: def.name,
        order: index + 1,
        state: item.state
      };
    })
  });

  const harness = new AssistantHarness({
    registry,
    shortcutRouter: createDefaultIntentShortcutRouter(),
    targetResolver: new WidgetTargetResolver(),
    toolScopeManager: new ToolScopeManager(registry.list()),
    contextSummarizer: new ContextSummarizer(),
    realtime,
    getContextInput,
    now: () => NOW
  });

  return {
    harness,
    sentResults,
    modelInputs,
    getBoards: () => boards,
    getActiveBoard: () => boards.find((board) => board.id === activeBoardId),
    getWidget: (type: string) => widgets.find((item) => item.id === `wi_${type}`)
  };
}

describe("stage-one assistant acceptance scenarios", () => {
  it("runs 上海天气 through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("上海天气");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("weather")?.state.cityCode).toBe("shanghai");
    expect(modelInputs).toEqual([]);
  });

  it("adds a weather widget and sets Shanghai when weather is absent", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness({ initialWidgetTypes: ["countdown", "note"] });
    await harness.initialize();

    const response = await harness.handleUserInput("打开上海天气");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("weather")?.state.cityCode).toBe("shanghai");
    expect(modelInputs).toEqual([]);
  });

  it("sets the countdown to ten minutes and starts it", async () => {
    const { harness, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("十分钟倒计时");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("countdown")?.state).toMatchObject({
      totalSeconds: 600,
      remainingSeconds: 600,
      running: true
    });
  });

  it("creates a named board through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getActiveBoard, getBoards } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("新建桌板叫测试桌板");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getBoards()).toHaveLength(2);
    expect(getActiveBoard()?.name).toBe("测试桌板");
    expect(modelInputs).toEqual([]);
  });

  it("renames the active board through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getActiveBoard } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("把当前桌板重命名为工作台");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getActiveBoard()?.name).toBe("工作台");
    expect(modelInputs).toEqual([]);
  });

  it("switches boards by name through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getActiveBoard } = createAcceptanceHarness();
    await harness.initialize();
    await harness.handleUserInput("新建桌板叫测试桌板");

    const response = await harness.handleUserInput("切换到我的桌板");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getActiveBoard()?.name).toBe("我的桌板");
    expect(modelInputs).toEqual([]);
  });

  it("adds a countdown widget and starts ten minutes when countdown is absent", async () => {
    const { harness, getWidget } = createAcceptanceHarness({ initialWidgetTypes: ["weather", "note"] });
    await harness.initialize();

    const response = await harness.handleUserInput("十分钟倒计时");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("countdown")?.state).toMatchObject({
      totalSeconds: 600,
      remainingSeconds: 600,
      running: true
    });
  });

  it("writes a note through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("便签记下明早九点开会");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("note")?.state.content).toBe("明早九点开会");
    expect(modelInputs).toEqual([]);
  });

  it("adds a todo item through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("添加待办买牛奶");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("todo")?.state.items).toMatchObject([{ text: "买牛奶" }]);
    expect(modelInputs).toEqual([]);
  });

  it("adds a clipboard widget and saves text when clipboard is absent", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness({ initialWidgetTypes: ["weather", "countdown", "note", "todo"] });
    await harness.initialize();

    const response = await harness.handleUserInput("保存到剪贴板账号是 demo");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("clipboard")?.state.items).toMatchObject([{ text: "账号是 demo" }]);
    expect(modelInputs).toEqual([]);
  });

  it("sets translate, converter, calculator, market, clock, and headline widgets without model fallback", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const translate = await harness.handleUserInput("把你好翻译成英文");
    const converter = await harness.handleUserInput("12米换算成公里");
    const calculator = await harness.handleUserInput("计算 12+30");
    const market = await harness.handleUserInput("看标普和恒生行情");
    const clock = await harness.handleUserInput("世界时钟显示北京伦敦纽约");
    const headline = await harness.handleUserInput("刷新新闻");

    expect([translate, converter, calculator, market, clock, headline].map((response) => response.result)).toMatchObject([
      { status: "success" },
      { status: "success" },
      { status: "success" },
      { status: "success" },
      { status: "success" },
      { status: "success" }
    ]);
    expect([translate, converter, calculator, market, clock, headline].map((response) => response.route)).toEqual([
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut"
    ]);
    expect(getWidget("translate")?.state).toMatchObject({ sourceText: "你好", targetLang: "en" });
    expect(getWidget("converter")?.state).toMatchObject({ inputValue: "12", fromUnit: "m", toUnit: "km" });
    expect(getWidget("calculator")?.state.calcDisplay).toBe("42");
    expect(getWidget("market")?.state.indexCodes).toEqual(["usINX", "hkHSI"]);
    expect(getWidget("worldClock")?.state.zones).toEqual(
      expect.arrayContaining(["Asia/Shanghai", "Europe/London", "America/New_York"])
    );
    expect(getWidget("headline")?.state.headlineRefreshRequestedAt).toBe(NOW);
    expect(modelInputs).toEqual([]);
  });

  it("cancels a confirmation-required pending action without mutation", async () => {
    const { harness, getWidget } = createAcceptanceHarness();
    await harness.initialize();
    await harness.handleUserInput("整理桌面");

    const response = await harness.handleUserInput("取消");

    expect(response.result.status).toBe("cancelled");
    expect(getWidget("note")).toBeTruthy();
  });

  it("closes a widget immediately without confirmation", async () => {
    const { harness, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("关闭便签");

    expect(response.result.status).toBe("success");
    expect(harness.getPendingConfirmation()).toBeNull();
    expect(getWidget("note")).toBeFalsy();
  });

  it("does not block previously deferred requests before model fallback", async () => {
    const { harness, modelInputs } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("帮我生成一个新工具");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("needs_clarification");
    expect(modelInputs).toEqual(["帮我生成一个新工具"]);
  });
});
