import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  createDefaultIntentShortcutRouter,
  createCommandPlanFromToolCalls,
  normalizeText,
  segmentCommandText,
  type CommandPlan,
  type AssistantToolCall,
  type AssistantToolResult,
  type ContextSummarizerInput,
  type IntentShortcutContext
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { AssistantHarness, type AssistantRealtimeAdapter } from "./AssistantHarness";
import { createAppShellActions } from "./appShellActions";
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
  const appShell = {
    sidebarOpen: true,
    fullscreen: false,
    opened: [] as string[]
  };
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
  createAppShellActions({
    getSidebarOpen: () => appShell.sidebarOpen,
    setSidebarOpen: (open) => {
      appShell.sidebarOpen = open;
    },
    getFullscreen: () => appShell.fullscreen,
    setFullscreen: (enabled) => {
      appShell.fullscreen = enabled;
    },
    openSettings: () => {
      appShell.opened.push("settings");
    },
    openCommandPalette: (query) => {
      appShell.opened.push(query ? `command_palette:${query}` : "command_palette");
    },
    openAiDialog: (prompt) => {
      appShell.opened.push(prompt ? `ai_dialog:${prompt}` : "ai_dialog");
    }
  }).forEach((action) => registry.register(action));
  registerBoardActions(registry, adapter);
  createWidgetStateActions(adapter).forEach((action) => registry.register(action));
  const shortcutRouter = createDefaultIntentShortcutRouter();
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
  const buildShortcutContext = (): IntentShortcutContext => {
    const input = getContextInput();
    const availableWidgets = input.widgets?.map((item) => ({
      widgetId: item.widgetId,
      definitionId: item.definitionId,
      type: item.type,
      name: item.name,
      order: item.order,
      summary: "",
      focused: item.widgetId === input.focusedWidgetId
    })) ?? [];
    return {
      source: "realtime",
      currentTime: NOW,
      boardId: input.boardId,
      boardName: input.boardName,
      availableBoards: input.availableBoards,
      availableWidgets,
      availableDefinitions: input.availableDefinitions,
      focusedWidget: availableWidgets.find((item) => item.widgetId === input.focusedWidgetId)
    };
  };
  const createRealtimePlanFromInput = (input: string): CommandPlan | null => {
    const calls: AssistantToolCall[] = [];
    let planningContext = buildShortcutContext();
    const segments = segmentCommandText(input);
    for (const segment of segments.length ? segments : [{ text: input }]) {
      const routed = shortcutRouter.route(segment.text, planningContext);
      if (!routed.matched) return null;
      const call: AssistantToolCall = {
        ...routed.toolCall,
        id: routed.toolCall.id || `rt_${calls.length + 1}`,
        source: "realtime",
        transcript: segment.text
      };
      calls.push(call);
      planningContext = updatePlanningContext(planningContext, call);
    }
    if (!calls.length) return null;
    const plan = createCommandPlanFromToolCalls(input, calls);
    plan.createdBy = "realtime-2";
    plan.normalizedText = normalizeText(input);
    plan.executionGroups = calls.map((call, index) => ({
      id: `group_${index + 1}`,
      mode: "sequential",
      commandIds: [call.id]
    }));
    plan.commands = plan.commands.map((command) => ({
      ...command,
      source: "realtime",
      confidence: 0.92,
      risk: registry.get(command.tool)?.risk ?? command.risk
    }));
    return plan;
  };

  const realtime: AssistantRealtimeAdapter = {
    updateTools() {},
    sendToolResult(_call, result) {
      sentResults.push(result);
    },
    requestCommandPlan(input) {
      const plan = createRealtimePlanFromInput(input);
      if (plan) {
        modelInputs.push(input);
      }
      return plan;
    },
    requestToolCall(input) {
      modelInputs.push(input);
      return options?.modelCall ?? null;
    }
  };

  const harness = new AssistantHarness({
    registry,
    shortcutRouter,
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
    getAppShell: () => appShell,
    getBoards: () => boards,
    getActiveBoard: () => boards.find((board) => board.id === activeBoardId),
    getAllWidgets: () => widgets,
    getWidgets: (type: string) => widgets.filter((item) => definitions.find((definition) => definition.id === item.definitionId)?.type === type),
    getWidget: (type: string) => widgets.find((item) => item.id === `wi_${type}`)
  };
}

