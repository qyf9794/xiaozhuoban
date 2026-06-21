import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  createCommandPlanFromToolCalls,
  createDefaultIntentShortcutRouter,
  createPassthroughSchema,
  type AssistantAction,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");
const simulationReportPath = path.join(repoRoot, "docs/realtime-voice-scenario-catalog-simulation-report.md");
const statefulReportPath = path.join(repoRoot, "docs/realtime-voice-scenario-catalog-stateful-harness-report.md");
const NOW = "2026-06-21T08:30:00.000Z";

type CatalogCase = {
  id: number;
  text: string;
  tools: string[];
};

type PlannedCall = {
  name: string;
  arguments: Record<string, unknown>;
};

type WidgetSnapshot = Pick<WidgetInstance, "id" | "definitionId" | "state" | "position" | "size" | "zIndex">;

const widgetNames: Record<string, string> = {
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

const widgetAliases: Array<{ type: string; aliases: RegExp[] }> = [
  { type: "messageBoard", aliases: [/留言板|留言/] },
  { type: "worldClock", aliases: [/世界时钟|世界时间|时区|东京|巴黎|纽约|伦敦/] },
  { type: "dialClock", aliases: [/表盘|钟表|时钟|夜间模式/] },
  { type: "calculator", aliases: [/计算器|算一下|乘|加|减|除/] },
  { type: "clipboard", aliases: [/剪贴板|复制|验证码|口令/] },
  { type: "converter", aliases: [/换算|公斤|公里|克|米/] },
  { type: "countdown", aliases: [/倒计时|计时器|定时|分钟后|秒|小时/] },
  { type: "headline", aliases: [/新闻|头条/] },
  { type: "market", aliases: [/行情|指数|纳指|恒生|上证|美股/] },
  { type: "music", aliases: [/音乐|歌|播放|王菲|陈奕迅|周杰伦|试听|MusicKit|Apple Music/] },
  { type: "note", aliases: [/便签|记下|会议纪要/] },
  { type: "recorder", aliases: [/录音|录一段/] },
  { type: "todo", aliases: [/待办|提醒|复盘|买牛奶|买咖啡豆|订酒店/] },
  { type: "translate", aliases: [/翻译|中文|英文|good night/] },
  { type: "tv", aliases: [/电视|CCTV|电影频道/] },
  { type: "weather", aliases: [/天气|出门|冷不冷|带伞|北京|上海|杭州|广州|成都|武汉|波士顿|洛杉矶/] }
];

const widgetTypes = Object.keys(widgetNames);

function parseSimulationReport(): CatalogCase[] {
  const text = fs.readFileSync(simulationReportPath, "utf8");
  return [...text.matchAll(/^(\d{3})\. \[pass\] route=[^;]+; reason=[^;]+; tools=([^;]+); command=(.+)$/gm)].map((match) => ({
    id: Number(match[1]),
    tools: match[2].split(",").map((item) => item.trim()).filter(Boolean),
    text: match[3]
  }));
}

function definition(type: string): WidgetDefinition {
  return {
    id: `wd_${type}`,
    kind: "system",
    type,
    name: widgetNames[type] ?? type,
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
        ? { items: [{ id: "todo_buy_milk", text: "买牛奶" }, { id: "todo_done", text: "已完成事项", completed: true }] }
        : type === "note"
          ? { content: "初始便签" }
          : type === "clipboard"
            ? { records: [{ id: "clip_pin", text: "固定口令", pinned: true, createdAt: NOW }, { id: "clip_plain", text: "普通记录", createdAt: NOW }] }
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

function inferWidgetTypes(text: string): string[] {
  const matches = widgetAliases.filter((entry) => entry.aliases.some((alias) => alias.test(text))).map((entry) => entry.type);
  return [...new Set(matches)];
}

function inferWidgetType(text: string, tool: string): string {
  if (tool === "widget.remove") {
    if (/(关闭|关掉|收起|删除|移除).{0,8}电视/.test(text)) return "tv";
    if (/(关闭|关掉|收起|删除|移除).{0,8}留言板/.test(text)) return "messageBoard";
    if (/(关闭|关掉|收起|删除|移除).{0,8}音乐/.test(text)) return "music";
    if (/(关闭|关掉|收起|删除|移除).{0,8}世界时钟/.test(text)) return "worldClock";
  }
  if ((tool === "widget.bring_to_front" || tool === "widget.focus" || tool === "widget.move" || tool === "widget.resize") && /音乐/.test(text)) {
    return "music";
  }
  if ((tool === "widget.bring_to_front" || tool === "widget.focus" || tool === "widget.move" || tool === "widget.resize") && /电视/.test(text)) {
    return "tv";
  }
  if (tool === "worldClock.set_zones") return "worldClock";
  if (tool === "dialClock.set_night_mode") return "dialClock";
  if (tool.startsWith("weather.")) return "weather";
  if (tool.startsWith("music.")) return "music";
  if (tool.startsWith("tv.")) return "tv";
  if (tool.startsWith("recorder.")) return "recorder";
  if (tool.startsWith("messageBoard.")) return "messageBoard";
  if (tool.startsWith("todo.")) return "todo";
  if (tool.startsWith("note.")) return "note";
  if (tool.startsWith("countdown.")) return "countdown";
  if (tool.startsWith("clipboard.")) return "clipboard";
  if (tool.startsWith("translate.")) return "translate";
  if (tool.startsWith("calculator.")) return "calculator";
  if (tool.startsWith("converter.")) return "converter";
  if (tool.startsWith("market.")) return "market";
  if (tool.startsWith("headline.")) return "headline";
  return inferWidgetTypes(text)[0] ?? "weather";
}

function targetWidgetId(text: string, tool: string) {
  return `wi_${inferWidgetType(text, tool)}`;
}

function cityFromText(text: string) {
  const city = ["北京", "上海", "杭州", "广州", "成都", "武汉", "波士顿", "洛杉矶", "巴黎", "东京", "纽约"].find((item) => text.includes(item));
  return city ?? "北京";
}

function zonesFromText(text: string) {
  const zones = [
    ["北京", "beijing"],
    ["伦敦", "london"],
    ["纽约", "new-york"],
    ["东京", "tokyo"],
    ["巴黎", "paris"]
  ] as const;
  const found = zones.filter(([label]) => text.includes(label)).map(([, value]) => value);
  return found.length ? found : ["beijing", "tokyo"];
}

function secondsFromText(text: string) {
  if (/一分半|1分半/.test(text)) return 90;
  if (/二十五秒|25秒/.test(text)) return 25;
  if (/三分钟|3分钟/.test(text)) return 180;
  if (/十分钟|10分钟/.test(text)) return 600;
  if (/半小时/.test(text)) return 1800;
  if (/一小时|1小时/.test(text)) return 3600;
  if (/十五分钟|15分钟/.test(text)) return 900;
  return 300;
}

function indexCodesFromText(text: string) {
  const codes: string[] = [];
  if (/纳指|NASDAQ/.test(text)) codes.push("usNDX");
  if (/美股|三大指数/.test(text)) codes.push("usINX", "usNDX", "usDJI");
  if (/恒生/.test(text)) codes.push("hkHSI");
  if (/上证/.test(text)) codes.push("sh000001");
  return codes.length ? codes : ["usNDX"];
}

function queryFromText(text: string) {
  if (/王菲|红豆/.test(text)) return "王菲 红豆";
  if (/陈奕迅|十年/.test(text)) return "陈奕迅 十年";
  if (/周杰伦/.test(text)) return "周杰伦";
  if (/放松|轻松/.test(text)) return "轻松音乐";
  return text.replace(/^(播放|来一首|来个|搜一点|搜索|我想听点)/, "").replace(/，场景\d+$/, "").trim() || text;
}

function textPayload(text: string) {
  return text.replace(/^(便签|留言板|添加待办|把|先|帮我|固定保存|复制)/, "").replace(/，场景\d+$/, "").trim() || text;
}

function argsForTool(tool: string, text: string): Record<string, unknown> {
  if (tool === "app.sidebar.set") return { mode: /显示|回来|重新/.test(text) ? "show" : "hide" };
  if (tool === "app.fullscreen.set") return { mode: /退出|普通窗口/.test(text) ? "exit" : "enter" };
  if (tool === "app.command_palette.open") return { query: /音乐/.test(text) ? "音乐" : "" };
  if (tool === "app.ai_dialog.open") return { prompt: text };
  if (tool === "app.settings.open") return {};
  if (tool === "board.auto_align") return { viewportWidth: 1280 };
  if (tool === "board.create") return { name: /学习/.test(text) ? "学习桌板" : /工作台/.test(text) ? "工作台" : "新桌板" };
  if (tool === "board.rename") return { boardId: "board_1", name: /夜间工作/.test(text) ? "夜间工作" : "重命名桌板" };
  if (tool === "board.switch") return { boardId: "board_2" };
  if (tool === "board.delete") return { boardId: "board_2" };
  if (tool === "board.add_widget") return { definitionId: `wd_${inferWidgetType(text, tool)}` };
  if (tool === "widget.move") return { widgetId: targetWidgetId(text, tool), x: /右上/.test(text) ? 920 : 420, y: /右上/.test(text) ? 0 : 120 };
  if (tool === "widget.resize") return { widgetId: targetWidgetId(text, tool), w: /小/.test(text) ? 220 : 520, h: /小/.test(text) ? 180 : 360 };
  if (tool === "widget.focus" || tool === "widget.fullscreen_focus" || tool === "widget.bring_to_front") {
    return { widgetId: targetWidgetId(text, tool) };
  }
  if (tool === "widget.remove") return { widgetId: targetWidgetId(text, tool) };
  if (tool === "note.write") return { widgetId: "wi_note", content: textPayload(text), mode: "append" };
  if (tool === "note.clear") return { widgetId: "wi_note" };
  if (tool === "todo.add_item") return { widgetId: "wi_todo", text: textPayload(text), dueAt: /明早九点/.test(text) ? "2026-06-22T09:00:00.000Z" : undefined };
  if (tool === "todo.complete_item") return { widgetId: "wi_todo", text: /牛奶/.test(text) ? "买牛奶" : "买牛奶" };
  if (tool === "todo.clear_completed") return { widgetId: "wi_todo" };
  if (tool === "countdown.set") return { widgetId: "wi_countdown", totalSeconds: secondsFromText(text), start: true, label: /会议/.test(text) ? "会议" : undefined };
  if (tool.startsWith("countdown.")) return { widgetId: "wi_countdown" };
  if (tool === "weather.set_city" || tool === "weather.current") return { widgetId: "wi_weather", city: cityFromText(text) };
  if (tool === "calculator.set_display") return { widgetId: "wi_calculator", display: /十二乘十二/.test(text) ? "12*12" : text };
  if (tool === "headline.request_refresh") return { widgetId: "wi_headline", requestedAt: NOW };
  if (tool === "market.set_indices") return { widgetId: "wi_market", indexCodes: indexCodesFromText(text) };
  if (tool === "worldClock.set_zones") return { widgetId: "wi_worldClock", zones: zonesFromText(text) };
  if (tool === "converter.set") return { widgetId: "wi_converter", category: /斤|公斤|克/.test(text) ? "weight" : "length", value: /2斤/.test(text) ? "2" : "1", fromUnit: /公斤/.test(text) ? "kg" : /斤/.test(text) ? "kg" : "m", toUnit: /克/.test(text) ? "g" : "km" };
  if (tool === "translate.set_draft") return { widgetId: "wi_translate", sourceText: /good night/.test(text) ? "good night" : text, targetLang: /英文/.test(text) ? "en" : "zh-CN" };
  if (tool === "clipboard.add_text") return { widgetId: "wi_clipboard", text: textPayload(text), pinned: /固定|口令/.test(text) };
  if (tool === "clipboard.clear") return { widgetId: "wi_clipboard", includePinned: /全部|固定/.test(text) };
  if (tool === "music.search" || tool === "music.play") return { widgetId: "wi_music", query: queryFromText(text) };
  if (tool.startsWith("music.")) return { widgetId: "wi_music" };
  if (tool === "music.auth_status") return { widgetId: "wi_music" };
  if (tool === "tv.play" || tool === "tv.select_channel") return { widgetId: "wi_tv", channelName: /CCTV5/.test(text) ? "CCTV5" : /CCTV13/.test(text) ? "CCTV13" : /电影/.test(text) ? "CCTV6" : "CCTV1" };
  if (tool.startsWith("tv.")) return { widgetId: "wi_tv" };
  if (tool.startsWith("recorder.")) return { widgetId: "wi_recorder" };
  if (tool === "dialClock.set_night_mode") return { widgetId: "wi_dialClock", enabled: !/关闭/.test(text) };
  if (tool === "messageBoard.send") return { widgetId: "wi_messageBoard", text: textPayload(text) };
  if (tool === "messageBoard.clear_draft") return { widgetId: "wi_messageBoard" };
  return {};
}

function expandCalls(testCase: CatalogCase): PlannedCall[] {
  const calls: PlannedCall[] = [];
  for (const tool of testCase.tools) {
    if (tool === "widget.remove" && /(和|以及|全部|所有)/.test(testCase.text)) {
      const targetTypes = /全部|所有/.test(testCase.text) ? widgetTypes : inferWidgetTypes(testCase.text);
      const removeTargets = targetTypes.filter((type) => !["weather"].includes(type));
      for (const type of removeTargets.length ? removeTargets : [inferWidgetType(testCase.text, tool)]) {
        calls.push({ name: tool, arguments: { widgetId: `wi_${type}` } });
      }
      continue;
    }
    calls.push({ name: tool, arguments: argsForTool(tool, testCase.text) });
  }
  return calls;
}

function createPlan(text: string, calls: PlannedCall[]): CommandPlan {
  const toolCalls: AssistantToolCall[] = calls.map((call, index) => ({
    id: `stateful_call_${index + 1}`,
    name: call.name,
    arguments: call.arguments,
    source: "realtime",
    transcript: text
  }));
  const plan = createCommandPlanFromToolCalls(text, toolCalls);
  plan.createdBy = "realtime-2";
  plan.commands = plan.commands.map((command) => ({ ...command, source: "realtime", confidence: 0.91 }));
  plan.executionGroups = toolCalls.map((call, index) => ({
    id: `stateful_group_${index + 1}`,
    mode: "sequential",
    commandIds: [call.id]
  }));
  return plan;
}

function createNoopAction(name: string): AssistantAction<Record<string, unknown>> {
  return {
    spec: {
      name,
      description: `Stateful catalog support action for ${name}`,
      parameters: createPassthroughSchema<Record<string, unknown>>((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object"),
      risk: "safe",
      scope: "desktop"
    },
    execute(args) {
      return { status: "success", message: `${name} ok`, data: { args } };
    }
  };
}

function snapshotWidgets(widgets: WidgetInstance[]): WidgetSnapshot[] {
  return widgets.map((item) => ({
    id: item.id,
    definitionId: item.definitionId,
    state: JSON.parse(JSON.stringify(item.state)) as Record<string, unknown>,
    position: { ...item.position },
    size: { ...item.size },
    zIndex: item.zIndex
  }));
}

function createStatefulHarness(testCase: CatalogCase) {
  const definitions = widgetTypes.map(definition);
  let widgets = widgetTypes.map((type, index) => widget(type, index + 1));
  let focusedWidgetId = "wi_weather";
  let boards = [
    { id: "board_1", name: "我的桌板" },
    { id: "board_2", name: "工作台" }
  ];
  let activeBoardId = "board_1";
  const shell = { sidebarOpen: true, fullscreen: false, settingsOpened: 0, commandPaletteOpened: 0, aiDialogOpened: 0 };
  const mutations: string[] = [];
  const sentResults: Array<{ call: AssistantToolCall; result: AssistantToolResult }> = [];
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
      mutations.push(`add:${target.type}`);
      return instance;
    },
    removeWidgetInstance(widgetId: string) {
      const before = widgets.length;
      widgets = widgets.filter((item) => item.id !== widgetId);
      if (widgets.length === before) throw new Error(`WIDGET_NOT_FOUND:${widgetId}`);
      if (focusedWidgetId === widgetId) focusedWidgetId = widgets[0]?.id ?? "";
      mutations.push(`remove:${widgetId}`);
    },
    focusWidget(widgetId: string) {
      if (!widgets.some((item) => item.id === widgetId)) throw new Error(`WIDGET_NOT_FOUND:${widgetId}`);
      focusedWidgetId = widgetId;
      mutations.push(`focus:${widgetId}`);
    },
    fullscreenWidget(widgetId: string) {
      focusedWidgetId = widgetId;
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, state: { ...item.state, fullscreen: true } } : item));
      mutations.push(`fullscreen:${widgetId}`);
    },
    bringWidgetToFront(widgetId: string) {
      const maxZ = Math.max(0, ...widgets.map((item) => item.zIndex));
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, zIndex: maxZ + 1 } : item));
      mutations.push(`front:${widgetId}`);
    },
    updateWidgetPosition(widgetId: string, x: number, y: number) {
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, position: { x, y } } : item));
      mutations.push(`move:${widgetId}`);
    },
    updateWidgetSize(widgetId: string, w: number, h: number) {
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, size: { w, h } } : item));
      mutations.push(`resize:${widgetId}`);
    },
    updateWidgetState(widgetId: string, state: Record<string, unknown>) {
      widgets = widgets.map((item) => (item.id === widgetId ? { ...item, state } : item));
      mutations.push(`state:${widgetId}`);
    },
    autoAlignWidgets() {
      widgets = widgets.map((item, index) => ({ ...item, position: { x: index % 4, y: Math.floor(index / 4) } }));
      mutations.push("autoAlign");
    },
    setActiveBoard(boardId: string) {
      activeBoardId = boardId;
      mutations.push(`switch:${boardId}`);
    },
    addBoard(name?: string) {
      const id = `board_${boards.length + 1}`;
      boards = [...boards, { id, name: name?.trim() || `桌板 ${boards.length + 1}` }];
      activeBoardId = id;
      mutations.push(`boardAdd:${id}`);
    },
    renameBoard(boardId: string, name: string) {
      boards = boards.map((board) => (board.id === boardId ? { ...board, name } : board));
      mutations.push(`boardRename:${boardId}`);
    },
    deleteBoard(boardId: string) {
      boards = boards.filter((board) => board.id !== boardId);
      if (activeBoardId === boardId) activeBoardId = boards[0]?.id ?? "";
      mutations.push(`boardDelete:${boardId}`);
    }
  };

  for (const action of createAppShellActions({
    getSidebarOpen: () => shell.sidebarOpen,
    setSidebarOpen: (open) => {
      shell.sidebarOpen = open;
      mutations.push(`sidebar:${open}`);
    },
    getFullscreen: () => shell.fullscreen,
    setFullscreen: (enabled) => {
      shell.fullscreen = enabled;
      mutations.push(`fullscreenApp:${enabled}`);
    },
    openSettings: () => {
      shell.settingsOpened += 1;
      mutations.push("settings");
    },
    openCommandPalette: () => {
      shell.commandPaletteOpened += 1;
      mutations.push("palette");
    },
    openAiDialog: () => {
      shell.aiDialogOpened += 1;
      mutations.push("aiDialog");
    }
  })) {
    registry.register(action);
  }
  registerBoardActions(registry, store);
  for (const action of [...createWidgetStateActions(store), ...createWidgetCapabilityActions(store, capabilityBridge)]) {
    if (!registry.get(action.spec.name)) registry.register(action);
  }
  for (const name of ["assistant.reply", "assistant.runtime_diagnostics", "music.auth_status"]) {
    if (!registry.get(name)) registry.register(createNoopAction(name));
  }

  for (const item of widgets) {
    capabilityBridge.register(item.id, {
      search: (args) => {
        mutations.push(`capability:${item.id}:search`);
        return { status: "success", message: "已搜索音乐", data: { args } };
      },
      play: (args) => {
        mutations.push(`capability:${item.id}:play`);
        return { status: "success", message: "已播放", data: { args } };
      },
      pause: (args) => {
        mutations.push(`capability:${item.id}:pause`);
        return { status: "success", message: "已暂停", data: { args } };
      },
      resume: (args) => {
        mutations.push(`capability:${item.id}:resume`);
        return { status: "success", message: "已继续", data: { args } };
      },
      next: (args) => {
        mutations.push(`capability:${item.id}:next`);
        return { status: "success", message: "下一首", data: { args } };
      },
      previous: (args) => {
        mutations.push(`capability:${item.id}:previous`);
        return { status: "success", message: "上一首", data: { args } };
      },
      fullscreen: (args) => {
        mutations.push(`capability:${item.id}:fullscreen`);
        return { status: "success", message: "已全屏", data: { args } };
      },
      selectChannel: (args) => {
        mutations.push(`capability:${item.id}:selectChannel`);
        return { status: "success", message: "已切换频道", data: { args } };
      },
      start: (args) => {
        mutations.push(`capability:${item.id}:start`);
        return { status: "success", message: "已开始录音", data: { args } };
      },
      stop: (args) => {
        mutations.push(`capability:${item.id}:stop`);
        return { status: "success", message: "已停止录音", data: { args } };
      },
      setNightMode: (args) => {
        mutations.push(`capability:${item.id}:setNightMode`);
        return { status: "success", message: "已切换夜间模式", data: { args } };
      },
      send: (args) => {
        mutations.push(`capability:${item.id}:send`);
        store.updateWidgetState(item.id, { ...item.state, lastMessageText: args.text });
        return { status: "success", message: "已发送留言", data: { args } };
      },
      clearDraft: (args) => {
        mutations.push(`capability:${item.id}:clearDraft`);
        store.updateWidgetState(item.id, { ...item.state, draft: "" });
        return { status: "success", message: "已清空留言输入框", data: { args } };
      }
    });
  }

  const plannedCalls = expandCalls(testCase);
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
      return input === testCase.text ? createPlan(testCase.text, plannedCalls) : null;
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
    actionTimeoutMs: 1_000,
    now: () => NOW
  });
  return {
    harness,
    sentResults,
    mutations,
    beforeWidgets: snapshotWidgets(widgets),
    getWidgets: () => widgets,
    plannedCalls
  };
}

