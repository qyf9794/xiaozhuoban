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
    { name: "app.fullscreen.set", description: "全屏", parameters: schema, scope: "desktop", risk: "safe" },
    { name: "widget.focus", description: "聚焦", parameters: schema, scope: "desktop", requiresTarget: true },
    { name: "widget.remove", description: "关闭小工具", parameters: schema, scope: "desktop", risk: "safe", requiresTarget: true },
    { name: "widget.move", description: "移动窗口", parameters: schema, scope: "desktop", risk: "safe", requiresTarget: true },
    { name: "widget.resize", description: "调整窗口", parameters: schema, scope: "desktop", risk: "safe", requiresTarget: true },
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
      name: "todo.add_item",
      description: "添加待办",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "todo",
      requiresTarget: true
    },
    {
      name: "todo.complete_item",
      description: "完成待办",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "todo",
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
        void context;
        const recordArgs = args as Record<string, unknown>;
        executed.push(`${name}:${typeof recordArgs.widgetId === "string" ? recordArgs.widgetId : "none"}`);
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
  register("app.fullscreen.set");
  register("widget.focus");
  register("widget.remove");
  register("widget.move");
  register("widget.resize");
  register("note.append");
  register("music.search");
  register("music.play");
  register("music.pause");
  register("weather.set_city");
  register("countdown.set");
  register("todo.add_item");
  register("todo.complete_item");
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

function createNonActionRealtimePlan(sourceText: string): CommandPlan {
  return createRealtimePlanWithTool(sourceText, "assistant.runtime_diagnostics");
}

function createRealtimePlanWithTool(sourceText: string, tool: string): CommandPlan {
  return {
    id: `plan_${tool.replace(/\W+/g, "_")}`,
    sourceText,
    normalizedText: sourceText,
    commands: [
      {
        id: `cmd_${tool.replace(/\W+/g, "_")}`,
        module: tool.split(".")[0] ?? "assistant",
        tool,
        args: {},
        risk: "safe",
        confidence: 0.91,
        source: "realtime",
        requiresHarnessValidation: true
      }
    ],
    dependencies: [],
    executionGroups: [{ id: "group_1", mode: "sequential", commandIds: [`cmd_${tool.replace(/\W+/g, "_")}`] }],
    confidence: 0.91,
    needsConfirmation: false,
    createdBy: "realtime-2",
    requiresHarnessValidation: true
  };
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
    expect(executed).toEqual(["widget.focus:wi_tv"]);
  });

  it("recovers a close-widget shortcut when realtime returns only diagnostics", async () => {
    const input = "我说关闭留言板时执行关闭，不是发送消息";
    const { harness, executed } = createHarness({
      modelPlan: createNonActionRealtimePlan(input),
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_messageBoard", definitionId: "wd_messageBoard", type: "messageBoard", name: "留言板", order: 3 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput(input);

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["widget.remove:wi_messageBoard"]);
  });

  it("recovers an auto-align shortcut when realtime returns only diagnostics", async () => {
    const input = "我说整理桌面时不要回答没有工具，要触发确认";
    const { harness, executed } = createHarness({
      modelPlan: createNonActionRealtimePlan(input)
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput(input);

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("needs_confirmation");
    expect(harness.getPendingConfirmation()?.actionName).toBe("board.auto_align");
    expect(executed).toEqual([]);
  });

  it("does not recover diagnostic logging requests into mutating local shortcuts", async () => {
    const input = "关闭留言板成功后记录窗口移除状态";
    const { harness, executed } = createHarness({
      modelPlan: createNonActionRealtimePlan(input),
      registryFactory() {
        const state = createRegistry();
        state.registry.register({
          spec: {
            name: "assistant.runtime_diagnostics",
            description: "诊断",
            parameters: createPassthroughSchema<Record<string, unknown>>(),
            scope: "desktop",
            risk: "safe"
          },
          execute() {
            state.executed.push("assistant.runtime_diagnostics:none");
            return { status: "success", message: "diagnostics done" };
          }
        });
        return state;
      },
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_messageBoard", definitionId: "wd_messageBoard", type: "messageBoard", name: "留言板", order: 3 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput(input);

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["assistant.runtime_diagnostics:none"]);
  });

  it("does not bulk-close constrained keep-one-window requests before realtime planning", async () => {
    const input = "把所有弹窗先收起来，只留下命令面板";
    const { harness, executed } = createHarness({
      modelPlan: createRealtimePlanWithTool(input, "app.command_palette.open"),
      registryFactory() {
        const state = createRegistry();
        state.registry.register({
          spec: {
            name: "app.command_palette.open",
            description: "命令面板",
            parameters: createPassthroughSchema<Record<string, unknown>>(),
            scope: "desktop",
            risk: "safe"
          },
          execute() {
            state.executed.push("app.command_palette.open:none");
            return { status: "success", message: "palette done" };
          }
        });
        return state;
      }
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput(input);

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["app.command_palette.open:none"]);
  });

  it("recovers a local shortcut when realtime returns a forbidden message-board send plan", async () => {
    const input = "我说关闭留言板时执行关闭，不是发送消息";
    const { harness, executed } = createHarness({
      modelPlan: createRealtimePlanWithTool(input, "messageBoard.send"),
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_messageBoard", definitionId: "wd_messageBoard", type: "messageBoard", name: "留言板", order: 3 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput(input);

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(harness.getLastDiagnostics()?.recovery).toMatchObject({
      reason: "forbidden_model_tools",
      modelTools: ["messageBoard.send"],
      recoveredTool: "widget.remove"
    });
    expect(executed).toEqual(["widget.remove:wi_messageBoard"]);
  });

  it("rejects a forbidden realtime tool when local recovery would also violate policy", async () => {
    const input = "清空搜索结果不要影响播放中的歌曲";
    const { harness, executed } = createHarness({
      modelPlan: createRealtimePlanWithTool(input, "music.search")
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput(input);

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("failed");
    expect(response.result.errorCode).toBe("REALTIME_PLAN_POLICY_REJECTED");
    expect(harness.getLastDiagnostics()?.validationErrors?.[0]).toMatchObject({
      code: "POLICY_FORBIDDEN_TOOL"
    });
    expect(executed).toEqual([]);
  });

  it("honors model plan risk overrides for otherwise safe tools", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_confirm_safe_remove",
      sourceText: "这是一个需要模型风险覆盖的复杂说法",
      normalizedText: "这是一个需要模型风险覆盖的复杂说法",
      commands: [
        {
          id: "cmd_remove_tv",
          module: "widget",
          tool: "widget.remove",
          args: { widgetId: "wi_tv" },
          risk: "confirm",
          confidence: 0.94,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_remove_tv"] }],
      confidence: 0.94,
      needsConfirmation: true,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({ modelPlan });
    await harness.initialize();

    const response = await harness.handleUserInput("这是一个需要模型风险覆盖的复杂说法");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("needs_confirmation");
    expect(harness.getPendingConfirmation()?.actionName).toBe("widget.remove");
    expect(executed).toEqual([]);

    const confirmed = await harness.handleUserInput("确认");

    expect(confirmed.result.status).toBe("success");
    expect(executed).toEqual(["widget.remove:wi_tv"]);
  });

  it("continues same-group commands after confirming a blocking plan step", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_confirm_then_focus",
      sourceText: "整理桌面后聚焦待办窗口",
      normalizedText: "整理桌面后聚焦待办窗口",
      commands: [
        {
          id: "cmd_align",
          module: "board",
          tool: "board.auto_align",
          args: {},
          risk: "confirm",
          confidence: 0.94,
          source: "text",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_focus",
          module: "widget",
          tool: "widget.focus",
          args: { widgetId: "wi_todo" },
          risk: "safe",
          confidence: 0.94,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_align", "cmd_focus"] }],
      confidence: 0.94,
      needsConfirmation: true,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({
      modelPlan,
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_todo", definitionId: "wd_todo", type: "todo", name: "待办", order: 3, summary: "" }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("整理桌面后聚焦待办窗口");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("needs_confirmation");
    expect(executed).toEqual([]);

    const confirmed = await harness.handleUserInput("确认");

    expect(confirmed.result.status).toBe("success");
    expect(executed).toEqual(["board.auto_align:none", "widget.focus:wi_todo"]);
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

  it("delegates semantic weather plus reminder commands to realtime planning", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_weather_todo",
      sourceText: "看上海现在天气，如果冷就提醒我带外套",
      normalizedText: "看上海现在天气，如果冷就提醒我带外套",
      commands: [
        {
          id: "cmd_weather",
          module: "weather",
          tool: "weather.set_city",
          args: { widgetId: "wi_weather", city: "上海" },
          risk: "safe",
          confidence: 0.9,
          source: "text",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_todo",
          module: "todo",
          tool: "todo.add_item",
          args: { widgetId: "wi_todo", text: "带外套" },
          risk: "safe",
          confidence: 0.9,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_weather", "cmd_todo"] }],
      confidence: 0.9,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({
      modelPlan,
      getContextInput: () => {
        const base = createContextInput();
        return {
          ...base,
          availableDefinitions: [...(base.availableDefinitions ?? []), { definitionId: "wd_todo", type: "todo", name: "待办" }],
          widgets: [
            ...(base.widgets ?? []),
            { widgetId: "wi_weather", definitionId: "wd_weather", type: "weather", name: "天气", order: 3 },
            { widgetId: "wi_todo", definitionId: "wd_todo", type: "todo", name: "待办", order: 4 }
          ]
        };
      }
    });
    await harness.initialize();

    const response = await harness.handleUserInput("看上海现在天气，如果冷就提醒我带外套");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("weather.set_city done；todo.add_item done");
    expect(executed).toEqual(["weather.set_city:wi_weather", "todo.add_item:wi_todo"]);
  });

  it("delegates note content that mentions actions to realtime planning", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_note_literal_action_text",
      sourceText: "便签写下：轻松音乐要重新搜索",
      normalizedText: "便签写下：轻松音乐要重新搜索",
      commands: [
        {
          id: "cmd_note",
          module: "note",
          tool: "note.append",
          args: { widgetId: "wi_note", content: "轻松音乐要重新搜索" },
          risk: "safe",
          confidence: 0.9,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_note"] }],
      confidence: 0.9,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({ modelPlan });
    await harness.initialize();

    const response = await harness.handleUserInput("便签写下：轻松音乐要重新搜索");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["note.append:wi_note"]);
  });

  it("delegates searched-song note appends to realtime planning", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_note_searched_song",
      sourceText: "把刚才搜索到的王菲红豆追加到便签",
      normalizedText: "把刚才搜索到的王菲红豆追加到便签",
      commands: [
        {
          id: "cmd_note",
          module: "note",
          tool: "note.append",
          args: { widgetId: "wi_note", content: "王菲 红豆" },
          risk: "safe",
          confidence: 0.9,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_note"] }],
      confidence: 0.9,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({ modelPlan });
    await harness.initialize();

    const response = await harness.handleUserInput("把刚才搜索到的王菲红豆追加到便签");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["note.append:wi_note"]);
  });

  it("delegates context-sensitive todo completion to realtime planning", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_todo_context_completion",
      sourceText: "把部署完成这项待办勾掉",
      normalizedText: "把部署完成这项待办勾掉",
      commands: [
        {
          id: "cmd_todo",
          module: "todo",
          tool: "todo.complete_item",
          args: { widgetId: "wi_todo", text: "部署完成" },
          risk: "safe",
          confidence: 0.9,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_todo"] }],
      confidence: 0.9,
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
          { widgetId: "wi_todo", definitionId: "wd_todo", type: "todo", name: "待办", order: 3 }
        ],
        availableDefinitions: [...(createContextInput().availableDefinitions ?? []), { definitionId: "wd_todo", type: "todo", name: "待办" }]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("把部署完成这项待办勾掉");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["todo.complete_item:wi_todo"]);
  });

  it("delegates named countdown setup to realtime planning", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_named_countdown",
      sourceText: "设置一分三十秒倒计时，名称叫泡茶",
      normalizedText: "设置一分三十秒倒计时，名称叫泡茶",
      commands: [
        {
          id: "cmd_countdown",
          module: "countdown",
          tool: "countdown.set",
          args: { widgetId: "wi_countdown", totalSeconds: 90, start: true, label: "泡茶" },
          risk: "safe",
          confidence: 0.9,
          source: "text",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_countdown"] }],
      confidence: 0.9,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({
      modelPlan,
      getContextInput: () => {
        const base = createContextInput();
        return {
          ...base,
          widgets: [
            ...(base.widgets ?? []),
            { widgetId: "wi_countdown", definitionId: "wd_countdown", type: "countdown", name: "倒计时", order: 3 }
          ]
        };
      }
    });
    await harness.initialize();

    const response = await harness.handleUserInput("设置一分三十秒倒计时，名称叫泡茶");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["countdown.set:wi_countdown"]);
  });

  it("does not auto-create learned shortcut candidates from successful model fallback", async () => {
    const learnedCommandStore = new LearnedCommandStore();
    const { harness } = createHarness({
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
    expect(harness.getPendingConfirmation()).toBeNull();
    expect(await learnedCommandStore.match("执行我的电视收纳暗号")).toBeNull();
    expect((await learnedCommandStore.list()).shortcuts).toEqual([]);
  });

  it("still executes an already confirmed learned local shortcut", async () => {
    const learnedCommandStore = new LearnedCommandStore();
    await learnedCommandStore.addCandidate({
      id: "learn_tv_close",
      type: "shortcut_alias",
      module: "widget",
      rawText: "执行我的电视收纳暗号",
      normalizedText: "执行我的电视收纳暗号",
      intent: "widget.remove",
      tool: "widget.remove",
      args: { widgetId: "wi_tv" },
      risk: "safe",
      confidence: 0.91,
      source: "realtime-success",
      status: "confirmed",
      createdAt: "2026-06-21T00:00:00.000Z",
      regressionCase: {
        input: "执行我的电视收纳暗号",
        expected: {
          module: "widget",
          tool: "widget.remove",
          args: { widgetId: "wi_tv" }
        }
      }
    });
    const { harness, executed } = createHarness({ learnedCommandStore });
    await harness.initialize();

    const second = await harness.handleUserInput("执行我的电视收纳暗号");

    expect(second.route).toBe("learned");
    expect(second.result.status).toBe("success");
    expect(executed).toEqual(["widget.remove:wi_tv"]);
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

  it("prepends fullscreen exit when realtime only resizes after an exit-fullscreen request", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_exit_fullscreen_resize",
      sourceText: "把音乐窗口退出全屏，然后调整到宽度 520",
      normalizedText: "音乐窗口 退出全屏 调整 宽度 520",
      commands: [
        {
          id: "cmd_resize",
          module: "music",
          tool: "widget.resize",
          args: { widgetId: "wi_music", w: 520, h: 360 },
          risk: "safe",
          confidence: 0.74,
          source: "realtime",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_resize"] }],
      confidence: 0.74,
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
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 3 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("把音乐窗口退出全屏，然后调整到宽度 520");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["app.fullscreen.set:none", "widget.resize:wi_music"]);
  });

  it("prepends fullscreen exit when realtime only focuses after a restore-window request", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_restore_window_focus",
      sourceText: "我刚才误触全屏了，恢复普通窗口并聚焦便签",
      normalizedText: "误触 全屏 恢复普通窗口 聚焦便签",
      commands: [
        {
          id: "cmd_focus",
          module: "note",
          tool: "widget.focus",
          args: { widgetId: "wi_note" },
          risk: "safe",
          confidence: 0.9,
          source: "realtime",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_focus"] }],
      confidence: 0.9,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({ modelPlan });
    await harness.initialize();

    const response = await harness.handleUserInput("我刚才误触全屏了，恢复普通窗口并聚焦便签");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["app.fullscreen.set:none", "widget.focus:wi_note"]);
  });

  it("delegates same-sentence music playback and reminder setup to realtime planning", async () => {
    const modelPlan: CommandPlan = {
      id: "plan_music_reminder_realtime",
      sourceText: "播放舒缓钢琴，三分钟后提醒我休息眼睛",
      normalizedText: "播放舒缓钢琴 三分钟后提醒我休息眼睛",
      commands: [
        {
          id: "cmd_music",
          module: "music",
          tool: "music.play",
          args: { widgetId: "wi_music", query: "舒缓钢琴" },
          risk: "safe",
          confidence: 0.92,
          source: "realtime",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_countdown",
          module: "countdown",
          tool: "countdown.set",
          args: { widgetId: "wi_countdown", totalSeconds: 180, start: true },
          risk: "safe",
          confidence: 0.92,
          source: "realtime",
          requiresHarnessValidation: true
        },
        {
          id: "cmd_todo",
          module: "todo",
          tool: "todo.add_item",
          args: { widgetId: "wi_todo", text: "休息眼睛" },
          risk: "safe",
          confidence: 0.92,
          source: "realtime",
          requiresHarnessValidation: true
        }
      ],
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "sequential", commandIds: ["cmd_music", "cmd_countdown", "cmd_todo"] }],
      confidence: 0.92,
      needsConfirmation: false,
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
    const { harness, executed } = createHarness({
      modelPlan,
      getContextInput: () => ({
        ...createContextInput(),
        availableDefinitions: [
          ...createContextInput().availableDefinitions!,
          { definitionId: "wd_todo", type: "todo", name: "待办" }
        ],
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 3, summary: "空闲" },
          { widgetId: "wi_countdown", definitionId: "wd_countdown", type: "countdown", name: "倒计时", order: 4, summary: "未开始" },
          { widgetId: "wi_todo", definitionId: "wd_todo", type: "todo", name: "待办", order: 5, summary: "空" }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("播放舒缓钢琴，三分钟后提醒我休息眼睛");

    expect(response.route).toBe("model");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["music.play:wi_music", "countdown.set:wi_countdown", "todo.add_item:wi_todo"]);
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
    expect(executed).toEqual(["widget.focus:wi_tv", "tv.play:wi_tv"]);
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

  it("defers semantic news and market layout commands to model planning", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const layoutResponse = await harness.handleUserInput("把新闻和天气并排放，我要看今天情况");
    const focusResponse = await harness.handleUserInput("打开重大新闻小工具后马上聚焦它");

    expect(layoutResponse.route).toBe("model");
    expect(focusResponse.route).toBe("model");
    expect(layoutResponse.result.status).toBe("needs_clarification");
    expect(focusResponse.result.status).toBe("needs_clarification");
    expect(executed).toEqual([]);
  });

  it("defers semantic recorder workflow commands to model planning", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const openOnlyResponse = await harness.handleUserInput("打开录音机但先不要开始录");
    const countdownResponse = await harness.handleUserInput("开始录音，然后三分钟倒计时");

    expect(openOnlyResponse.route).toBe("model");
    expect(countdownResponse.route).toBe("model");
    expect(openOnlyResponse.result.status).toBe("needs_clarification");
    expect(countdownResponse.result.status).toBe("needs_clarification");
    expect(executed).toEqual([]);
  });

  it("defers semantic message board workflow commands to model planning", async () => {
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

    const literalSendResponse = await harness.handleUserInput("留言板发送：我在测试多轮语音");
    const closeNotSendResponse = await harness.handleUserInput("我说关闭留言板时执行关闭，不是发送消息");
    const tuckAwayResponse = await harness.handleUserInput("留言板窗口太碍事了，直接收起来");

    expect(literalSendResponse.route).toBe("model");
    expect(closeNotSendResponse.route).toBe("model");
    expect(tuckAwayResponse.route).toBe("model");
    expect(literalSendResponse.result.status).toBe("needs_clarification");
    expect(closeNotSendResponse.result.status).toBe("needs_clarification");
    expect(tuckAwayResponse.result.status).toBe("needs_clarification");
    expect(executed).toEqual([]);
  });

  it("defers cross-tool workflow commands to model planning", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const marketLayoutResponse = await harness.handleUserInput("打开市场行情、重大新闻和纽约时间，排成一列");
    const translateCopyResponse = await harness.handleUserInput("把 hello world 翻译成中文，再复制到剪贴板");
    const todoReminderResponse = await harness.handleUserInput("添加待办提交报告，同时明早九点提醒");
    const weatherClockResponse = await harness.handleUserInput("天气改成武汉，世界时钟改成北京伦敦纽约");

    expect(marketLayoutResponse.route).toBe("model");
    expect(translateCopyResponse.route).toBe("model");
    expect(todoReminderResponse.route).toBe("model");
    expect(weatherClockResponse.route).toBe("model");
    expect(executed).toEqual([]);
  });

  it("defers correction and negation commands to model planning", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    const clockCorrection = await harness.handleUserInput("打开时钟，啊不是世界时钟，是那个表盘时钟");
    const musicCorrection = await harness.handleUserInput("我想听轻松音乐，别继续上一首，重新搜");
    const todoCorrection = await harness.handleUserInput("添加待办买票，哦再加一条订酒店");
    const focusCorrection = await harness.handleUserInput("把计算器放大，算了先聚焦就行");

    expect(clockCorrection.route).toBe("model");
    expect(musicCorrection.route).toBe("model");
    expect(todoCorrection.route).toBe("model");
    expect(focusCorrection.route).toBe("model");
    expect(executed).toEqual([]);
  });

  it("defers confirmation and preservation commands to model planning", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 3 },
          { widgetId: "wi_countdown", definitionId: "wd_countdown", type: "countdown", name: "倒计时", order: 4 },
          { widgetId: "wi_recorder", definitionId: "wd_recorder", type: "recorder", name: "录音机", order: 5 }
        ]
      })
    });
    await harness.initialize();

    const mediaClose = await harness.handleUserInput("关闭音乐和电视之前先确认一次");
    const countdownStatus = await harness.handleUserInput("重置倒计时前先告诉我当前状态");
    const temporaryClose = await harness.handleUserInput("关闭所有临时小工具，保留桌板");
    const recorderStatus = await harness.handleUserInput("停止录音前确认当前是否正在录");

    expect(mediaClose.route).toBe("model");
    expect(countdownStatus.route).toBe("model");
    expect(temporaryClose.route).toBe("model");
    expect(recorderStatus.route).toBe("model");
    expect(executed).toEqual([]);
  });

  it("defers window state adjustment commands to model planning", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 3 },
          { widgetId: "wi_tv", definitionId: "wd_tv", type: "tv", name: "电视", order: 4 },
          { widgetId: "wi_headline", definitionId: "wd_headline", type: "headline", name: "重大新闻", order: 5 },
          { widgetId: "wi_recorder", definitionId: "wd_recorder", type: "recorder", name: "录音机", order: 6 },
          { widgetId: "wi_countdown", definitionId: "wd_countdown", type: "countdown", name: "倒计时", order: 7 }
        ]
      })
    });
    await harness.initialize();

    const musicPanel = await harness.handleUserInput("音乐封面太小了，把播放器面板放大");
    const musicControls = await harness.handleUserInput("把音乐播放控件居中，登录按钮别挡封面");
    const tvMove = await harness.handleUserInput("电视窗口太挡眼，缩小并放到右上角");
    const recorderMove = await harness.handleUserInput("让录音机窗口别盖住倒计时");
    const newsResize = await harness.handleUserInput("把新闻窗口缩小，避免挡住便签");

    expect(musicPanel.route).toBe("model");
    expect(musicControls.route).toBe("model");
    expect(tvMove.route).toBe("model");
    expect(recorderMove.route).toBe("model");
    expect(newsResize.route).toBe("model");
    expect(executed).toEqual([]);
  });

  it("defers productivity plan commands to model planning", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_todo", definitionId: "wd_todo", type: "todo", name: "待办", order: 3 },
          { widgetId: "wi_weather", definitionId: "wd_weather", type: "weather", name: "天气", order: 4 },
          { widgetId: "wi_music", definitionId: "wd_music", type: "music", name: "音乐", order: 5 }
        ],
        availableDefinitions: [
          ...(createContextInput().availableDefinitions ?? []),
          { definitionId: "wd_todo", type: "todo", name: "待办" },
          { definitionId: "wd_weather", type: "weather", name: "天气" },
          { definitionId: "wd_music", type: "music", name: "音乐" }
        ]
      })
    });
    await harness.initialize();

    const todoReview = await harness.handleUserInput("把复盘 realtime 断线问题加入待办");
    const monitorReminder = await harness.handleUserInput("十五分钟后提醒我查看监控脚本日志");
    const weatherDecision = await harness.handleUserInput("查上海天气决定下午是否出门");
    const calculatorTime = await harness.handleUserInput("打开计算器算今天还有多少分钟到六点");
    const workbenchMusic = await harness.handleUserInput("打开工作台并把音乐播放器放到最前");
    const alignFocus = await harness.handleUserInput("整理桌面后聚焦待办窗口");

    expect(todoReview.route).toBe("model");
    expect(monitorReminder.route).toBe("model");
    expect(weatherDecision.route).toBe("model");
    expect(calculatorTime.route).toBe("model");
    expect(workbenchMusic.route).toBe("model");
    expect(alignFocus.route).toBe("model");
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
    expect(executed).toEqual(["widget.remove:wi_tv", "widget.remove:wi_note"]);
  });

  it("expands close all window commands into concrete widget removals", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_messageBoard", definitionId: "wd_messageBoard", type: "messageBoard", name: "留言板", order: 3 },
          { widgetId: "wi_worldClock", definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟", order: 4 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleUserInput("关闭所有窗口");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(response.result.message).toBe("widget.remove done；widget.remove done；widget.remove done；widget.remove done");
    expect(executed).toEqual(["widget.remove:wi_tv", "widget.remove:wi_note", "widget.remove:wi_messageBoard", "widget.remove:wi_worldClock"]);
  });

  it("expands realtime close all window commands before model planning", async () => {
    const { harness, executed } = createHarness({
      modelCall: { id: "model_diag", name: "assistant.runtime_diagnostics", arguments: {}, source: "realtime" },
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_messageBoard", definitionId: "wd_messageBoard", type: "messageBoard", name: "留言板", order: 3 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleRealtimeUserInput("关闭全部窗口");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["widget.remove:wi_tv", "widget.remove:wi_note", "widget.remove:wi_messageBoard"]);
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
    expect(executed).toEqual(["widget.remove:wi_messageBoard"]);
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
    expect(executed).toEqual(["widget.remove:wi_music", "widget.remove:wi_weather"]);
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
    expect(executed).toEqual(["widget.remove:wi_music"]);
  });

  it("does not leave queued confirmations after multi-close shortcut commands", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();

    await harness.handleUserInput("关闭电视和便签");
    const confirmAfterCancel = await harness.handleUserInput("确认");

    expect(confirmAfterCancel.result.status).toBe("needs_clarification");
    expect(harness.getPendingConfirmation()).toBeNull();
    expect(executed).toEqual(["widget.remove:wi_tv", "widget.remove:wi_note"]);
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

  it("expands direct realtime remove calls with bulk window targets", async () => {
    const { harness, executed } = createHarness({
      getContextInput: () => ({
        ...createContextInput(),
        widgets: [
          ...createContextInput().widgets,
          { widgetId: "wi_worldClock", definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟", order: 3 }
        ]
      })
    });
    await harness.initialize();

    const response = await harness.handleFunctionCall({
      id: "call_close_all",
      name: "widget.remove",
      arguments: { targetText: "所有窗口" },
      source: "realtime"
    });

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("success");
    expect(executed).toEqual(["widget.remove:wi_tv", "widget.remove:wi_note", "widget.remove:wi_worldClock"]);
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
