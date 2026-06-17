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
        executed.push(`${name}:${context.target?.widgetId ?? "none"}`);
        if (delayMs > 0) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
        }
        const recordArgs = args as Record<string, unknown>;
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
  const realtime: AssistantRealtimeAdapter = {
    updateTools(tools) {
      toolUpdates.push(tools.map((tool) => tool.name));
    },
    updateContext(context) {
      contextUpdates.push(context);
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
  return { harness, toolUpdates, contextUpdates, sentResults, auditEvents, operationEvents, executed: registryState.executed };
}

describe("AssistantHarness", () => {
  it("initializes with desktop-level tools", async () => {
    const { harness, toolUpdates, contextUpdates } = createHarness();

    await harness.initialize();

    expect(toolUpdates).toEqual([["board.auto_align", "widget.focus", "widget.remove"]]);
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

  it("updates tools when entering a widget context", async () => {
    const { harness, toolUpdates } = createHarness();

    await harness.initialize();
    await harness.enterWidgetContext("tv");

    expect(toolUpdates[1]).toEqual(["board.auto_align", "widget.focus", "widget.remove", "tv.play", "tv.pause", "tv.fullscreen"]);
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

    expect(toolUpdates).toEqual([
      ["board.auto_align", "widget.focus", "widget.remove"],
      ["board.auto_align", "widget.focus", "widget.remove", "tv.play", "tv.pause", "tv.fullscreen"]
    ]);
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

    const response = await harness.handleUserInput("打开音乐然后播放周杰伦音乐");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("board.add_widget done；music.play done");
    expect(executed).toEqual(["board.add_widget:none", "music.play:wi_added_music"]);
  });

  it("carries implicit music context across sequential search and play commands", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("先打开音乐，再搜索七里香，然后播放第一首");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("board.add_widget done；music.search done；music.play done");
    expect(executed).toEqual(["board.add_widget:none", "music.search:wi_added_music", "music.play:wi_added_music"]);
  });

  it("executes casual music playback then countdown setup as sequential local shortcuts", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("帮我放点轻松的音乐，然后把倒计时设为 10 分钟");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("board.add_widget done，music.play done；board.add_widget done，countdown.set done");
    expect(executed).toEqual(["board.add_widget:none", "music.play:wi_added_music", "board.add_widget:none", "countdown.set:wi_added_countdown"]);
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

  it("continues independent shortcut groups after a failed music follow-up", async () => {
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

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("failed");
    expect(response.result.message).toBe("没有可播放的音乐；board.add_widget done，countdown.set done");
    expect(executed).toEqual(["board.add_widget:none", "music.play:wi_added_music", "board.add_widget:none", "countdown.set:wi_added_countdown"]);
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

    expect(toolUpdates[1]).toEqual(["board.auto_align", "widget.focus", "widget.remove", "note.append"]);
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