function updatePlanningContext(context: IntentShortcutContext, call: AssistantToolCall): IntentShortcutContext {
  if (!call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)) {
    return context;
  }
  const args = call.arguments as Record<string, unknown>;
  if (call.name !== "board.add_widget" || typeof args.definitionId !== "string") {
    return context;
  }
  const definition = context.availableDefinitions?.find((item) => item.definitionId === args.definitionId);
  if (!definition) {
    return context;
  }
  const plannedWidget = {
    widgetId: `planned_${definition.type}`,
    definitionId: definition.definitionId,
    type: definition.type,
    name: definition.name,
    order: -1,
    summary: "",
    focused: true,
    recent: true
  };
  return {
    ...context,
    availableWidgets: [plannedWidget, ...(context.availableWidgets ?? []).map((item) => ({ ...item, focused: false }))],
    focusedWidget: plannedWidget
  };
}

describe("stage-one assistant acceptance scenarios", () => {
  it("runs app shell window controls locally without Realtime auth", async () => {
    const { harness, modelInputs, getAppShell } = createAcceptanceHarness();
    await harness.initialize();

    const hide = await harness.handleUserInput("把左边栏先藏起来");
    const show = await harness.handleUserInput("侧边栏重新显示");
    const enterFullscreen = await harness.handleUserInput("进入沉浸全屏");
    const exitFullscreen = await harness.handleUserInput("退出全屏回普通窗口");
    const settings = await harness.handleUserInput("打开小桌板设置");
    const palette = await harness.handleUserInput("打开搜索命令面板");
    const aiDialog = await harness.handleUserInput("我要新建一个 AI 小工具");

    expect([hide, show, enterFullscreen, exitFullscreen, settings, palette, aiDialog].map((response) => response.route)).toEqual([
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut",
      "shortcut"
    ]);
    expect(getAppShell()).toMatchObject({
      sidebarOpen: true,
      fullscreen: false,
      opened: ["settings", "command_palette", "ai_dialog"]
    });
    expect(modelInputs).toEqual([]);
  });

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

  it("sets the countdown from timer shorthand", async () => {
    const { harness, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("定时十分钟");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("countdown")?.state).toMatchObject({
      totalSeconds: 600,
      remainingSeconds: 600,
      running: true
    });
  });

  it("rewrites a realtime add-countdown function call into setting the existing countdown", async () => {
    const { harness, getWidget, getWidgets } = createAcceptanceHarness({ initialWidgetTypes: ["countdown", "note"] });
    await harness.initialize();

    const response = await harness.handleFunctionCall({
      id: "rt_countdown_30m",
      name: "board.add_widget",
      arguments: { definitionId: "wd_countdown" },
      source: "realtime",
      transcript: "倒计时30分钟"
    });

    expect(response.route).toBe("function_call");
    expect(response.result.status).toBe("success");
    expect(getWidgets("countdown")).toHaveLength(1);
    expect(getWidget("countdown")?.state).toMatchObject({
      totalSeconds: 1800,
      remainingSeconds: 1800,
      running: true
    });
  });

  it("adds one countdown and immediately applies the duration when realtime has no countdown target", async () => {
    const { harness, getWidgets } = createAcceptanceHarness({ initialWidgetTypes: ["note"] });
    await harness.initialize();

    const response = await harness.handleFunctionCall({
      id: "rt_countdown_add_30m",
      name: "board.add_widget",
      arguments: { definitionId: "wd_countdown" },
      source: "realtime",
      transcript: "倒计时30分钟"
    });

    const countdowns = getWidgets("countdown");
    expect(response.result.status).toBe("success");
    expect(countdowns).toHaveLength(1);
    expect(countdowns[0]?.state).toMatchObject({
      totalSeconds: 1800,
      remainingSeconds: 1800,
      running: true
    });
  });

  it("routes high-confidence timer, note, and translate commands locally", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    await harness.handleUserInput("定时十分钟");
    const countdown = await harness.handleUserInput("暂停计时");
    const note = await harness.handleUserInput("帮我记个便签：晚上复盘");
    const translate = await harness.handleUserInput("hello 是什么意思");

    expect([countdown, note, translate].map((response) => response.route)).toEqual(["shortcut", "shortcut", "shortcut"]);
    expect([countdown, note, translate].map((response) => response.result)).toMatchObject([
      { status: "success" },
      { status: "success" },
      { status: "success" }
    ]);
    expect(getWidget("countdown")?.state).toMatchObject({ running: false, targetEndsAt: 0 });
    expect(getWidget("note")?.state.content).toBe("晚上复盘");
    expect(getWidget("translate")?.state).toMatchObject({ sourceText: "hello", targetLang: "zh-CN" });
    expect(modelInputs).toEqual([]);
  });

  it("creates a named board through Realtime planning when shortcut confidence is low", async () => {
    const { harness, modelInputs, getActiveBoard, getBoards } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("新建桌板叫测试桌板");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(getBoards()).toHaveLength(2);
    expect(getActiveBoard()?.name).toBe("测试桌板");
    expect(modelInputs).toEqual(["新建桌板叫测试桌板"]);
  });

  it("defers complex shell instructions to Realtime instead of executing a partial local shortcut", async () => {
    const { harness, modelInputs, getAppShell } = createAcceptanceHarness({
      modelCall: {
        id: "model_palette",
        name: "app.command_palette.open",
        arguments: { query: "天气" },
        source: "realtime"
      }
    });
    await harness.initialize();

    const response = await harness.handleUserInput("退出全屏，打开搜索面板，然后输入天气两个字");

    expect(response.route).toBe("model");
    expect(modelInputs).toEqual(["退出全屏，打开搜索面板，然后输入天气两个字"]);
    expect(getAppShell().opened).toEqual(["command_palette"]);
  });

  it("defers complex widget lifecycle instructions to Realtime before segmenting local shortcuts", async () => {
    const { harness, modelInputs } = createAcceptanceHarness();
    await harness.initialize();

    await harness.handleUserInput("关闭留言板，然后打开一个新的便签实例");
    await harness.handleUserInput("把翻译窗口拖到便签下面，并聚焦翻译输入框");
    await harness.handleUserInput("关闭天气和新闻，只保留音乐、电视、待办");
    await harness.handleUserInput("再开一个天气窗口用于对比北京和上海");

    expect(modelInputs).toEqual([
      "关闭留言板，然后打开一个新的便签实例",
      "把翻译窗口拖到便签下面，并聚焦翻译输入框",
      "关闭天气和新闻，只保留音乐、电视、待办",
      "再开一个天气窗口用于对比北京和上海"
    ]);
  });

  it("defers precise music playback workflows to Realtime before local search shortcuts", async () => {
    const { harness, modelInputs } = createAcceptanceHarness();
    await harness.initialize();

    await harness.handleUserInput("打开音乐播放器，搜索邓紫棋泡沫并播放");
    await harness.handleUserInput("给我放五月天倔强，播放后把歌词搜索也打开");
    await harness.handleUserInput("给我放刘若英后来，播放器没有打开就先打开");

    expect(modelInputs).toEqual([
      "打开音乐播放器，搜索邓紫棋泡沫并播放",
      "给我放五月天倔强，播放后把歌词搜索也打开",
      "给我放刘若英后来，播放器没有打开就先打开"
    ]);
  });

  it("records structured deferral reasons across varied complex command families", async () => {
    const { harness, modelInputs } = createAcceptanceHarness();
    await harness.initialize();
    const cases = [
      ["关闭留言板时执行关闭，不是发送关闭", "correction_or_negation"],
      ["查上海天气决定下午是否出门", "multi_step"],
      ["电视全屏时隐藏侧边栏", "tv_workflow"],
      ["音乐登录按钮挡住封面，放到右上角", "window_layout"],
      ["翻译成中文后复制到剪贴板", "translation_workflow"]
    ] as const;

    for (const [command, category] of cases) {
      const response = await harness.handleUserInput(command);
      expect(response.route).toBe("model");
      expect(harness.getLastDiagnostics()?.shortcutDeferral).toMatchObject({ category });
    }

    expect(modelInputs).toEqual(cases.map(([command]) => command));
  });

  it("opens widgets from casual aliases without model fallback", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness({ initialWidgetTypes: ["weather", "todo"] });
    await harness.initialize();

    const list = await harness.handleUserInput("唤出清单");
    const converter = await harness.handleUserInput("开一下单位换算");

    expect([list, converter].map((response) => response.route)).toEqual(["shortcut", "shortcut"]);
    expect([list, converter].map((response) => response.result)).toMatchObject([
      { status: "success" },
      { status: "success" }
    ]);
    expect(getWidget("todo")).toBeTruthy();
    expect(getWidget("converter")).toBeTruthy();
    expect(modelInputs).toEqual([]);
  });

  it("renames the active board through Realtime planning when shortcut confidence is low", async () => {
    const { harness, modelInputs, getActiveBoard } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("把当前桌板重命名为工作台");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(getActiveBoard()?.name).toBe("工作台");
    expect(modelInputs).toEqual(["把当前桌板重命名为工作台"]);
  });

  it("switches boards by name through Realtime planning when shortcut confidence is low", async () => {
    const { harness, modelInputs, getActiveBoard } = createAcceptanceHarness();
    await harness.initialize();
    await harness.handleUserInput("新建桌板叫测试桌板");

    const response = await harness.handleUserInput("回我的");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(getActiveBoard()?.name).toBe("我的桌板");
    expect(modelInputs).toEqual(["新建桌板叫测试桌板", "回我的"]);
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

  it("writes casual note shorthand through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("帮我记一下今天继续测试小桌板");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("note")?.state.content).toBe("今天继续测试小桌板");
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

  it("adds call-me reminders through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("下午三点叫我开会");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("todo")?.state.items).toMatchObject([
      { text: "开会", dueAt: new Date(2026, 5, 17, 15, 0, 0).toISOString() }
    ]);
    expect(modelInputs).toEqual([]);
  });

  it("adds soon reminders through shortcut-first Harness without model fallback", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("一会儿提醒我喝水");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("todo")?.state.items).toMatchObject([
      { text: "喝水", dueAt: new Date(Date.parse(NOW) + 10 * 60 * 1000).toISOString() }
    ]);
    expect(modelInputs).toEqual([]);
  });

  it("completes a todo from explicit shorthand wording locally", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();
    await harness.handleUserInput("添加待办买牛奶");

    const response = await harness.handleUserInput("把买牛奶勾掉");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("todo")?.state.items).toEqual([]);
    expect(modelInputs).toEqual([]);
  });

  it("adds a clipboard widget and saves explicit text locally when clipboard is absent", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness({ initialWidgetTypes: ["weather", "countdown", "note", "todo"] });
    await harness.initialize();

    const response = await harness.handleUserInput("保存到剪贴板账号是 demo");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("clipboard")?.state.items).toMatchObject([{ text: "账号是 demo" }]);
    expect(modelInputs).toEqual([]);
  });

  it("adds copied text to clipboard locally", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("复制账号 demo 到剪贴板");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("clipboard")?.state.items).toMatchObject([{ text: "账号 demo" }]);
    expect(modelInputs).toEqual([]);
  });

  it("adds pinned clipboard text locally", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("固定保存到剪贴板账号是 demo");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("clipboard")?.state.items).toMatchObject([{ text: "账号是 demo", pinned: true }]);
    expect(modelInputs).toEqual([]);
  });

  it("keeps explicit daily widget controls local while lower-confidence market/news requests use Realtime planning", async () => {
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
      "model",
      "shortcut",
      "model"
    ]);
    expect(getWidget("translate")?.state).toMatchObject({ sourceText: "你好", targetLang: "en" });
    expect(getWidget("converter")?.state).toMatchObject({ inputValue: "12", fromUnit: "m", toUnit: "km" });
    expect(getWidget("calculator")?.state.calcDisplay).toBe("42");
    expect(getWidget("market")?.state.indexCodes).toEqual(["usINX", "hkHSI"]);
    expect(getWidget("worldClock")?.state.zones).toEqual(
      expect.arrayContaining(["Asia/Shanghai", "Europe/London", "America/New_York"])
    );
    expect(getWidget("headline")?.state.headlineRefreshRequestedAt).toBe(NOW);
    expect(modelInputs).toEqual(["看标普和恒生行情", "刷新新闻"]);
  });

  it("sets everyday Chinese weight conversion locally", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("2斤是多少克");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("converter")?.state).toMatchObject({ inputValue: "1", fromUnit: "kg", toUnit: "g" });
    expect(modelInputs).toEqual([]);
  });

  it("keeps high-confidence aliases local and routes lower-confidence aliases through Realtime", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const weather = await harness.handleUserInput("帝都天气");
    const market = await harness.handleUserInput("美股怎么样");
    const clock = await harness.handleUserInput("NYC and Tokyo time");

    expect([weather, market, clock].map((response) => response.route)).toEqual(["shortcut", "model", "shortcut"]);
    expect([weather, market, clock].map((response) => response.result)).toMatchObject([
      { status: "success" },
      { status: "success" },
      { status: "success" }
    ]);
    expect(getWidget("weather")?.state.cityCode).toBe("beijing");
    expect(getWidget("market")?.state.indexCodes).toEqual(["usINX", "usNDX", "usDJI"]);
    expect(getWidget("worldClock")?.state.zones).toEqual(
      expect.arrayContaining(["America/New_York", "Asia/Tokyo"])
    );
    expect(modelInputs).toEqual(["美股怎么样"]);
  });

  it("sets casual explicit translate shorthand locally", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("翻译一下 hello");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("translate")?.state).toMatchObject({ sourceText: "hello", targetLang: "zh-CN" });
    expect(modelInputs).toEqual([]);
  });

  it("sets calculator from natural Chinese arithmetic locally", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("12加30是多少");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(getWidget("calculator")?.state.calcDisplay).toBe("42");
    expect(modelInputs).toEqual([]);
  });

  it("refreshes headlines from natural news request through Realtime planning", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("今天有什么新闻");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(getWidget("headline")?.state.headlineRefreshRequestedAt).toBe(NOW);
    expect(modelInputs).toEqual(["今天有什么新闻"]);
  });

  it("continues a queued todo command after confirming clipboard clear", async () => {
    const { harness, modelInputs, getWidget } = createAcceptanceHarness();
    await harness.initialize();

    const first = await harness.handleUserInput("清空剪贴板，然后添加一条待办：明天买牛奶");

    expect(first.route).toBe("shortcut");
    expect(first.result.status).toBe("needs_confirmation");
    expect(harness.getPendingConfirmation()).toMatchObject({
      actionName: "clipboard.clear",
      arguments: { widgetId: "wi_clipboard", includePinned: false }
    });
    expect(getWidget("todo")?.state.items).toBeUndefined();

    const confirmed = await harness.handleUserInput("确认");

    expect(confirmed.route).toBe("shortcut");
    expect(confirmed.result.status).toBe("success");
    expect(confirmed.result.message).toContain("已清理剪贴板历史");
    expect(confirmed.result.message).toContain("已新增待办");
    expect(getWidget("todo")?.state.items).toMatchObject([{ text: "买牛奶" }]);
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

  it("closes every widget through the realtime command path", async () => {
    const { harness, getAllWidgets, modelInputs } = createAcceptanceHarness({
      initialWidgetTypes: ["weather", "countdown", "note", "todo", "worldClock", "headline", "calculator"]
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput("关闭所有小工具");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(harness.getPendingConfirmation()).toBeNull();
    expect(getAllWidgets()).toHaveLength(0);
    expect(modelInputs).toEqual([]);
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
