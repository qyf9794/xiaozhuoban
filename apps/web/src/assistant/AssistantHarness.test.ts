import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  LearnedCommandStore,
  createDefaultIntentShortcutRouter,
  createPassthroughSchema,
  type AssistantToolCall,
  type AssistantToolResult,
  type AssistantToolSpec,
  type CommandPlan,
  type CompactAssistantContext,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";
import {
  AssistantHarness,
  type AssistantAuditEvent,
  type AssistantOperationEvent,
  type AssistantRealtimeAdapter
} from "./AssistantHarness";

function createTools(): AssistantToolSpec[] {
  const schema = createPassthroughSchema<Record<string, unknown>>();
  return [
    { name: "board.auto_align", description: "整理", parameters: schema, scope: "desktop", risk: "confirm" },
    { name: "widget.focus", description: "聚焦", parameters: schema, scope: "desktop" },
    { name: "widget.remove", description: "关闭小工具", parameters: schema, scope: "desktop", risk: "safe" },
    {
      name: "note.append",
      description: "追加便签",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "note",
      requiresTarget: true
    },
    {
      name: "music.search",
      description: "搜索音乐",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "music",
      requiresTarget: true
    },
    {
      name: "music.play",
      description: "播放音乐",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "music",
      requiresTarget: true
    },
    {
      name: "music.pause",
      description: "暂停音乐",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "music",
      requiresTarget: true
    },
    {
      name: "weather.set_city",
      description: "设置天气城市",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "weather",
      requiresTarget: true
    },
    {
      name: "countdown.set",
      description: "设置倒计时",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "countdown",
      requiresTarget: true
    },
    {
      name: "headline.request_refresh",
      description: "刷新新闻",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "headline",
      requiresTarget: true
    },
    {
      name: "worldClock.set_zones",
      description: "设置世界时钟",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "worldClock",
      requiresTarget: true
    },
    { name: "tv.play", description: "播放电视", parameters: schema, scope: "widget-detail", widgetType: "tv", requiresTarget: true },
    { name: "tv.pause", description: "暂停电视", parameters: schema, scope: "widget-detail", widgetType: "tv", requiresTarget: true },
    {
      name: "tv.fullscreen",
      description: "电视全屏",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "tv",
      requiresTarget: true
    }
  ];
}

const ACTIVE_TOOL_NAMES = createTools().map((tool) => tool.name);

function createRegistry(resultsByTool: Record<string, AssistantToolResult> = {}) {
  const registry = new ActionRegistry();
  const schema = createPassthroughSchema<Record<string, unknown>>();
  const executed: string[] = [];
  const register = (name: string, result?: AssistantToolResult, delayMs = 0) => {
    registry.register({
      spec: createTools().find((tool) => tool.name === name) ?? {
        name,
        description: name,
        parameters: schema,
        scope: "desktop"
      },
      async execute(args, context) {
        const recordArgs = args as Record<string, unknown>;
        executed.push(`${name}:${context.target?.widgetId ?? (name === "widget.move" ? recordArgs.widgetId : undefined) ?? "none"}`);
        if (delayMs > 0) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
        }
        if (name === "board.add_widget" && typeof recordArgs.definitionId === "string") {
          const widgetType = recordArgs.definitionId.replace(/^wd_/, "");
          return {
            status: "success",
            message: `${name} done`,
            data: { definitionId: recordArgs.definitionId, widgetId: `wi_added_${widgetType}`, widgetType }
          };
        }
        return result ?? resultsByTool[name] ?? { status: "success", message: `${name} done` };
      }
    });
  };

  register("board.auto_align");
  register("board.add_widget");
  register("widget.focus");
  register("widget.remove");
  register("widget.move");
  register("note.append");
  register("music.search");
  register("music.play");
  register("music.pause");
  register("weather.set_city");
  register("countdown.set");
  register("headline.request_refresh");
  register("worldClock.set_zones");
  register("tv.play");
  register("tv.pause");
  register("tv.fullscreen");

  return { registry, executed };
}

