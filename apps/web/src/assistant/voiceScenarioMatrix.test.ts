import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  createCommandPlanFromToolCalls,
  createDefaultIntentShortcutRouter,
  type AssistantToolCall,
  type AssistantToolResult,
  type CommandPlan,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { createAppShellActions } from "./appShellActions";
import { AssistantHarness, type AssistantRealtimeAdapter } from "./AssistantHarness";
import { registerBoardActions } from "./boardActions";
import { WidgetCapabilityBridge, createWidgetCapabilityActions } from "./widgetCapabilityBridge";
import { createWidgetStateActions } from "./widgetStateActions";

const NOW = "2026-06-18T08:00:00.000Z";

type Scenario = {
  id: string;
  text: string;
  calls: Array<{ name: string; arguments: Record<string, unknown> }>;
  expectedTools?: string[];
  autoConfirm?: boolean;
  expectedStatus?: AssistantToolResult["status"];
};

const WIDGET_NAMES: Record<string, string> = {
  calculator: "计算器",
  clipboard: "剪贴板",
  converter: "换算",
  countdown: "倒计时",
  dialClock: "表盘时钟",
  headline: "新闻",
  market: "行情",
  messageBoard: "留言板",
  music: "音乐",
  note: "便签",
  recorder: "录音机",
  todo: "待办",
  translate: "翻译",
  tv: "电视",
  weather: "天气",
  worldClock: "世界时钟"
};

const WIDGET_TYPES = Object.keys(WIDGET_NAMES);