function shouldMutate(tool: string) {
  return !["assistant.reply", "assistant.runtime_diagnostics", "music.auth_status"].includes(tool);
}

describe("700 voice scenario catalog through stateful AssistantHarness execution", () => {
  it("executes catalog commands with real action schemas and state mutations", async () => {
    const cases = parseSimulationReport();
    expect(cases).toHaveLength(700);

    const rows = [
      "# Realtime Voice Scenario Catalog Stateful Harness Report",
      "",
      "Every row below was sent through `AssistantHarness.handleRealtimeUserInput` using real assistant actions, real schemas, target resolution, confirmation flow, and an in-memory board/widget store.",
      ""
    ];
    const failures: string[] = [];

    for (const testCase of cases) {
      const env = createStatefulHarness(testCase);
      await env.harness.initialize();
      let response = await env.harness.handleRealtimeUserInput(testCase.text, { commandTraceId: `stateful_${String(testCase.id).padStart(3, "0")}` });
      if (response.result.status === "needs_confirmation") {
        response = await env.harness.handleUserInput("确认", { commandTraceId: `stateful_${String(testCase.id).padStart(3, "0")}_confirm` });
      }
      const actualTools = env.sentResults.map((item) => item.call.name).filter((name) => name !== "assistant.confirm");
      const missing = testCase.tools.filter((tool) => !actualTools.includes(tool));
      const failedResults = env.sentResults.filter((item) => item.result.status !== "success" && item.result.status !== "needs_confirmation");
      const expectedMutation = testCase.tools.some(shouldMutate);
      const hasMutation = env.mutations.length > 0 || JSON.stringify(env.beforeWidgets) !== JSON.stringify(snapshotWidgets(env.getWidgets()));
      const ok = response.result.status === "success" && missing.length === 0 && failedResults.length === 0 && (!expectedMutation || hasMutation);
      rows.push(
        `${String(testCase.id).padStart(3, "0")}. [${ok ? "pass" : "fail"}] tools=${actualTools.join(",") || "NONE"}; mutations=${env.mutations.join(",") || "none"}; command=${testCase.text}`
      );
      if (!ok) {
        failures.push(
          `${String(testCase.id).padStart(3, "0")} ${testCase.text}: status=${response.result.status}; expected=${testCase.tools.join(",")}; actual=${actualTools.join(",")}; missing=${missing.join(",")}; failed=${failedResults.map((item) => `${item.call.name}:${item.result.errorCode ?? item.result.status}`).join(",")}; mutations=${env.mutations.join(",")}; planned=${JSON.stringify(env.plannedCalls)}; message=${response.result.message}`
        );
      }
    }

    fs.writeFileSync(statefulReportPath, `${rows.join("\n")}\n`, "utf8");
    expect(failures).toEqual([]);
  });
});