function createContextInput(): ContextSummarizerInput {
  return {
    boardId: "board_1",
    boardName: "我的桌板",
    focusedWidgetId: "wi_tv",
    availableDefinitions: [
      { definitionId: "wd_tv", type: "tv", name: "电视" },
      { definitionId: "wd_note", type: "note", name: "便签" },
      { definitionId: "wd_music", type: "music", name: "音乐" },
      { definitionId: "wd_weather", type: "weather", name: "天气" },
      { definitionId: "wd_countdown", type: "countdown", name: "倒计时" }
    ],
    recentWidgetIds: ["wi_note"],
    widgets: [
      {
        widgetId: "wi_tv",
        definitionId: "wd_tv",
        type: "tv",
        name: "电视",
        order: 1,
        summary: "CCTV1"
      },
      {
        widgetId: "wi_note",
        definitionId: "wd_note",
        type: "note",
        name: "便签",
        order: 2,
        state: { content: "明早九点开会" }
      }
    ]
  };
}

function createHarness(options?: {
  modelCall?: AssistantToolCall | null;
  modelPlan?: CommandPlan | null;
  actionTimeoutMs?: number;
  registryFactory?: () => ReturnType<typeof createRegistry>;
  getContextInput?: () => ContextSummarizerInput;
  learnedCommandStore?: LearnedCommandStore;
}) {
  const registryState = options?.registryFactory?.() ?? createRegistry();
  const toolUpdates: string[][] = [];
  const contextUpdates: CompactAssistantContext[] = [];
  const sentResults: AssistantToolResult[] = [];
  const auditEvents: AssistantAuditEvent[] = [];
  const operationEvents: AssistantOperationEvent[] = [];
  const activeTraceIds: Array<string | null> = [];
  const realtime: AssistantRealtimeAdapter = {
    updateTools(tools) {
      toolUpdates.push(tools.map((tool) => tool.name));
    },
    updateContext(context) {
      contextUpdates.push(context);
    },
    setActiveCommandTraceId(commandTraceId) {
      activeTraceIds.push(commandTraceId);
    },
    sendToolResult(_call, result) {
      sentResults.push(result);
    },
    requestCommandPlan() {
      return options?.modelPlan ?? null;
    },
    requestToolCall() {
      return options?.modelCall ?? null;
    }
  };
  const harness = new AssistantHarness({
    registry: registryState.registry,
    shortcutRouter: createDefaultIntentShortcutRouter(),
    targetResolver: new WidgetTargetResolver(),
    toolScopeManager: new ToolScopeManager(createTools()),
    contextSummarizer: new ContextSummarizer(),
    realtime,
    learnedCommandStore: options?.learnedCommandStore,
    audit: {
      write(event) {
        auditEvents.push(event);
      }
    },
    onOperation(event) {
      operationEvents.push(event);
    },
    getContextInput: options?.getContextInput ?? createContextInput,
    actionTimeoutMs: options?.actionTimeoutMs ?? 500,
    now: () => "2026-06-16T00:00:00.000Z"
  });
  return { harness, toolUpdates, contextUpdates, sentResults, auditEvents, activeTraceIds, operationEvents, executed: registryState.executed };
}