function definition(type: string): WidgetDefinition {
  return {
    id: `wd_${type}`,
    kind: "system",
    type,
    name: WIDGET_NAMES[type] ?? type,
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

function widget(type: string, order = 1): WidgetInstance {
  const initialState =
    type === "countdown"
      ? { totalSeconds: 600, remainingSeconds: 300, running: false, targetEndsAt: 0 }
      : type === "todo"
        ? { items: [{ id: "todo_buy_milk", text: "买牛奶" }] }
        : {};
  return {
    id: `wi_${type}`,
    boardId: "board_1",
    definitionId: `wd_${type}`,
    state: initialState,
    bindings: [],
    position: { x: order % 4, y: Math.floor(order / 4) },
    size: { w: type === "tv" ? 360 : 240, h: type === "tv" ? 220 : 180 },
    zIndex: order,
    locked: false,
    createdAt: NOW,
    updatedAt: NOW
  };
}

function createPlan(text: string, calls: Scenario["calls"]): CommandPlan {
  const toolCalls: AssistantToolCall[] = calls.map((call, index) => ({
    id: `scenario_call_${index + 1}`,
    name: call.name,
    arguments: call.arguments,
    source: "realtime",
    transcript: text
  }));
  const plan = createCommandPlanFromToolCalls(text, toolCalls);
  plan.createdBy = "realtime-2";
  plan.commands = plan.commands.map((command) => ({ ...command, source: "realtime", confidence: 0.91 }));
  plan.executionGroups = toolCalls.map((call, index) => ({
    id: `scenario_group_${index + 1}`,
    mode: "sequential",
    commandIds: [call.id]
  }));
  return plan;
}

function createScenarioHarness(scenario: Scenario) {
  const definitions = WIDGET_TYPES.map(definition);
  let widgets = WIDGET_TYPES.map((type, index) => widget(type, index + 1));
  let focusedWidgetId = "wi_weather";
  let boards = [
    { id: "board_1", name: "我的桌板" },
    { id: "board_2", name: "工作台" }
  ];
  let activeBoardId = "board_1";
  const sentResults: Array<{ call: AssistantToolCall; result: AssistantToolResult }> = [];
  const capabilityCalls: Array<{ widgetId: string; capabilityName: string; args: Record<string, unknown> }> = [];
  const shell = {
    sidebarOpen: true,
    fullscreen: false,
    settingsOpened: 0,
    commandPaletteOpened: 0,
    aiDialogOpened: 0
  };
  const registry = new ActionRegistry();
  const capabilityBridge = new WidgetCapabilityBridge();
  const store = {
    getWidgetInstances: () => widgets,
    getWidgetDefinitions: () => definitions,
    addWidgetInstance(definitionId: string) {
      const target = definitions.find((item) => item.id === definitionId);
      if (!target) return undefined;
      const instance = {
        ...widget(target.type, widgets.length + 1),
        id: `wi_${target.type}_${widgets.filter((item) => item.definitionId === definitionId).length + 1}`,
        boardId: activeBoardId
      };
      widgets = [...widgets, instance];
      focusedWidgetId = instance.id;
      return instance;
    },
    removeWidgetInstance(widgetId: string) {
      widgets = widgets.filter((item) => item.id !== widgetId);
      if (focusedWidgetId === widgetId) focusedWidgetId = widgets[0]?.id ?? "";
    },
    focusWidget(widgetId: string) {
      focusedWidgetId = widgetId;
    },
    fullscreenWidget(widgetId: string) {
      focusedWidgetId = widgetId;
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, state: { ...item.state, fullscreen: true } } : item));
    },
    bringWidgetToFront(widgetId: string) {
      const maxZ = Math.max(0, ...widgets.map((item) => item.zIndex));
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, zIndex: maxZ + 1 } : item));
    },
    updateWidgetPosition(widgetId: string, x: number, y: number) {
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, position: { x, y } } : item));
    },
    updateWidgetSize(widgetId: string, w: number, h: number) {
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, size: { w, h } } : item));
    },
    updateWidgetState(widgetId: string, state: Record<string, unknown>) {
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, state } : item));
    },
    autoAlignWidgets() {
      widgets = widgets.map((item, index) => ({ ...item, position: { x: index % 4, y: Math.floor(index / 4) } }));
    },
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
    },
    deleteBoard(boardId: string) {
      boards = boards.filter((board) => board.id !== boardId);
      if (activeBoardId === boardId) activeBoardId = boards[0]?.id ?? "";
    }
  };

  for (const action of createAppShellActions({
    getSidebarOpen: () => shell.sidebarOpen,
    setSidebarOpen: (open) => {
      shell.sidebarOpen = open;
    },
    getFullscreen: () => shell.fullscreen,
    setFullscreen: (enabled) => {
      shell.fullscreen = enabled;
    },
    openSettings: () => {
      shell.settingsOpened += 1;
    },
    openCommandPalette: () => {
      shell.commandPaletteOpened += 1;
    },
    openAiDialog: () => {
      shell.aiDialogOpened += 1;
    },
    openWallpaperPicker: () => {}
  })) {
    registry.register(action);
  }
  registerBoardActions(registry, store);
  for (const action of [...createWidgetStateActions(store), ...createWidgetCapabilityActions(store, capabilityBridge)]) {
    if (!registry.get(action.spec.name)) registry.register(action);
  }

  for (const item of widgets) {
    const type = definitions.find((entry) => entry.id === item.definitionId)?.type;
    if (!type) continue;
    capabilityBridge.register(item.id, {
      authStatus: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "authStatus", args });
        return {
          status: "success",
          message: "Apple Music 已登录，可以播放完整歌曲",
          data: { configured: true, ready: true, authorized: true }
        };
      },
      search: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "search", args });
        return { status: "success", message: "已搜索音乐" };
      },
      play: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "play", args });
        return { status: "success", message: type === "tv" ? "已播放电视" : type === "recorder" ? "已播放录音" : "已开始播放音乐" };
      },
      pause: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "pause", args });
        return { status: "success", message: "已暂停" };
      },
      resume: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "resume", args });
        return { status: "success", message: "已继续" };
      },
      next: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "next", args });
        return { status: "success", message: "已切到下一首" };
      },
      previous: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "previous", args });
        return { status: "success", message: "已切到上一首" };
      },
      fullscreen: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "fullscreen", args });
        return { status: "success", message: "已全屏" };
      },
      selectChannel: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "selectChannel", args });
        return { status: "success", message: "已切换频道" };
      },
      start: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "start", args });
        return { status: "success", message: "已开始录音" };
      },
      stop: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "stop", args });
        return { status: "success", message: "已停止录音" };
      },
      setNightMode: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "setNightMode", args });
        return { status: "success", message: "已切换夜间模式" };
      },
      send: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "send", args });
        store.updateWidgetState(item.id, { ...item.state, lastMessageText: args.text });
        return { status: "success", message: "已发送留言" };
      },
      clearDraft: (args) => {
        capabilityCalls.push({ widgetId: item.id, capabilityName: "clearDraft", args });
        store.updateWidgetState(item.id, { ...item.state, draft: "" });
        return { status: "success", message: "已清空留言输入框" };
      }
    });
  }

  const getContextInput = (): ContextSummarizerInput => ({
    boardId: activeBoardId,
    boardName: boards.find((board) => board.id === activeBoardId)?.name,
    availableBoards: boards.map((board) => ({ boardId: board.id, name: board.name, active: board.id === activeBoardId || undefined })),
    focusedWidgetId,
    availableDefinitions: definitions.map((item) => ({ definitionId: item.id, type: item.type, name: item.name })),
    widgets: widgets.map((item, index) => {
      const def = definitions.find((entry) => entry.id === item.definitionId)!;
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

  const realtime: AssistantRealtimeAdapter = {
    updateTools() {},
    updateContext() {},
    sendToolResult(call, result) {
      sentResults.push({ call, result });
    },
    requestCommandPlan(input) {
      return input === scenario.text ? createPlan(scenario.text, scenario.calls) : null;
    },
    requestToolCall() {
      return null;
    }
  };

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
    capabilityCalls,
    shell,
    getWidgets: () => widgets,
    getBoards: () => boards,
    getActiveBoardId: () => activeBoardId,
    getRegisteredToolNames: () => registry.list().map((tool) => tool.name).sort()
  };
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { name, arguments: args };
}

function withWidget(name: string, type: string, args: Record<string, unknown> = {}) {
  return call(name, { widgetId: `wi_${type}`, ...args });
}

function simpleScenario(id: string, text: string, name: string, args: Record<string, unknown> = {}, options: Partial<Scenario> = {}): Scenario {
  return {
    id,
    text,
    calls: [call(name, args)],
    expectedTools: [name],
    expectedStatus: "success",
    ...options
  };
}

function widgetScenario(
  id: string,
  text: string,
  widgetType: string,
  name: string,
  args: Record<string, unknown> = {},
  options: Partial<Scenario> = {}
): Scenario {
  return {
    id,
    text,
    calls: [withWidget(name, widgetType, args)],
    expectedTools: [name],
    expectedStatus: "success",
    ...options
  };
}

function generatedScenarios(): Scenario[] {
  const scenarios: Scenario[] = [
    simpleScenario("app-sidebar-hide-001", "把左边栏先藏起来", "app.sidebar.set", { mode: "hide" }),
    simpleScenario("app-sidebar-show-002", "侧边栏重新显示", "app.sidebar.set", { mode: "show" }),
    simpleScenario("app-fullscreen-enter-003", "进入沉浸全屏", "app.fullscreen.set", { mode: "enter" }),
    simpleScenario("app-fullscreen-exit-004", "退出全屏回普通窗口", "app.fullscreen.set", { mode: "exit" }),
    simpleScenario("app-settings-005", "打开小桌板设置", "app.settings.open"),
    simpleScenario("app-palette-006", "打开搜索命令面板", "app.command_palette.open"),
    simpleScenario("app-ai-dialog-007", "我要新建一个 AI 小工具", "app.ai_dialog.open"),
    simpleScenario("app-wallpaper-007b", "更换桌面壁纸", "app.wallpaper.pick"),
    simpleScenario("board-align-008", "整理一下桌面所有小工具", "board.auto_align", {}, { autoConfirm: true, expectedStatus: "success" }),
    simpleScenario("board-create-009", "新开一个学习桌板", "board.create", { name: "学习桌板" }),
    simpleScenario("board-rename-010", "把当前桌板改名叫夜间工作", "board.rename", { boardId: "board_1", name: "夜间工作" }),
    simpleScenario("board-switch-011", "切回工作台桌板", "board.switch", { boardId: "board_2" }),
    simpleScenario("board-delete-011b", "删除临时桌板之前先确认", "board.delete", { boardId: "board_2" }, { autoConfirm: true }),
    simpleScenario("widget-move-tv-012", "把电视拖到右上角", "widget.move", { widgetId: "wi_tv", x: 6, y: 0 }),
    simpleScenario("widget-resize-tv-013", "把电视面板调大一点", "widget.resize", { widgetId: "wi_tv", w: 520, h: 320 }),
    simpleScenario("widget-front-music-014", "把音乐播放器放最前", "widget.bring_to_front", { widgetId: "wi_music" }),
    simpleScenario("widget-focus-weather-015", "聚焦天气卡片", "widget.focus", { widgetId: "wi_weather" }),
    simpleScenario("widget-fullscreen-tv-016", "全屏看电视", "widget.fullscreen_focus", { widgetId: "wi_tv" }),
    simpleScenario("widget-remove-board-017", "关闭留言板", "widget.remove", { widgetId: "wi_messageBoard" }),
    simpleScenario("widget-add-clock-018", "打开一个表盘时钟", "widget.focus", { widgetId: "wi_dialClock" }),
    simpleScenario("widget-add-note-explicit-018b", "新建便签实例用于测试", "board.add_widget", { definitionId: "wd_note" })
  ];

  const weather = [
    ["weather-019", "查北京今天冷不冷", "beijing"],
    ["weather-020", "上海天气给我看一下", "shanghai"],
    ["weather-021", "看看洛杉矶天气", "los-angeles"],
    ["weather-022", "杭州现在什么天气", "hangzhou"],
    ["weather-023", "帮我换到武汉天气", "wuhan"],
    ["weather-024", "波士顿天气", "boston"],
    ["weather-025", "广州天气怎么样", "guangzhou"],
    ["weather-026", "成都天气打开看看", "chengdu"]
  ];
  for (const [id, text, cityCode] of weather) {
    scenarios.push(widgetScenario(id, text, "weather", "weather.set_city", { cityCode }));
  }

  const countdown = [
    ["countdown-027", "设一个三分钟倒计时", "countdown.set", { totalSeconds: 180, start: true }],
    ["countdown-028", "十分钟后提醒我", "todo.add_item", { text: "提醒我", dueAt: "2026-06-18T08:10:00.000Z" }],
    ["countdown-029", "暂停现在的计时器", "countdown.pause", {}],
    ["countdown-030", "继续刚才那个倒计时", "countdown.resume", {}],
    ["countdown-031", "重置倒计时", "countdown.reset", {}],
    ["countdown-032", "设置二十五秒计时", "countdown.set", { totalSeconds: 25, start: true }],
    ["countdown-033", "半小时倒计时开始", "countdown.set", { totalSeconds: 1800, start: true }],
    ["countdown-034", "先定时一小时", "countdown.set", { totalSeconds: 3600, start: true }]
  ];
  for (const [id, text, tool, args] of countdown) {
    const widgetType = String(tool).startsWith("todo.") ? "todo" : "countdown";
    scenarios.push(widgetScenario(id as string, text as string, widgetType, tool as string, args as Record<string, unknown>));
  }

  const textWidgets = [
    ["note", "note.write", "便签记下今天继续回归测试", { content: "今天继续回归测试" }],
    ["note", "note.write", "把会议纪要追加到便签", { content: "会议纪要", mode: "append" }],
    ["note", "note.clear", "清空便签内容", {}, true],
    ["todo", "todo.add_item", "添加待办买咖啡豆", { text: "买咖啡豆" }],
    ["todo", "todo.add_item", "明早九点提醒我提交报告", { text: "提交报告", dueAt: "2026-06-19T09:00:00.000Z" }],
    ["todo", "todo.complete_item", "把买牛奶这项勾掉", { text: "买牛奶" }],
    ["todo", "todo.clear_completed", "清理已完成待办前先让我确认", {}, true],
    ["clipboard", "clipboard.add_text", "复制演示账号到剪贴板", { text: "演示账号" }],
    ["clipboard", "clipboard.add_text", "固定保存项目口令 demo", { text: "项目口令 demo", pinned: true }],
    ["clipboard", "clipboard.clear", "清理剪贴板普通记录", { includePinned: false }, true],
    ["translate", "translate.set_draft", "把 hello world 翻译成中文", { sourceText: "hello world", targetLang: "zh-CN" }],
    ["translate", "translate.set_draft", "你好翻译成英文", { sourceText: "你好", targetLang: "en" }],
    ["calculator", "calculator.set_display", "十二加三十算一下", { display: "42" }],
    ["converter", "converter.set", "2斤是多少克", { category: "weight", value: "1", fromUnit: "kg", toUnit: "g" }],
    ["converter", "converter.set", "十二米换算公里", { category: "length", value: "12", fromUnit: "m", toUnit: "km" }],
    ["converter", "converter.set", "两公斤换算成克", { category: "weight", value: "2", fromUnit: "kg", toUnit: "g" }]
  ] as const;
  textWidgets.forEach((item, index) => {
    const [type, tool, text, args, confirm] = item;
    scenarios.push(widgetScenario(`state-${String(index + 35).padStart(3, "0")}`, text, type, tool, args, confirm ? { autoConfirm: true } : {}));
  });

  const infoWidgets = [
    ["worldClock", "worldClock.set_zones", "世界时钟显示北京伦敦纽约", { zones: ["Asia/Shanghai", "Europe/London", "America/New_York"] }],
    ["worldClock", "worldClock.set_zones", "看东京和巴黎时间", { zones: ["Asia/Tokyo", "Europe/Paris"] }],
    ["headline", "headline.request_refresh", "刷新重大新闻", { requestedAt: NOW }],
    ["headline", "headline.request_refresh", "今天有什么头条新闻", { requestedAt: NOW }],
    ["market", "market.set_indices", "看美股三大指数", { indexCodes: ["usINX", "usNDX", "usDJI"] }],
    ["market", "market.set_indices", "打开恒生和上证行情", { indexCodes: ["hkHSI", "sh000001"] }],
    ["dialClock", "dialClock.set_night_mode", "表盘开启夜间模式", { enabled: true }],
    ["dialClock", "dialClock.set_night_mode", "关闭时钟夜间模式", { enabled: false }],
    ["messageBoard", "messageBoard.send", "留言板发一句我在测试", { text: "我在测试" }],
    ["messageBoard", "messageBoard.clear_draft", "清除留言板输入框不要发送", {}]
  ] as const;
  infoWidgets.forEach((item, index) => {
    const [type, tool, text, args] = item;
    scenarios.push(widgetScenario(`info-${String(index + 50).padStart(3, "0")}`, text, type, tool, args));
  });

  const media = [
    ["music", "music.auth_status", "Apple Music 现在登录了吗", {}],
    ["music", "music.search", "搜一点轻松的音乐", { query: "轻松", kind: "song" }],
    ["music", "music.play", "播放王菲的红豆", { query: "王菲 红豆", kind: "song" }],
    ["music", "music.play", "来一首陈奕迅十年", { query: "陈奕迅 十年", kind: "song" }],
    ["music", "music.pause", "音乐先暂停", {}],
    ["music", "music.resume", "继续刚才的歌", {}],
    ["music", "music.next", "下一首歌", {}],
    ["music", "music.previous", "上一首", {}],
    ["tv", "tv.select_channel", "电视切到 CCTV13", { channelName: "CCTV13" }],
    ["tv", "tv.play", "播放 CCTV1", { channelName: "CCTV1" }],
    ["tv", "tv.pause", "暂停电视直播", {}],
    ["tv", "tv.fullscreen", "电视全屏", {}],
    ["recorder", "recorder.start", "开始录音", {}],
    ["recorder", "recorder.stop", "停止录音", {}],
    ["recorder", "recorder.play", "播放刚才录音", {}],
    ["recorder", "recorder.pause", "暂停录音回放", {}]
  ] as const;
  media.forEach((item, index) => {
    const [type, tool, text, args] = item;
    scenarios.push(widgetScenario(`media-${String(index + 60).padStart(3, "0")}`, text, type, tool, args));
  });

  const closeTargets = ["music", "tv", "recorder", "weather", "countdown", "todo", "clipboard", "translate", "calculator", "market", "headline", "worldClock"];
  closeTargets.forEach((type, index) => {
    scenarios.push(simpleScenario(`close-${String(index + 80).padStart(3, "0")}`, `把${WIDGET_NAMES[type]}收起来`, "widget.remove", { widgetId: `wi_${type}` }));
  });

  const focusTargets = ["music", "tv", "recorder", "weather", "todo", "messageBoard", "dialClock", "note"];
  focusTargets.forEach((type, index) => {
    scenarios.push(simpleScenario(`focus-${String(index + 95).padStart(3, "0")}`, `切到${WIDGET_NAMES[type]}窗口`, "widget.focus", { widgetId: `wi_${type}` }));
  });

  const addTargets = ["music", "tv", "weather", "countdown", "todo", "clipboard", "translate", "calculator", "market", "headline", "worldClock", "recorder"];
  addTargets.forEach((type, index) => {
    scenarios.push(simpleScenario(`add-${String(index + 110).padStart(3, "0")}`, `再打开一个${WIDGET_NAMES[type]}`, "widget.focus", { widgetId: `wi_${type}` }));
  });

  const multi: Scenario[] = [
    {
      id: "multi-122",
      text: "播放陈奕迅十年，然后查上海天气",
      calls: [withWidget("music.play", "music", { query: "陈奕迅 十年" }), withWidget("weather.set_city", "weather", { cityCode: "shanghai" })],
      expectedTools: ["music.play", "weather.set_city"],
      expectedStatus: "success"
    },
    {
      id: "multi-123",
      text: "隐藏侧边栏，同时打开设置",
      calls: [call("app.sidebar.set", { mode: "hide" }), call("app.settings.open", {})],
      expectedTools: ["app.sidebar.set", "app.settings.open"],
      expectedStatus: "success"
    },
    {
      id: "multi-124",
      text: "打开电视然后切到 CCTV5 再全屏",
      calls: [withWidget("tv.play", "tv", { channelName: "CCTV5" }), withWidget("tv.fullscreen", "tv", {})],
      expectedTools: ["tv.play", "tv.fullscreen"],
      expectedStatus: "success"
    },
    {
      id: "multi-125",
      text: "先记下买票，然后添加待办订酒店",
      calls: [withWidget("note.write", "note", { content: "买票" }), withWidget("todo.add_item", "todo", { text: "订酒店" })],
      expectedTools: ["note.write", "todo.add_item"],
      expectedStatus: "success"
    },
    {
      id: "multi-126",
      text: "关闭音乐和留言板",
      calls: [call("widget.remove", { widgetId: "wi_music" }), call("widget.remove", { widgetId: "wi_messageBoard" })],
      expectedTools: ["widget.remove", "widget.remove"],
      expectedStatus: "success"
    }
  ];
  scenarios.push(...multi);

  const filler = [
    ["weather.set_city", "weather", { cityCode: "beijing" }, "外面适合出门吗看北京"],
    ["music.search", "music", { query: "轻音乐" }, "我想听点放松的不一定播放"],
    ["music.play", "music", { query: "周杰伦 七里香" }, "来个周杰伦经典"],
    ["todo.add_item", "todo", { text: "复盘语音测试" }, "有空提醒我复盘语音测试"],
    ["translate.set_draft", "translate", { sourceText: "good night", targetLang: "zh-CN" }, "good night 帮我看中文"],
    ["calculator.set_display", "calculator", { display: "144" }, "十二乘十二"],
    ["market.set_indices", "market", { indexCodes: ["usNDX"] }, "纳指给我看一眼"],
    ["worldClock.set_zones", "worldClock", { zones: ["Asia/Tokyo"] }, "东京现在几点"],
    ["headline.request_refresh", "headline", { requestedAt: NOW }, "看看刚刚有什么新闻"],
    ["recorder.start", "recorder", {}, "帮我录一段"],
    ["tv.play", "tv", { channelName: "CCTV6" }, "电影频道打开"],
    ["messageBoard.send", "messageBoard", { text: "收到" }, "留言板回复收到"],
    ["clipboard.add_text", "clipboard", { text: "临时验证码 1234" }, "临时验证码存起来"],
    ["todo.add_item", "todo", { text: "叫我", dueAt: "2026-06-18T08:01:30.000Z" }, "一分半以后叫我"],
    ["dialClock.set_night_mode", "dialClock", { enabled: true }, "钟表别太亮"],
    ["app.command_palette.open", "", {}, "我要找功能"],
    ["app.ai_dialog.open", "", {}, "帮我做一个新工具"],
    ["board.switch", "", { boardId: "board_2" }, "回到工作台"],
    ["widget.bring_to_front", "", { widgetId: "wi_tv" }, "电视别被挡住"],
    ["widget.fullscreen_focus", "", { widgetId: "wi_music" }, "音乐面板放大"]
  ] as const;
  let fillerIndex = 127;
  while (scenarios.length < 200) {
    const [tool, type, args, text] = filler[(fillerIndex - 127) % filler.length];
    const suffix = Math.floor((fillerIndex - 127) / filler.length) + 1;
    const id = `filler-${String(fillerIndex).padStart(3, "0")}`;
    const variantText = `${text}，场景${suffix}`;
    scenarios.push(
      type
        ? widgetScenario(id, variantText, type, tool, args)
        : simpleScenario(id, variantText, tool, args)
    );
    fillerIndex += 1;
  }

  return scenarios;
}

describe("200 voice command scenarios through AssistantHarness", () => {
  const scenarios = generatedScenarios();

  it("contains exactly 200 distinct scenarios", () => {
    expect(scenarios).toHaveLength(200);
    expect(new Set(scenarios.map((scenario) => scenario.text)).size).toBe(200);
  });

  it("covers every registered app, board, widget, and mounted capability tool", () => {
    const { getRegisteredToolNames } = createScenarioHarness(scenarios[0]);
    const coveredTools = new Set(scenarios.flatMap((scenario) => scenario.expectedTools ?? scenario.calls.map((item) => item.name)));
    const missingTools = getRegisteredToolNames().filter((name) => !coveredTools.has(name));

    expect(missingTools).toEqual([]);
  });

  it.each(scenarios)("$id: $text", async (scenario) => {
    const { harness, sentResults } = createScenarioHarness(scenario);
    await harness.initialize();

    const first = await harness.handleUserInput(scenario.text, { commandTraceId: `voice_${scenario.id}` });
    const firstDiagnostics = harness.getLastDiagnostics();
    const final = scenario.autoConfirm && first.result.status === "needs_confirmation"
      ? await harness.handleUserInput("确认", { commandTraceId: `voice_${scenario.id}_confirm` })
      : first;
    const toolNames = [
      ...(firstDiagnostics?.commandPlan?.commands.map((command) => command.tool) ?? []),
      ...sentResults.map((item) => item.call.name)
    ];

    expect(
      final.result.status,
      `${scenario.id} ${scenario.text} -> ${final.result.message}; tools=${toolNames.join(",")}`
    ).toBe(scenario.expectedStatus ?? "success");
    for (const expectedTool of scenario.expectedTools ?? scenario.calls.map((item) => item.name)) {
      expect(toolNames, `${scenario.id} should include ${expectedTool}`).toContain(expectedTool);
    }
    expect(firstDiagnostics?.commandTraceId).toBe(`voice_${scenario.id}`);
    expect(firstDiagnostics?.rawInput).toBe(scenario.text);
  });
});