describe("AssistantHarness", () => {
  it("initializes with all active tools for realtime selection", async () => {
    const { harness, toolUpdates, contextUpdates } = createHarness();

    await harness.initialize();

    expect(toolUpdates).toEqual([ACTIVE_TOOL_NAMES]);
    expect(contextUpdates[0]).toMatchObject({
      boardName: "我的桌板",
      availableDefinitions: [
        { definitionId: "wd_tv" },
        { definitionId: "wd_note" },
        { definitionId: "wd_music" },
        { definitionId: "wd_weather" },
        { definitionId: "wd_countdown" }
      ]
    });
  });

  it("keeps all active tools when entering a widget context", async () => {
    const { harness, toolUpdates } = createHarness();

    await harness.initialize();
    await harness.enterWidgetContext("tv");

    expect(toolUpdates[1]).toEqual(ACTIVE_TOOL_NAMES);
  });

  it("refreshes realtime context only after initialization", async () => {
    const { harness, contextUpdates } = createHarness();

    await harness.refreshRealtimeContext();
    expect(contextUpdates).toEqual([]);

    await harness.initialize();
    await harness.refreshRealtimeContext();

    expect(contextUpdates).toHaveLength(2);
    expect(contextUpdates[1].focusedWidget?.widgetId).toBe("wi_tv");
  });

  it("refreshes realtime tools with all active tools when no focus is set", async () => {
    const { harness, toolUpdates } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        focusedWidgetId: undefined,
        widgets: [
          {
            widgetId: "wi_music",
            definitionId: "wd_music",
            type: "music",
            name: "音乐",
            order: 1,
            summary: ""
          }
        ]
      })
    });

    await harness.initialize();
    await harness.refreshRealtimeContext();

    expect(toolUpdates).toEqual([ACTIVE_TOOL_NAMES]);
  });

  it("refreshes realtime tools with all active tools for multiple mounted widget types", async () => {
    const { harness, toolUpdates } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        focusedWidgetId: "wi_tv",
        widgets: [
          ...createContextInput().widgets,
          {
            widgetId: "wi_music",
            definitionId: "wd_music",
            type: "music",
            name: "音乐",
            order: 3,
            summary: "已搜索到红豆"
          }
        ]
      })
    });

    await harness.initialize();
    await harness.refreshRealtimeContext();

    expect(toolUpdates).toEqual([ACTIVE_TOOL_NAMES]);
  });

  it("executes shortcut-routed commands without model fallback", async () => {
    const { harness, sentResults, auditEvents, operationEvents, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("整理桌面");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("needs_confirmation");
    expect(harness.getPendingConfirmation()?.actionName).toBe("board.auto_align");
    expect(executed).toEqual([]);
    expect(sentResults[0].status).toBe("needs_confirmation");
    expect(auditEvents[0].route).toBe("shortcut");
    expect(operationEvents).toMatchObject([
      { phase: "running", route: "shortcut", toolName: "board.auto_align" },
      { phase: "waiting_confirmation", route: "shortcut", toolName: "board.auto_align", message: "确认执行 board.auto_align 吗？" }
    ]);
  });

  it("uses full available definitions when opening an absent widget", async () => {
    const { harness, executed, operationEvents } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("打开音乐");

    expect(response.route).toBe("shortcut");
    expect(response.call).toMatchObject({
      name: "board.add_widget",
      arguments: { definitionId: "wd_music" }
    });
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["board.add_widget:none"]);
    expect(operationEvents).toMatchObject([
      { phase: "running", route: "shortcut", toolName: "board.add_widget" },
      { phase: "success", route: "shortcut", toolName: "board.add_widget", message: "board.add_widget done" }
    ]);
  });

  it("confirms and executes a pending action", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();
    await harness.handleUserInput("整理桌面");

    const response = await harness.handleUserInput("确认");

    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["board.auto_align:none"]);
    expect(harness.getPendingConfirmation()).toBeNull();
  });

  it("cancels a pending confirmation-required action without execution", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();
    await harness.handleUserInput("整理桌面");

    const response = await harness.handleUserInput("取消");

    expect(response.result.status).toBe("cancelled");
    expect(executed).toEqual([]);
    expect(harness.getPendingConfirmation()).toBeNull();
  });

  it("uses a mock model fallback when shortcuts do not match", async () => {
    const { harness, executed } = createHarness({
      modelCall: {
        id: "model_1",
        name: "widget.focus",
        arguments: { widgetId: "wi_tv" },
        source: "realtime"
      }
    });
    await harness.initialize();

    const response = await harness.handleUserInput("这个有点复杂的说法");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["widget.focus:none"]);
  });

  it("executes a realtime command plan with parallel independent tools through harness validation", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_realtime_parallel",
      sourceText: "准备一下工作台",
      normalizedText: "准备一下工作台",
      commands: [
        {
          id: "cmd_weather",
          module: "weather",
          tool: "weather.set_city",
          args: { widgetId: "wi_weather", city: "北京" },
          risk: "safe",
          confidence: 0.9,
          source: "text",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_headline",
          module: "headline",
          tool: "headline.request_refresh",
          args: { widgetId: "wi_headline" },
          risk: "safe",
          confidence: 0.88,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_parallel", mode: "parallel", commandIds: ["cmd_weather", "cmd_headline"] }],
      confidence: 0.88,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed, operationEvents } = createHarness({
      modelPlan,
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_weather", definitionId: "wd_weather", type: "weather", name: "天气", order: 3 },
          { widgetId: "wi_headline", definitionId: "wd_headline", type: "headline", name: "新闻", order: 4 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("准备一下工作台");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("weather.set_city done；headline.request_refresh done");
    expect(executed).toEqual(["weather.set_city:wi_weather", "headline.request_refresh:wi_headline"]);
    expect(operationEvents.filter((event) => event.phase === "running").map((event) => event.toolName)).toEqual([
      "weather.set_city",
      "headline.request_refresh"
    ]);
  });

  it("turns successful model fallback into a confirmed learned local shortcut", async () => {
    const learnedCommandStore = new LearnedCommandStore();
    const { harness, executed, auditEvents } = createHarness({
      learnedCommandStore,
      modelCall: {
        id: "model_close_music",
        name: "widget.remove",
        arguments: { widgetId: "wi_tv" },
        source: "realtime"
      }
    });
    await harness.initialize();

    const first = await harness.handleUserInput("执行我的电视收纳暗号");

    expect(first.route).toBe("model");
    expect(first.result.status).toBe("success");
    expect(harness.getPendingConfirmation()).toMatchObject({
      actionName: "assistant.learn",
      message: "要记住“执行我的电视收纳暗号”下次直接执行 widget.remove 吗？"
    });
    expect(auditEvents.at(-1)).toMatchObject({ learningCandidate: true });

    const confirmed = await harness.handleUserInput("确认");
    expect(confirmed.route).toBe("learned");
    expect(confirmed.result.status).toBe("success");
    expect(await learnedCommandStore.match("执行我的电视收纳暗号")).toMatchObject({ tool: "widget.remove", status: "confirmed" });

    executed.length = 0;
    const second = await harness.handleUserInput("执行我的电视收纳暗号");

    expect(second.route).toBe("learned");
    expect(second.result.status).toBe("success");
    expect(executed).toEqual(["widget.remove:none"]);
  });

  it("does not create learned candidates for sensitive model fallback payloads", async () => {
    const learnedCommandStore = new LearnedCommandStore();
    const { harness } = createHarness({
      learnedCommandStore,
      modelCall: {
        id: "model_sensitive",
        name: "note.append",
        arguments: { widgetId: "wi_note", content: "password=abc123" },
        source: "realtime"
      }
    });
    await harness.initialize();

    const response = await harness.handleUserInput("执行敏感内容存储暗号");

    expect(response.result.status).toBe("success");
    expect(harness.getPendingConfirmation()).toBeNull();
    expect((await learnedCommandStore.list()).shortcuts).toEqual([]);
  });

  it("syncs realtime tools to a focused widget after successful focus", async () => {
    const { harness, toolUpdates } = createHarness({
      modelCall: {
        id: "model_1",
        name: "widget.focus",
        arguments: { widgetId: "wi_tv" },
        source: "realtime"
      }
    });
    await harness.initialize();

    await harness.handleUserInput("聚焦电视");

    expect(toolUpdates).toEqual([ACTIVE_TOOL_NAMES]);
  });

  it("executes safe widget follow-up actions on the same target", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("播放 CCTV1，并全屏");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("tv.play done，tv.fullscreen done");
    expect(executed).toEqual(["tv.play:wi_tv", "tv.fullscreen:wi_tv"]);
  });

  it("executes sequential shortcut command segments in order", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("播放 CCTV1 然后暂停电视");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("tv.play done；tv.pause done");
    expect(executed).toEqual(["tv.play:wi_tv", "tv.pause:wi_tv"]);
  });

  it("reuses a newly added widget for the next sequential shortcut segment", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("打开天气然后查北京天气");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("board.add_widget done；weather.set_city done");
    expect(executed).toEqual(["board.add_widget:none", "weather.set_city:wi_added_weather"]);
  });

  it("carries implicit weather context across sequential city commands", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("先打开天气，再查北京天气，然后查上海天气");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("board.add_widget done；weather.set_city done；weather.set_city done");
    expect(executed).toEqual(["board.add_widget:none", "weather.set_city:wi_added_weather", "weather.set_city:wi_added_weather"]);
  });

  it("delegates casual music playback then countdown setup to realtime planning", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_music_countdown_realtime",
      sourceText: "帮我放点轻松的音乐，然后把倒计时设为 10 分钟",
      normalizedText: "帮我放点轻松的音乐 然后把倒计时设为 10 分钟",
      commands: [
        {
          id: "cmd_music",
          module: "music",
          tool: "music.play",
          args: { widgetId: "wi_music", query: "轻松的音乐" },
          risk: "safe",
          confidence: 0.92,
          source: "text",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_countdown",
          module: "countdown",
          tool: "countdown.set",
          args: { widgetId: "wi_countdown", totalSeconds: 600, start: true },
          risk: "safe",
          confidence: 0.92,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_music", "cmd_countdown"] }],
      confidence: 0.92,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({
      modelPlan,
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 3 },
          { widgetId: "wi_countdown", definitionId: "wd_countdown", type: "countdown", name: "倒计时", order: 4 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("帮我放点轻松的音乐，然后把倒计时设为 10 分钟");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("music.play done；countdown.set done");
    expect(executed).toEqual(["music.play:wi_music", "countdown.set:wi_countdown"]);
  });

  it("reuses a model-planned widget after board.add_widget succeeds", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_add_then_play_music",
      sourceText: "麻烦安排王菲红豆",
      normalizedText: "麻烦安排王菲红豆",
      commands: [
        {
          id: "cmd_add_music",
          module: "board",
          tool: "board.add_widget",
          args: { definitionId: "wd_music" },
          risk: "safe",
          confidence: 0.92,
          source: "text",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_play_music",
          module: "music",
          tool: "music.play",
          args: { widgetId: "planned_widget_music", query: "王菲 红豆" },
          risk: "safe",
          confidence: 0.92,
          dependsOn: ["cmd_add_music"],
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_add_music", "cmd_play_music"] }],
      confidence: 0.92,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({ modelPlan });
    await harness.initialize();

    const response = await harness.handleUserInput("麻烦安排王菲红豆");

    expect(response.route).toBe("model");
    expect(response.result.message).toBe("board.add_widget done；music.play done");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["board.add_widget:none", "music.play:wi_added_music"]);
  });

  it("rewrites planned widget ids for window tools after board.add_widget succeeds", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_add_then_move_tv",
      sourceText: "请执行电视布局迁移",
      normalizedText: "请执行电视布局迁移",
      commands: [
        {
          id: "cmd_add_tv",
          module: "board",
          tool: "board.add_widget",
          args: { definitionId: "wd_tv" },
          risk: "safe",
          confidence: 0.92,
          source: "text",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_move_tv",
          module: "board",
          tool: "widget.move",
          args: { widgetId: "planned_widget_tv", x: 1080, y: 0 },
          risk: "safe",
          confidence: 0.92,
          dependsOn: ["cmd_add_tv"],
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [
        { id: "group_1", mode: "sequential", commandIds: ["cmd_add_tv"] },
        { id: "group_2", mode: "sequential", commandIds: ["cmd_move_tv"] }
      ],
      confidence: 0.92,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({ modelPlan });
    await harness.initialize();

    const response = await harness.handleUserInput("请执行电视布局迁移");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["board.add_widget:none", "widget.move:wi_added_tv"]);
  });

  it("executes simultaneous shortcut command segments with concurrent operation visibility", async () => {
    const { harness, executed, operationEvents } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("打开电视同时播放 CCTV1");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("widget.focus done；tv.play done");
    expect(executed).toEqual(["widget.focus:none", "tv.play:wi_tv"]);
    expect(operationEvents.slice(0, 2)).toMatchObject([
      { phase: "running", route: "shortcut", toolName: "widget.focus" },
      { phase: "running", route: "shortcut", toolName: "tv.play" }
    ]);
  });

  it("executes simultaneous add music and set weather shortcut segments locally", async () => {
    const { harness, executed, operationEvents } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("打开音乐，同时查北京天气");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("board.add_widget done；board.add_widget done，weather.set_city done");
    expect(executed).toEqual(["board.add_widget:none", "board.add_widget:none", "weather.set_city:wi_added_weather"]);
    expect(operationEvents.slice(0, 2)).toMatchObject([
      { phase: "running", route: "shortcut", toolName: "board.add_widget" },
      { phase: "running", route: "shortcut", toolName: "board.add_widget" }
    ]);
  });

  it("forces text-only realtime commands through model planning instead of local shortcuts", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_realtime_music_weather",
      sourceText: "打开音乐，同时查北京天气",
      normalizedText: "打开音乐 同时查北京天气",
      commands: [
        {
          id: "cmd_music",
          module: "music",
          tool: "music.play",
          args: { widgetId: "wi_music", query: "周杰伦" },
          risk: "safe",
          confidence: 0.92,
          source: "text",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_weather",
          module: "weather",
          tool: "weather.set_city",
          args: { widgetId: "wi_weather", city: "北京" },
          risk: "safe",
          confidence: 0.92,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "parallel", commandIds: ["cmd_music", "cmd_weather"] }],
      confidence: 0.92,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({
      modelPlan,
      getContextInput: () => ({
        ...createContextInput(),
        focusedWidgetId: "wi_music",
        widgets: [
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 1 },
          { widgetId: "wi_weather", definitionId: "wd_weather", type: "weather", name: "天气", order: 2 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput("打开音乐，同时查北京天气", { commandTraceId: "trace_realtime_text" });

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("music.play done；weather.set_city done");
    expect(executed).toEqual(["music.play:wi_music", "weather.set_city:wi_weather"]);
    expect(harness.getLastDiagnostics()).toMatchObject({
      commandTraceId: "trace_realtime_text",
      usedRealtime: true,
      route: "model"
    });
  });

  it("keeps a redacted diagnostics snapshot for real-page acceptance evidence", async () => {
    const { harness } = createHarness();
    await harness.initialize();

    await harness.handleUserInput("打开音乐，同时查北京天气", { commandTraceId: "trace_test_1" });

    expect(harness.getLastDiagnostics()).toMatchObject({
      commandTraceId: "trace_test_1",
      rawInput: "打开音乐，同时查北京天气",
      normalizedText: "打开音乐 同时查北京天气",
      route: "shortcut",
      usedRealtime: false,
      status: "success",
      segments: [
        { text: "打开音乐", connector: "start" },
        { text: "查北京天气", connector: "parallel" }
      ],
      commandPlan: {
        createdBy: "local",
        executionGroups: [{ mode: "parallel" }]
      }
    });
    expect(harness.getLastDiagnostics()?.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: "board.add_widget", status: "success" }),
        expect.objectContaining({ tool: "weather.set_city", status: "success" })
      ])
    );
    expect(harness.getLastDiagnostics()?.toolResults.filter((item) => item.tool === "board.add_widget")).toHaveLength(2);
    expect(JSON.stringify(harness.getLastDiagnostics())).toContain('"argKeys":["definitionId","followUp"]');
    expect(JSON.stringify(harness.getLastDiagnostics())).not.toContain('"city":"北京"');
  });

  it("threads command trace ids through realtime trace scope and operation events", async () => {
    const { harness, activeTraceIds, operationEvents } = createHarness();
    await harness.initialize();

    await harness.handleUserInput("打开音乐", { commandTraceId: "trace_music_1" });

    expect(activeTraceIds).toEqual(["trace_music_1", null]);
    expect(harness.getLastDiagnostics()?.commandTraceId).toBe("trace_music_1");
    expect(operationEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ commandTraceId: "trace_music_1", toolName: "board.add_widget" })
      ])
    );
  });

  it("executes simultaneous pause music and open headline shortcut segments locally", async () => {
    const { harness, executed, operationEvents } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        focusedWidgetId: "wi_music",
        availableDefinitions: [
          ...createContextInput().availableDefinitions!,
          { definitionId: "wd_headline", type: "headline", name: "新闻" }
        ],
        widgets: [
          ...createContextInput().widgets,
          {
            widgetId: "wi_music",
            definitionId: "wd_music",
            type: "music",
            name: "音乐",
            order: 3,
            summary: "正在播放轻松音乐"
          }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("暂停音乐，同时打开新闻");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("music.pause done；board.add_widget done");
    expect(executed).toEqual(["music.pause:wi_music", "board.add_widget:none"]);
    expect(operationEvents.slice(0, 2)).toMatchObject([
      { phase: "running", route: "shortcut", toolName: "music.pause" },
      { phase: "running", route: "shortcut", toolName: "board.add_widget" }
    ]);
  });

  it("executes sequential weather and world clock setup shortcut segments locally", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        availableDefinitions: [
          ...createContextInput().availableDefinitions!,
          { definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟" }
        ],
        widgets: createContextInput().widgets.filter((widget) => !["weather", "worldClock"].includes(widget.type))
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("打开天气查北京，再打开世界时钟看东京时间");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("board.add_widget done，weather.set_city done；board.add_widget done，worldClock.set_zones done");
    expect(executed).toEqual([
      "board.add_widget:none",
      "weather.set_city:wi_added_weather",
      "board.add_widget:none",
      "worldClock.set_zones:wi_added_worldClock"
    ]);
  });

  it("does not partially execute low-confidence casual music shortcut groups without realtime planning", async () => {
    const { harness, executed } = createHarness({
      registryFactory: () =>
        createRegistry({
          "music.play": { status: "failed", message: "没有可播放的音乐", errorCode: "MUSIC_NOT_PLAYABLE" }
        }),
      getContextInput: () => ({
        ...createContextInput(),
        focusedWidgetId: undefined,
        widgets: createContextInput().widgets.filter((widget) => !["music", "countdown"].includes(widget.type))
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("帮我放点轻松的音乐，然后把倒计时设为 10 分钟");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("needs_clarification");
    expect(response.result.message).toBe("我没听懂，可以再说短一点吗？");
    expect(executed).toEqual([]);
  });

  it("falls back without partial execution when a segmented shortcut command is not fully local", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("播放 CCTV1 然后做一个很复杂的未知动作");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("needs_clarification");
    expect(executed).toEqual([]);
  });

  it("executes multi-close shortcut commands without confirmation", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("关闭电视和便签");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("widget.remove done；widget.remove done");
    expect(harness.getPendingConfirmation()).toBeNull();
    expect(executed).toEqual(["widget.remove:none", "widget.remove:none"]);
  });

  it("executes single close message board commands locally with high confidence", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_messageBoard", definitionId: "wd_messageBoard", type: "messageBoard", name: "留言板", order: 3 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("关闭留言板");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("widget.remove done");
    expect(executed).toEqual(["widget.remove:none"]);
  });

  it("executes close music and weather as removals without weather query fallback", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 3 },
          { widgetId: "wi_weather", definitionId: "wd_weather", type: "weather", name: "天气", order: 4 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("关闭音乐和天气");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("widget.remove done；widget.remove done");
    expect(response.result.errorCode).toBeUndefined();
    expect(executed).toEqual(["widget.remove:none", "widget.remove:none"]);
  });

  it("keeps noisy spoken close music as a single close shortcut", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 3 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("关闭，啊，这个，音乐");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("widget.remove done");
    expect(executed).toEqual(["widget.remove:none"]);
  });

  it("does not leave queued confirmations after multi-close shortcut commands", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    await harness.handleUserInput("关闭电视和便签");
    const confirmAfterCancel = await harness.handleUserInput("确认");

    expect(confirmAfterCancel.result.status).toBe("needs_clarification");
    expect(harness.getPendingConfirmation()).toBeNull();
    expect(executed).toEqual(["widget.remove:none", "widget.remove:none"]);
  });

  it("syncs realtime tools to the target widget type after detail action success", async () => {
    const { harness, toolUpdates } = createHarness();
    await harness.initialize();

    await harness.handleFunctionCall({
      id: "call_1",
      name: "note.append",
      arguments: { targetText: "最近的便签", text: "补充内容" },
      source: "test"
    });

    expect(toolUpdates).toEqual([ACTIVE_TOOL_NAMES]);
  });

  it("returns clarification when no shortcut or model call exists", async () => {
    const { harness } = createHarness({ modelCall: null });
    await harness.initialize();

    const response = await harness.handleUserInput("这个有点复杂的说法");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("needs_clarification");
  });

  it("resolves targetText before executing target-required actions", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleFunctionCall({
      id: "call_1",
      name: "note.append",
      arguments: { targetText: "最近的便签", text: "补充内容" },
      source: "test"
    });

    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["note.append:wi_note"]);
  });

  it("returns a failure for unknown tools", async () => {
    const { harness } = createHarness();
    await harness.initialize();

    const response = await harness.handleFunctionCall({
      id: "call_1",
      name: "missing.tool",
      arguments: {},
      source: "test"
    });

    expect(response.result).toMatchObject({ status: "failed", errorCode: "UNKNOWN_TOOL" });
  });

  it("returns timeout results for slow actions", async () => {
    const { harness } = createHarness({
      actionTimeoutMs: 5,
      registryFactory() {
        const registry = new ActionRegistry();
        const executed: string[] = [];
        registry.register({
          spec: {
            name: "widget.focus",
            description: "slow",
            parameters: createPassthroughSchema<Record<string, unknown>>(),
            scope: "desktop"
          },
          async execute() {
            executed.push("started");
            await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
            return { status: "success", message: "late" };
          }
        });
        return { registry, executed };
      }
    });
    await harness.initialize();

    const response = await harness.handleFunctionCall({
      id: "call_1",
      name: "widget.focus",
      arguments: { widgetId: "wi_tv" },
      source: "test"
    });

    expect(response.result).toMatchObject({ status: "timed_out", errorCode: "ACTION_TIMEOUT" });
  });
});
