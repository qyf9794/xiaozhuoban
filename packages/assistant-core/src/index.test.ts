import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  AssistantRegistryError,
  LocalHarnessResponsibility,
  RealtimePlannerResponsibility,
  TextModelFallbackResponsibility,
  TranscriptionResponsibility,
  RemoteCodexResponsibility,
  PlanValidator,
  CommandExecutor,
  LearnedCommandStore,
  MutationOutbox,
  RealtimePlanAdapter,
  RealtimeRuntimeController,
  ShortcutPlanAdapter,
  TextFallbackPlanAdapter,
  WidgetAssistantRegistry,
  XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL,
  XIAOZHUOBAN_REALTIME_MODEL,
  createPlanPreview,
  createLearningCandidate,
  createCommandPlanFromToolCalls,
  createDefaultIntentShortcutRouter,
  classifyShortcutDeferral,
  createPassthroughSchema,
  createStrictObjectSchema,
  createAiModuleInstallSession,
  commandPolicyManifest,
  getNonActionModelTools,
  installReviewedModule,
  isNonActionModelTool,
  parseAiGeneratedModuleManifest,
  reviewAiGeneratedModule,
  runWidgetModuleStaticChecks,
  ContextSummarizer,
  normalizeText,
  scoreCandidates,
  segmentCommandText,
  ToolScopeManager,
  WidgetTargetResolver,
  type AssistantParameterSchema,
  type AssistantToolSpec,
  type CommandPlan,
  type CompactWidgetSummary,
  type IntentShortcutContext,
  type RealtimeScopedModuleContext
} from "./index";

interface AddArgs {
  a: number;
  b: number;
}

const addArgsSchema: AssistantParameterSchema<AddArgs> = {
  safeParse(value) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).a === "number" &&
      typeof (value as Record<string, unknown>).b === "number"
    ) {
      return { success: true, data: value as AddArgs };
    }
    return {
      success: false,
      error: {
        issues: [{ path: ["a"], message: "a 和 b 必须是数字" }]
      }
    };
  }
};

describe("ActionRegistry", () => {
  it("registers and executes an action", async () => {
    const registry = new ActionRegistry();
    registry.register({
      spec: {
        name: "calculator.add",
        description: "Add two numbers",
        parameters: addArgsSchema,
        risk: "safe",
        scope: "widget-detail"
      },
      execute: (args) => ({
        status: "success",
        message: "已计算",
        data: { sum: args.a + args.b }
      })
    });

    const result = await registry.execute<{ sum: number }>({
      id: "call_1",
      name: "calculator.add",
      arguments: { a: 2, b: 3 },
      source: "test"
    });

    expect(result.status).toBe("success");
    expect(result.data?.sum).toBe(5);
    expect(registry.get("calculator.add")?.description).toBe("Add two numbers");
    expect(registry.list("widget-detail")).toHaveLength(1);
  });

  it("rejects duplicate action names", () => {
    const registry = new ActionRegistry();
    const action = {
      spec: {
        name: "desktop.focus",
        description: "Focus desktop",
        parameters: createPassthroughSchema<Record<string, never>>(),
        scope: "desktop" as const
      },
      execute: () => ({ status: "success" as const, message: "ok" })
    };

    registry.register(action);

    expect(() => registry.register(action)).toThrow(AssistantRegistryError);
  });

  it("returns an unknown tool failure", async () => {
    const registry = new ActionRegistry();

    const result = await registry.execute({
      id: "call_1",
      name: "missing.tool",
      arguments: {},
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "UNKNOWN_TOOL"
    });
  });

  it("returns schema validation failures", async () => {
    const registry = new ActionRegistry();
    registry.register({
      spec: {
        name: "calculator.add",
        description: "Add two numbers",
        parameters: addArgsSchema
      },
      execute: () => ({ status: "success", message: "should not run" })
    });

    const result = await registry.execute({
      id: "call_1",
      name: "calculator.add",
      arguments: { a: "2", b: 3 },
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "INVALID_ARGUMENTS"
    });
    expect(result.message).toContain("a 和 b 必须是数字");
  });

  it("converts executor exceptions to failed results", async () => {
    const registry = new ActionRegistry();
    registry.register({
      spec: {
        name: "desktop.explode",
        description: "Throws",
        parameters: createPassthroughSchema<Record<string, never>>()
      },
      execute: () => {
        throw new Error("boom");
      }
    });

    const result = await registry.execute({
      id: "call_1",
      name: "desktop.explode",
      arguments: {},
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "EXECUTION_FAILED",
      message: "boom"
    });
  });
});

describe("createPassthroughSchema", () => {
  it("can use a type guard", () => {
    const schema = createPassthroughSchema<{ ok: true }>(
      (value): value is { ok: true } =>
        Boolean(value) && typeof value === "object" && (value as Record<string, unknown>).ok === true
    );

    expect(schema.safeParse({ ok: true }).success).toBe(true);
    expect(schema.safeParse({ ok: false }).success).toBe(false);
  });
});

describe("assistant responsibility boundaries", () => {
  it("freezes model roles so execution stays inside the harness", () => {
    expect(LocalHarnessResponsibility.responsibilities.join(" ")).toContain("CommandPlan");
    expect(LocalHarnessResponsibility.forbidden.join(" ")).toContain("绕过 harness");
    expect(RealtimePlannerResponsibility.responsibilities.join(" ")).toContain("第一阶段");
    expect(RealtimePlannerResponsibility.responsibilities.join(" ")).toContain("第二阶段");
    expect(RealtimePlannerResponsibility.forbidden.join(" ")).toContain("全量桌面上下文");
    expect(TranscriptionResponsibility.forbidden.join(" ")).toContain("执行工具");
    expect(TextModelFallbackResponsibility.forbidden.join(" ")).toContain("默认使用 realtime 模型");
    expect(RemoteCodexResponsibility.forbidden.join(" ")).toContain("实时麦克风流");
  });

  it("uses a dedicated low-latency text fallback model by default", () => {
    expect(XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL).not.toBe(XIAOZHUOBAN_REALTIME_MODEL);
  });
});

describe("WidgetAssistantRegistry and Command Planner", () => {
  const weatherAction = {
    spec: {
      name: "weather.set_city",
      description: "Set weather city",
      parameters: createPassthroughSchema<{ widgetId: string; city: string }>(
        (value): value is { widgetId: string; city: string } =>
          Boolean(value) &&
          typeof value === "object" &&
          typeof (value as Record<string, unknown>).widgetId === "string" &&
          typeof (value as Record<string, unknown>).city === "string"
      ),
      risk: "safe" as const,
      scope: "widget-detail" as const,
      widgetType: "weather",
      requiresTarget: true
    },
    execute: () => ({ status: "success" as const, message: "ok" })
  };

  function createWeatherModule() {
    return {
      type: "weather",
      definition: { id: "wd_weather", type: "weather", name: "天气" },
      aliases: ["天气", "weather"],
      shortcuts: [
        {
          id: "weather.query",
          intent: "query_weather",
          actions: ["查", "查询"],
          examples: ["帮我查一下北京天气"],
          risk: "safe" as const
        }
      ],
      tools: [weatherAction],
      executionPolicy: { defaultMode: "latest-wins" as const },
      context: {
        getScopedContext: () => ({
          moduleType: "weather",
          tools: [weatherAction.spec],
          toolSchemas: {},
          instances: [],
          stateSummary: { city: "北京" },
          shortcutExamples: ["北京天气"],
          executionPolicy: { defaultMode: "latest-wins" as const },
          riskPolicy: { safe: ["weather.set_city"], confirm: [], destructive: [] }
        })
      },
      realtime: {
        exposeCatalog: () => ({
          type: "weather",
          displayName: "天气",
          aliases: ["天气", "weather"],
          capabilities: ["查询城市天气"],
          shortcutExamples: ["北京天气"],
          riskSummary: []
        }),
        getScopedContext: () => ({
          moduleType: "weather",
          tools: [weatherAction.spec],
          toolSchemas: {},
          instances: [],
          stateSummary: { city: "北京" },
          shortcutExamples: ["北京天气"],
          executionPolicy: { defaultMode: "latest-wins" as const },
          riskPolicy: { safe: ["weather.set_city"], confirm: [], destructive: [] }
        })
      }
    };
  }

  it("registers modules and generates realtime catalog plus scoped context", () => {
    const registry = new WidgetAssistantRegistry();
    registry.register(createWeatherModule());

    expect(registry.get("weather")?.aliases).toContain("天气");
    expect(registry.getRealtimeCatalog()).toEqual([
      expect.objectContaining({ type: "weather", capabilities: ["查询城市天气"] })
    ]);
    expect(
      registry.getScopedContextForModule("weather", {
        userText: "北京天气",
        selectedToolHint: "weather.set_city",
        tools: [weatherAction.spec]
      })
    ).toMatchObject({ moduleType: "weather", stateSummary: { city: "北京" } });

    expect(registry.disable("weather")).toBe(true);
    expect(registry.getRealtimeCatalog()).toEqual([]);
    expect(registry.enable("weather")).toBe(true);
    expect(registry.unregister("weather")).toBe(true);
  });

  it("lists active tools, shortcuts, and test matrices by module state", () => {
    const registry = new WidgetAssistantRegistry();
    const module = {
      ...createWeatherModule(),
      testMatrix: { localParsing: ["北京天气"], regression: ["帮我查一下北京天气"] }
    };
    registry.register(module);

    expect(registry.listTools().map((tool) => tool.name)).toEqual(["weather.set_city"]);
    expect(registry.listShortcuts().map((shortcut) => shortcut.id)).toEqual(["weather.query"]);
    expect(registry.getToolsForModule("weather").map((tool) => tool.name)).toEqual(["weather.set_city"]);
    expect(registry.getShortcutsForModule("weather").map((shortcut) => shortcut.intent)).toEqual(["query_weather"]);
    expect(registry.getTestMatrixForModule("weather")).toEqual(module.testMatrix);
    expect(registry.listTestMatrices()).toEqual([{ module: "weather", testMatrix: module.testMatrix }]);

    registry.disable("weather");

    expect(registry.listTools()).toEqual([]);
    expect(registry.listShortcuts()).toEqual([]);
    expect(registry.getToolsForModule("weather")).toEqual([]);
    expect(registry.getShortcutsForModule("weather")).toEqual([]);
    expect(registry.getTestMatrixForModule("weather")).toBeNull();
    expect(registry.listTools({ includeDisabled: true }).map((tool) => tool.name)).toEqual(["weather.set_city"]);
  });

  it("normalizes text, segments commands, and scores candidate modules", () => {
    const registry = new WidgetAssistantRegistry();
    registry.register(createWeatherModule());

    expect(normalizeText("帮我，啊，查一下北京天气")).toBe("查 北京天气");
    expect(segmentCommandText("先打开音乐，再播放周杰伦，同时查北京天气")).toEqual([
      { id: "segment_1", text: "先打开音乐", connector: "start" },
      { id: "segment_2", text: "播放周杰伦", connector: "sequential" },
      { id: "segment_3", text: "查北京天气", connector: "parallel" }
    ]);
    expect(scoreCandidates("帮我查一下北京天气", registry.list()).candidates[0]).toMatchObject({
      type: "weather"
    });
  });

  it("classifies complex shortcut deferrals by stable categories while preserving simple local shortcuts", () => {
    const cases = [
      ["关闭留言板时执行关闭，不是发送关闭", "correction_or_negation"],
      ["打开音乐播放器，搜索邓紫棋泡沫并播放", "music_semantic"],
      ["查上海天气决定下午是否出门", "multi_step"],
      ["把天气摘要发到留言板，然后清空输入框", "message_board_safety"],
      ["电视全屏时隐藏侧边栏", "tv_workflow"],
      ["音乐登录按钮挡住封面，放到右上角", "window_layout"],
      ["翻译成中文后复制到剪贴板", "multi_step"]
    ] as const;

    for (const [input, category] of cases) {
      const result = classifyShortcutDeferral(input);
      expect(result).toMatchObject({ defer: true, rule: { category } });
      if (result.defer) {
        expect(result.rule.id).toBeTruthy();
        expect(result.rule.reason).toBeTruthy();
      }
    }

    expect(classifyShortcutDeferral("2斤是多少克")).toEqual({ defer: false });
    expect(classifyShortcutDeferral("清空剪贴板，然后添加一条待办：明天买牛奶")).toEqual({ defer: false });
    expect(classifyShortcutDeferral("打开天气查北京再打开世界时钟")).toEqual({ defer: false });
  });

  it("validates command plans before execution", () => {
    const registry = new WidgetAssistantRegistry();
    registry.register(createWeatherModule());
    const validator = new PlanValidator({
      tools: [weatherAction.spec],
      moduleRegistry: registry,
      allowedArgumentKeysByTool: { "weather.set_city": ["widgetId", "city"] }
    });

    const valid = createCommandPlanFromToolCalls("北京天气", [
      { id: "call_1", name: "weather.set_city", arguments: { widgetId: "wi_weather", city: "北京" }, source: "text" }
    ]);
    valid.commands[0]!.module = "weather";
    expect(validator.validate(valid).ok).toBe(true);

    const extra = createCommandPlanFromToolCalls("北京天气", [
      {
        id: "call_2",
        name: "weather.set_city",
        arguments: { widgetId: "wi_weather", city: "北京", token: "secret" },
        source: "text"
      }
    ]);
    extra.commands[0]!.module = "weather";
    expect(validator.validate(extra).errors[0]).toMatchObject({ code: "EXTRA_ARGUMENTS" });

    const unknown = createCommandPlanFromToolCalls("未知", [
      { id: "call_3", name: "weather.delete_everything", arguments: {}, source: "text" }
    ]);
    expect(validator.validate(unknown).errors[0]).toMatchObject({ code: "UNKNOWN_TOOL" });
  });

  it("adapts shortcut, realtime, and text fallback outputs into command plans", () => {
    const shortcutPlan = new ShortcutPlanAdapter().createPlan("打开音乐，同时查天气", [
      [{ id: "music", name: "board.add_widget", arguments: { definitionId: "wd_music" }, source: "shortcut" }],
      [
        { id: "weather", name: "weather.set_city", arguments: { widgetId: "wi_weather", city: "北京" }, source: "shortcut" },
        { id: "headline", name: "headline.request_refresh", arguments: { widgetId: "wi_headline" }, source: "shortcut" }
      ]
    ]);
    expect(shortcutPlan.createdBy).toBe("local");
    expect(shortcutPlan.executionGroups).toEqual([
      { id: "group_1", mode: "sequential", commandIds: ["music"] },
      { id: "group_2", mode: "parallel", commandIds: ["weather", "headline"] }
    ]);

    expect(
      new RealtimePlanAdapter().createPlan("查天气", {
        id: "rt",
        name: "weather.set_city",
        arguments: { widgetId: "wi_weather", city: "北京" },
        source: "text"
      }).createdBy
    ).toBe("realtime-2");
    expect(
      new TextFallbackPlanAdapter().createPlan("查天气", {
        id: "txt",
        name: "weather.set_city",
        arguments: { widgetId: "wi_weather", city: "北京" },
        source: "realtime"
      }).createdBy
    ).toBe("text-llm");
  });
});

describe("IntentShortcutRouter", () => {
  const context: IntentShortcutContext = {
    source: "shortcut",
    boardId: "board_1",
    boardName: "默认桌板",
    availableBoards: [
      { boardId: "board_1", name: "默认桌板", active: true },
      { boardId: "board_2", name: "工作台测试" }
    ],
    availableDefinitions: [
      { definitionId: "wd_weather", type: "weather", name: "天气" },
      { definitionId: "wd_countdown", type: "countdown", name: "倒计时" },
      { definitionId: "wd_note", type: "note", name: "便签" },
      { definitionId: "wd_todo", type: "todo", name: "待办" },
      { definitionId: "wd_clipboard", type: "clipboard", name: "剪贴板" },
      { definitionId: "wd_music", type: "music", name: "音乐" },
      { definitionId: "wd_translate", type: "translate", name: "翻译" },
      { definitionId: "wd_converter", type: "converter", name: "换算" },
      { definitionId: "wd_calculator", type: "calculator", name: "计算器" },
      { definitionId: "wd_market", type: "market", name: "行情" },
      { definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟" },
      { definitionId: "wd_headline", type: "headline", name: "新闻" },
      { definitionId: "wd_messageBoard", type: "messageBoard", name: "留言板" }
    ],
    availableWidgets: [
      {
        widgetId: "wi_weather",
        definitionId: "wd_weather",
        type: "weather",
        name: "天气",
        order: 1,
        summary: "上海",
        recent: true
      },
      {
        widgetId: "wi_tv",
        definitionId: "wd_tv",
        type: "tv",
        name: "电视",
        order: 2,
        summary: "CCTV1",
        recent: false
      },
      {
        widgetId: "wi_countdown",
        definitionId: "wd_countdown",
        type: "countdown",
        name: "倒计时",
        order: 3,
        summary: "未运行",
        recent: false
      },
      {
        widgetId: "wi_note",
        definitionId: "wd_note",
        type: "note",
        name: "便签",
        order: 4,
        summary: "明早九点开会",
        recent: false
      },
      {
        widgetId: "wi_todo",
        definitionId: "wd_todo",
        type: "todo",
        name: "待办",
        order: 5,
        summary: "2 项待办",
        recent: false
      },
      {
        widgetId: "wi_translate",
        definitionId: "wd_translate",
        type: "translate",
        name: "翻译",
        order: 6,
        summary: "",
        recent: false
      },
      {
        widgetId: "wi_converter",
        definitionId: "wd_converter",
        type: "converter",
        name: "换算",
        order: 7,
        summary: "",
        recent: false
      },
      {
        widgetId: "wi_calculator",
        definitionId: "wd_calculator",
        type: "calculator",
        name: "计算器",
        order: 8,
        summary: "0",
        recent: false
      },
      {
        widgetId: "wi_clipboard",
        definitionId: "wd_clipboard",
        type: "clipboard",
        name: "剪贴板",
        order: 9,
        summary: "3 条剪贴板记录",
        recent: false
      },
      {
        widgetId: "wi_market",
        definitionId: "wd_market",
        type: "market",
        name: "行情",
        order: 10,
        summary: "",
        recent: false
      },
      {
        widgetId: "wi_worldClock",
        definitionId: "wd_worldClock",
        type: "worldClock",
        name: "世界时钟",
        order: 11,
        summary: "",
        recent: false
      },
      {
        widgetId: "wi_headline",
        definitionId: "wd_headline",
        type: "headline",
        name: "新闻",
        order: 12,
        summary: "",
        recent: false
      },
      {
        widgetId: "wi_messageBoard",
        definitionId: "wd_messageBoard",
        type: "messageBoard",
        name: "留言板",
        order: 13,
        summary: "已连接",
        recent: false
      }
    ],
    focusedWidget: {
      widgetId: "wi_tv",
      definitionId: "wd_tv",
      type: "tv",
      name: "电视",
      order: 2,
      summary: "CCTV1",
      focused: true
    }
  };

  it("routes confirmation locally when pending", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("确认", {
      pendingConfirmation: {
        id: "confirm_1",
        actionName: "widget.remove",
        arguments: { widgetId: "wi_note" },
        message: "删除便签？",
        createdAt: "2026-06-16T00:00:00.000Z"
      }
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("assistant.confirm");
      expect(result.toolCall.arguments).toEqual({ confirmationId: "confirm_1" });
    }
  });

  it("routes cancellation locally when pending", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("算了", {
      pendingConfirmation: {
        id: "confirm_2",
        actionName: "widget.clear_state",
        arguments: { widgetId: "wi_note" },
        message: "清空便签？",
        createdAt: "2026-06-16T00:00:00.000Z"
      }
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("assistant.cancel");
      expect(result.toolCall.arguments).toEqual({ confirmationId: "confirm_2" });
    }
  });

  it("routes desktop auto-align without model fallback", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("整理一下桌面", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.auto_align");
      expect(result.confidence).toBeGreaterThan(0.9);
    }
  });

  it("routes app shell window commands locally with high confidence", () => {
    const router = createDefaultIntentShortcutRouter();
    const cases = [
      ["把左边栏先藏起来", "app.sidebar.set", { mode: "hide" }],
      ["侧边栏重新显示", "app.sidebar.set", { mode: "show" }],
      ["进入沉浸全屏", "app.fullscreen.set", { mode: "enter" }],
      ["退出全屏回普通窗口", "app.fullscreen.set", { mode: "exit" }],
      ["打开小桌板设置", "app.settings.open", {}],
      ["打开搜索命令面板", "app.command_palette.open", {}],
      ["我要新建一个 AI 小工具", "app.ai_dialog.open", {}]
    ] as const;

    cases.forEach(([input, toolName, args]) => {
      const result = router.route(input, context);
      expect(result.matched, input).toBe(true);
      if (result.matched) {
        expect(result.toolCall.name).toBe(toolName);
        expect(result.toolCall.arguments).toEqual(args);
        expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      }
    });
  });

  it("routes named board creation without model fallback", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("新建桌板叫测试桌板", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.create");
      expect(result.toolCall.arguments).toEqual({ name: "测试桌板" });
    }
  });

  it("routes current board rename with the active board id", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("把当前桌板重命名为工作台", {
      ...context,
      boardId: "board_1",
      boardName: "我的桌板"
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.rename");
      expect(result.toolCall.arguments).toEqual({ boardId: "board_1", name: "工作台" });
    }
  });

  it("routes board switching by board name", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("切换到工作台测试桌板", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.switch");
      expect(result.toolCall.arguments).toEqual({ boardId: "board_2" });
    }
  });

  it("routes casual board switching by known board name", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("回默认", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.switch");
      expect(result.toolCall.arguments).toEqual({ boardId: "board_1" });
    }
  });

  it("routes weather city commands to the existing weather widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("上海天气", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("weather.set_city");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_weather", city: "上海" });
    }
  });

  it("routes prefixed weather city commands without keeping command verbs", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("看洛杉矶天气", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("weather.set_city");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_weather", city: "洛杉矶" });
    }
  });

  it("routes natural weather questions without explicitly saying weather", () => {
    const router = createDefaultIntentShortcutRouter();
    const withWidget = router.route("查北京今天冷不冷", context);
    const withoutWidget = router.route("查北京今天冷不冷", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "weather")
    });

    expect(withWidget.matched).toBe(true);
    if (withWidget.matched) {
      expect(withWidget.toolCall.name).toBe("weather.set_city");
      expect(withWidget.toolCall.arguments).toEqual({ widgetId: "wi_weather", city: "北京" });
      expect(withWidget.confidence).toBeGreaterThanOrEqual(0.9);
    }
    expect(withoutWidget.matched).toBe(true);
    if (withoutWidget.matched) {
      expect(withoutWidget.toolCall.name).toBe("board.add_widget");
      expect(withoutWidget.toolCall.arguments).toEqual({
        definitionId: "wd_weather",
        followUp: {
          name: "weather.set_city",
          arguments: { city: "北京" }
        }
      });
      expect(withoutWidget.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes supported weather city aliases", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("LA天气", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("weather.set_city");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_weather", city: "los-angeles" });
    }
  });

  it("routes supported Chinese weather city nicknames", () => {
    const router = createDefaultIntentShortcutRouter();
    const beijing = router.route("帝都天气", context);
    const shanghai = router.route("魔都天气", context);

    expect(beijing.matched).toBe(true);
    expect(shanghai.matched).toBe(true);
    if (beijing.matched && shanghai.matched) {
      expect(beijing.toolCall.name).toBe("weather.set_city");
      expect(beijing.toolCall.arguments).toEqual({ widgetId: "wi_weather", city: "北京" });
      expect(shanghai.toolCall.name).toBe("weather.set_city");
      expect(shanghai.toolCall.arguments).toEqual({ widgetId: "wi_weather", city: "上海" });
    }
  });

  it("routes English weather commands for supported cities", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("Boston weather", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("weather.set_city");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_weather", city: "boston" });
    }
  });

  it("routes weather city commands to add-and-set when the widget is absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("上海天气", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "weather")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_weather",
        followUp: {
          name: "weather.set_city",
          arguments: { city: "上海" }
        }
      });
    }
  });

  it("routes countdown duration commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("十分钟倒计时", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("countdown.set");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_countdown", totalSeconds: 600, start: true });
    }
  });

  it("routes compound countdown duration commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("1小时30分钟倒计时", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("countdown.set");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_countdown", totalSeconds: 5400, start: true });
    }
  });

  it("routes second-based countdown duration commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("90秒倒计时", context);
    const chinese = router.route("设置二十五秒计时", context);

    expect(result.matched).toBe(true);
    expect(chinese.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("countdown.set");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_countdown", totalSeconds: 90, start: true });
    }
    if (chinese.matched) {
      expect(chinese.toolCall.name).toBe("countdown.set");
      expect(chinese.toolCall.arguments).toEqual({ widgetId: "wi_countdown", totalSeconds: 25, start: true });
    }
  });

  it("routes half-hour countdown duration commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("半小时倒计时", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("countdown.set");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_countdown", totalSeconds: 1800, start: true });
    }
  });

  it("routes timer shorthand duration commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("定时十分钟", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("countdown.set");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_countdown", totalSeconds: 600, start: true });
    }
  });

  it("routes countdown duration commands to add-and-start when the widget is absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("十分钟倒计时", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "countdown")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_countdown",
        followUp: {
          name: "countdown.set",
          arguments: { totalSeconds: 600, start: true }
        }
      });
    }
  });

  it("routes countdown control commands without closing the widget", () => {
    const router = createDefaultIntentShortcutRouter();

    const pause = router.route("停止倒计时", context);
    const resume = router.route("继续倒计时", context);
    const reset = router.route("重置倒计时", context);

    expect(pause.matched).toBe(true);
    expect(resume.matched).toBe(true);
    expect(reset.matched).toBe(true);
    if (pause.matched) {
      expect(pause.toolCall.name).toBe("countdown.pause");
      expect(pause.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
      expect(pause.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (resume.matched) {
      expect(resume.toolCall.name).toBe("countdown.resume");
      expect(resume.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
      expect(resume.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (reset.matched) {
      expect(reset.toolCall.name).toBe("countdown.reset");
      expect(reset.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
      expect(reset.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes casual timer control commands without requiring countdown wording", () => {
    const router = createDefaultIntentShortcutRouter();

    const pause = router.route("暂停计时", context);
    const resume = router.route("继续定时器", context);
    const reset = router.route("重置定时", context);

    expect(pause.matched).toBe(true);
    expect(resume.matched).toBe(true);
    expect(reset.matched).toBe(true);
    if (pause.matched) {
      expect(pause.toolCall.name).toBe("countdown.pause");
      expect(pause.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
    }
    if (resume.matched) {
      expect(resume.toolCall.name).toBe("countdown.resume");
      expect(resume.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
    }
    if (reset.matched) {
      expect(reset.toolCall.name).toBe("countdown.reset");
      expect(reset.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
    }
  });

  it("routes cancel countdown wording as pausing instead of removing the widget", () => {
    const router = createDefaultIntentShortcutRouter();

    const cancel = router.route("取消倒计时", context);
    const finish = router.route("结束计时器", context);

    expect(cancel.matched).toBe(true);
    expect(finish.matched).toBe(true);
    if (cancel.matched) {
      expect(cancel.toolCall.name).toBe("countdown.pause");
      expect(cancel.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
    }
    if (finish.matched) {
      expect(finish.toolCall.name).toBe("countdown.pause");
      expect(finish.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
    }
  });

  it("keeps close countdown wording as widget removal", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("关闭倒计时", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("widget.remove");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_countdown" });
    }
  });

  it("routes note writing commands to the existing note widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("便签记下明早九点开会", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("note.write");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_note", content: "明早九点开会", mode: "append" });
    }
  });

  it("routes explicit note writing to add-and-follow-up when the note widget is absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("便签记下今天继续回归测试", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "note")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_note",
        followUp: {
          name: "note.write",
          arguments: { content: "今天继续回归测试", mode: "append" }
        }
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes casual note shorthand to the note widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("帮我记一下今天继续测试小桌板", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("note.write");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_note", content: "今天继续测试小桌板", mode: "append" });
    }
  });

  it("routes write-a-note wording to the note widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("帮我记个便签：晚上复盘", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("note.write");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_note", content: "晚上复盘", mode: "append" });
    }
  });

  it("routes note clear commands to clear content instead of closing the widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("清空便签内容", context);
    const shorthand = router.route("清一下便签", context);

    expect(result.matched).toBe(true);
    expect(shorthand.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("note.clear");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_note" });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (shorthand.matched) {
      expect(shorthand.toolCall.name).toBe("note.clear");
      expect(shorthand.toolCall.arguments).toEqual({ widgetId: "wi_note" });
      expect(shorthand.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes todo add commands before generic widget opening", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("添加待办买牛奶", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_todo", text: "买牛奶" });
    }
  });

  it("routes explicit todo add commands to add-and-follow-up when the todo widget is absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("添加待办买咖啡豆", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "todo")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_todo",
        followUp: {
          name: "todo.add_item",
          arguments: { text: "买咖啡豆" }
        }
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes reminder commands with only a due time using a default reminder text", () => {
    const router = createDefaultIntentShortcutRouter();
    const now = new Date(2026, 5, 18, 12, 20, 0);
    const result = router.route("十分钟后提醒我", {
      ...context,
      currentTime: now.toISOString(),
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "todo")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_todo",
        followUp: {
          name: "todo.add_item",
          arguments: {
            text: "提醒我",
            dueAt: new Date(2026, 5, 18, 12, 30, 0).toISOString()
          }
        }
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes todo add commands with natural due times", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("待办添加 明天9点交报告", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "交报告",
        dueAt: new Date(2026, 5, 18, 9, 0, 0).toISOString()
      });
    }
  });

  it("routes todo add commands with before-deadline wording", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("待办添加 明天9点前交报告", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "交报告",
        dueAt: new Date(2026, 5, 18, 9, 0, 0).toISOString()
      });
    }
  });

  it("keeps todo text that starts with front-end after a due time", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("待办添加 明天9点前端会议", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "前端会议",
        dueAt: new Date(2026, 5, 18, 9, 0, 0).toISOString()
      });
    }
  });

  it("routes todo add commands with weekday due times", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("待办添加 下周一9点团队会", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "团队会",
        dueAt: new Date(2026, 5, 22, 9, 0, 0).toISOString()
      });
    }
  });

  it("routes todo add commands with days-later due times", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("三天后下午4点提醒我寄快递", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "寄快递",
        dueAt: new Date(2026, 5, 20, 16, 0, 0).toISOString()
      });
    }
  });

  it("routes reminder wording to todo add with a due time", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("今天下午三点提醒我买牛奶", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "买牛奶",
        dueAt: new Date(2026, 5, 17, 15, 0, 0).toISOString()
      });
    }
  });

  it("routes call-me reminder wording to todo add with an absolute due time", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("下午三点叫我开会", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "开会",
        dueAt: new Date(2026, 5, 17, 15, 0, 0).toISOString()
      });
    }
  });

  it("routes relative-time reminder wording to todo add", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("十分钟后叫我喝水", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "喝水",
        dueAt: new Date(2026, 5, 17, 9, 10, 0).toISOString()
      });
    }
  });

  it("routes one-and-a-half minute reminder wording and ignores scenario suffixes", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("一分半以后叫我，场景1", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "叫我",
        dueAt: new Date(2026, 5, 17, 9, 1, 30).toISOString()
      });
    }
  });

  it("routes vague soon reminder wording to todo add", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("一会儿提醒我喝水", {
      ...context,
      currentTime: new Date(2026, 5, 17, 9, 0, 0).toISOString()
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.add_item");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_todo",
        text: "喝水",
        dueAt: new Date(2026, 5, 17, 9, 10, 0).toISOString()
      });
    }
  });

  it("routes todo completion commands to the existing todo widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("完成待办买牛奶", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.complete_item");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_todo", text: "买牛奶" });
    }
  });

  it("routes todo item deletion before generic widget removal when an item is named", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("删除待办买牛奶", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.complete_item");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_todo", text: "买牛奶" });
    }
  });

  it("routes todo completion shorthand when the item is named", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("把买牛奶勾掉", context);
    const itemWording = router.route("把买牛奶这项勾掉", context);

    expect(result.matched).toBe(true);
    expect(itemWording.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("todo.complete_item");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_todo", text: "买牛奶" });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (itemWording.matched) {
      expect(itemWording.toolCall.name).toBe("todo.complete_item");
      expect(itemWording.toolCall.arguments).toEqual({ widgetId: "wi_todo", text: "买牛奶" });
      expect(itemWording.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes clipboard save commands to add-and-save when clipboard is absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("保存到剪贴板账号是 demo", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "clipboard")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_clipboard",
        followUp: {
          name: "clipboard.add_text",
          arguments: { text: "账号是 demo" }
        }
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes clipboard copy wording to add-and-save when clipboard is absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("复制演示账号到剪贴板", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "clipboard")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_clipboard",
        followUp: {
          name: "clipboard.add_text",
          arguments: { text: "演示账号" }
        }
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes clipboard copy wording to add text", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("复制账号 demo 到剪贴板", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("clipboard.add_text");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_clipboard", text: "账号 demo" });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes pinned clipboard save wording to add pinned text", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("固定保存到剪贴板账号是 demo", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("clipboard.add_text");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_clipboard", text: "账号是 demo", pinned: true });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes pinned save shorthand to clipboard even without saying clipboard", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("固定保存项目口令 demo", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "clipboard")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_clipboard",
        followUp: {
          name: "clipboard.add_text",
          arguments: { text: "项目口令 demo", pinned: true }
        }
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes clipboard clear commands to clear history instead of closing the widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("清空剪贴板历史", context);
    const shorthand = router.route("清一下剪贴板", context);

    expect(result.matched).toBe(true);
    expect(shorthand.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("clipboard.clear");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_clipboard", includePinned: false });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (shorthand.matched) {
      expect(shorthand.toolCall.name).toBe("clipboard.clear");
      expect(shorthand.toolCall.arguments).toEqual({ widgetId: "wi_clipboard", includePinned: false });
      expect(shorthand.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes clipboard clear-all commands with pinned records included", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("把剪贴板全部清空，包含固定项", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("clipboard.clear");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_clipboard", includePinned: true });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes message board send commands to the existing message board", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("留言板发一句 M9 测试留言", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("messageBoard.send");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_messageBoard", text: "M9 测试留言" });
    }
  });

  it("routes casual message board announcement commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("给大家说一声今天下午三点开会", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("messageBoard.send");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_messageBoard", text: "今天下午三点开会" });
    }
  });

  it("routes close message board commands to widget removal instead of sending close text", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("关闭留言板", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("widget.remove");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_messageBoard" });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes message board send commands to add-and-send when message board is absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("给大家留言：今天继续测试小桌板", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "messageBoard")
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_messageBoard",
        followUp: {
          name: "messageBoard.send",
          arguments: { text: "今天继续测试小桌板" }
        }
      });
    }
  });

  it("routes translate draft commands to the translate widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("把你好翻译成英文", context);
    const absent = router.route("把 hello world 翻译成中文", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "translate")
    });

    expect(result.matched).toBe(true);
    expect(absent.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("translate.set_draft");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_translate", sourceText: "你好", targetLang: "en" });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (absent.matched) {
      expect(absent.toolCall.name).toBe("board.add_widget");
      expect(absent.toolCall.arguments).toEqual({
        definitionId: "wd_translate",
        followUp: {
          name: "translate.set_draft",
          arguments: { sourceText: "hello world", targetLang: "zh-CN" }
        }
      });
      expect(absent.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes casual translate commands with inferred target languages", () => {
    const router = createDefaultIntentShortcutRouter();
    const english = router.route("翻译一下 hello", context);
    const chinese = router.route("翻译一下 你好", context);

    expect(english.matched).toBe(true);
    expect(chinese.matched).toBe(true);
    if (english.matched) {
      expect(english.toolCall.name).toBe("translate.set_draft");
      expect(english.toolCall.arguments).toEqual({ widgetId: "wi_translate", sourceText: "hello", targetLang: "zh-CN" });
    }
    if (chinese.matched) {
      expect(chinese.toolCall.name).toBe("translate.set_draft");
      expect(chinese.toolCall.arguments).toEqual({ widgetId: "wi_translate", sourceText: "你好", targetLang: "en" });
    }
  });

  it("routes meaning question commands to Chinese translation", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("hello 是什么意思", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("translate.set_draft");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_translate", sourceText: "hello", targetLang: "zh-CN" });
    }
  });

  it("routes converter commands to the converter widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("12米换算成公里", context);
    const chinese = router.route("十二米换算公里", context);

    expect(result.matched).toBe(true);
    expect(chinese.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("converter.set");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_converter",
        category: "length",
        value: "12",
        fromUnit: "m",
        toUnit: "km"
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (chinese.matched) {
      expect(chinese.toolCall.name).toBe("converter.set");
      expect(chinese.toolCall.arguments).toEqual({
        widgetId: "wi_converter",
        category: "length",
        value: "12",
        fromUnit: "m",
        toUnit: "km"
      });
      expect(chinese.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes natural converter question commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("12公里是多少米", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("converter.set");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_converter",
        category: "length",
        value: "12",
        fromUnit: "km",
        toUnit: "m"
      });
    }
  });

  it("routes natural temperature converter commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("100华氏是多少摄氏", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("converter.set");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_converter",
        category: "temperature",
        value: "100",
        fromUnit: "f",
        toUnit: "c"
      });
    }
  });

  it("routes natural weight converter commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("5公斤等于多少磅", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("converter.set");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_converter",
        category: "weight",
        value: "5",
        fromUnit: "kg",
        toUnit: "lb"
      });
    }
  });

  it("routes everyday Chinese weight converter commands through supported base units", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("2斤是多少克", context);
    const twoKg = router.route("两公斤换算成克", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "converter")
    });

    expect(result.matched).toBe(true);
    expect(twoKg.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("converter.set");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_converter",
        category: "weight",
        value: "1",
        fromUnit: "kg",
        toUnit: "g"
      });
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (twoKg.matched) {
      expect(twoKg.toolCall.name).toBe("board.add_widget");
      expect(twoKg.toolCall.arguments).toEqual({
        definitionId: "wd_converter",
        followUp: {
          name: "converter.set",
          arguments: {
            category: "weight",
            value: "2",
            fromUnit: "kg",
            toUnit: "g"
          }
        }
      });
      expect(twoKg.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes arithmetic commands to the calculator widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("计算 12+30", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("calculator.set_display");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_calculator", display: "42" });
    }
  });

  it("routes natural Chinese arithmetic questions to the calculator widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const plus = router.route("12加30是多少", context);
    const chinesePlus = router.route("十二加三十算一下", {
      ...context,
      availableWidgets: context.availableWidgets?.filter((widget) => widget.type !== "calculator")
    });
    const multiply = router.route("12乘以8", context);

    expect(plus.matched).toBe(true);
    expect(chinesePlus.matched).toBe(true);
    expect(multiply.matched).toBe(true);
    if (plus.matched) {
      expect(plus.toolCall.name).toBe("calculator.set_display");
      expect(plus.toolCall.arguments).toEqual({ widgetId: "wi_calculator", display: "42" });
      expect(plus.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (chinesePlus.matched) {
      expect(chinesePlus.toolCall.name).toBe("board.add_widget");
      expect(chinesePlus.toolCall.arguments).toEqual({
        definitionId: "wd_calculator",
        followUp: {
          name: "calculator.set_display",
          arguments: { display: "42" }
        }
      });
      expect(chinesePlus.confidence).toBeGreaterThanOrEqual(0.9);
    }
    if (multiply.matched) {
      expect(multiply.toolCall.name).toBe("calculator.set_display");
      expect(multiply.toolCall.arguments).toEqual({ widgetId: "wi_calculator", display: "96" });
      expect(multiply.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("routes market index commands to the market widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("看标普和恒生行情", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("market.set_indices");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_market", indexCodes: ["usINX", "hkHSI"] });
    }
  });

  it("routes US major market shorthand commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("看美股三大指数", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("market.set_indices");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_market", indexCodes: ["usINX", "usNDX", "usDJI"] });
    }
  });

  it("routes broad US market commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("美股怎么样", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("market.set_indices");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_market", indexCodes: ["usINX", "usNDX", "usDJI"] });
    }
  });

  it("routes market commands when the user only names an index", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("道琼斯怎么样", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("market.set_indices");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_market", indexCodes: ["usDJI"] });
    }
  });

  it("routes China market shorthand commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("沪深行情", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("market.set_indices");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_market", indexCodes: ["sh000001", "sz399001"] });
    }
  });

  it("routes broad China market commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("A股行情", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("market.set_indices");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_market", indexCodes: ["sh000001", "sz399001"] });
    }
  });

  it("routes world clock zone commands to the world clock widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("世界时钟显示北京伦敦纽约", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("worldClock.set_zones");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_worldClock", zones: ["北京", "伦敦", "纽约"] });
    }
  });

  it("routes broader world clock city commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("看东京巴黎悉尼新加坡时间", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("worldClock.set_zones");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_worldClock", zones: ["东京", "巴黎", "悉尼", "新加坡"] });
    }
  });

  it("routes world clock city aliases", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("汉城和迪拜现在几点", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("worldClock.set_zones");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_worldClock", zones: ["首尔", "迪拜"] });
    }
  });

  it("routes English world clock aliases and time phrasing", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("NYC and Tokyo time", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("worldClock.set_zones");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_worldClock", zones: ["纽约", "东京"] });
    }
  });

  it("routes headline refresh commands to the headline widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("刷新新闻", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("headline.request_refresh");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_headline" });
    }
  });

  it("routes natural headline request commands to the headline widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("今天有什么新闻", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("headline.request_refresh");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_headline" });
    }
  });

  it("routes TV channel playback with fullscreen follow-up", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("播放 CCTV1，并全屏", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("tv.play");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_tv",
        channelName: "CCTV1",
        followUp: {
          name: "tv.fullscreen",
          arguments: {}
        }
      });
    }
  });

  it("routes TV channel switch commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("切到 CCTV13 新闻频道", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("tv.select_channel");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_tv",
        channelName: "CCTV13"
      });
    }
  });

  it("routes natural TV channel aliases to playback", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("看央视新闻", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("tv.play");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_tv",
        channelName: "CCTV13"
      });
    }
  });

  it("keeps generic TV channel aliases below the local shortcut threshold", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("电影频道打开", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("tv.play");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_tv",
        channelName: "CCTV6"
      });
      expect(result.confidence).toBeLessThan(0.9);
    }
  });

  it("routes Chinese-number TV channel aliases with fullscreen follow-up", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("央视五套全屏播放", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("tv.play");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_tv",
        channelName: "CCTV5",
        followUp: {
          name: "tv.fullscreen",
          arguments: {}
        }
      });
    }
  });

  it("routes TV fullscreen without a channel to the TV playback fullscreen capability", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("电视全屏", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("tv.fullscreen");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_tv" });
    }
  });

  it("does not locally block deferred game commands before model fallback", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("大富翁掷骰", context);

    expect(result).toEqual({ matched: false, reason: "no_shortcut_match" });
  });

  it("does not locally block AI form, dynamic widget, or long text requests", () => {
    const router = createDefaultIntentShortcutRouter();
    const aiForm = router.route("提交这个 AI 表单", context);
    const dynamicWidget = router.route("帮我生成一个新工具", context);
    const longText = router.route("帮我重写这篇长文", context);

    expect(aiForm).toEqual({ matched: false, reason: "no_shortcut_match" });
    expect(dynamicWidget).toEqual({ matched: false, reason: "no_shortcut_match" });
    expect(longText).toEqual({ matched: false, reason: "no_shortcut_match" });
  });

  it("routes open widget commands to focus when the widget exists", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("打开电视", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("widget.focus");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_tv" });
    }
  });

  it("routes open widget commands to add when only a definition exists", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("打开音乐", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({ definitionId: "wd_music" });
    }
  });

  it("routes broader open widget aliases", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("启动音乐播放器", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({ definitionId: "wd_music" });
    }
  });

  it("routes casual open widget intent and target aliases", () => {
    const router = createDefaultIntentShortcutRouter();
    const list = router.route("唤出清单", context);
    const music = router.route("调出播放器", context);
    const converter = router.route("开一下单位换算", context);

    expect(list.matched).toBe(true);
    expect(music.matched).toBe(true);
    expect(converter.matched).toBe(true);
    if (list.matched) {
      expect(list.toolCall.name).toBe("widget.focus");
      expect(list.toolCall.arguments).toEqual({ widgetId: "wi_todo" });
    }
    if (music.matched) {
      expect(music.toolCall.name).toBe("board.add_widget");
      expect(music.toolCall.arguments).toEqual({ definitionId: "wd_music" });
    }
    if (converter.matched) {
      expect(converter.toolCall.name).toBe("widget.focus");
      expect(converter.toolCall.arguments).toEqual({ widgetId: "wi_converter" });
    }
  });

  it("routes media controls to focused media widgets", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("暂停", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("tv.pause");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_tv" });
    }
  });

  it("keeps TV pause commands on playback control", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("暂停 CCTV1", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("tv.pause");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_tv", channelName: "CCTV1" });
    }
  });

  it("routes compact close music wording to widget removal", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("关音乐", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "正在播放",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("widget.remove");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
  });

  it("routes close widget target aliases to removal", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("关掉复制板", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("widget.remove");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_clipboard" });
    }
  });

  it("routes close weather wording to widget removal instead of weather query", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("关闭天气", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("widget.remove");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_weather" });
    }
  });

  it("does not remove the focused widget for ambiguous close wording", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("关一下", context);

    expect(result).toEqual({ matched: false, reason: "no_shortcut_match" });
  });

  it("routes close music commands to the existing music widget removal action", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("关闭音乐", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "正在播放",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("widget.remove");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
  });

  it("routes noisy spoken close music commands to widget removal", () => {
    const router = createDefaultIntentShortcutRouter();
    const contextWithMusic = {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "正在播放",
          recent: true
        }
      ]
    };
    const noisy = router.route("关闭，啊，这个，音乐", contextWithMusic);
    const collect = router.route("把音乐收了", contextWithMusic);
    const tuckedAway = router.route("音乐收起来", contextWithMusic);

    expect(noisy.matched).toBe(true);
    expect(collect.matched).toBe(true);
    expect(tuckedAway.matched).toBe(true);
    if (noisy.matched) {
      expect(noisy.toolCall.name).toBe("widget.remove");
      expect(noisy.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
    if (collect.matched) {
      expect(collect.toolCall.name).toBe("widget.remove");
      expect(collect.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
    if (tuckedAway.matched) {
      expect(tuckedAway.toolCall.name).toBe("widget.remove");
      expect(tuckedAway.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
  });

  it("routes pause music commands to the existing music widget pause action", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("暂停音乐", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "正在播放",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.pause");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
  });

  it("routes music search playback with a query", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("播放周杰伦音乐", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.play");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music", query: "周杰伦" });
    }
  });

  it("cleans artist possessive phrasing from spoken music playback queries", () => {
    const router = createDefaultIntentShortcutRouter();
    const contextWithMusic = {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐播放器",
          order: 6,
          summary: "idle",
          recent: true
        }
      ]
    };
    const result = router.route("播放王菲的你我经历的一刻", contextWithMusic);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.play");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music", query: "王菲 你我经历的一刻" });
    }
  });

  it("cleans casual music playback filler from query text", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("帮我放点轻松的音乐", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.play");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music", query: "轻松" });
    }
  });

  it("cleans casual music search filler and artist prefixes without crossing the local confidence threshold", () => {
    const router = createDefaultIntentShortcutRouter();
    const search = router.route("搜一点轻松的音乐", context);
    const play = router.route("来一首陈奕迅十年", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "",
          recent: true
        }
      ]
    });

    expect(search.matched).toBe(true);
    if (search.matched) {
      expect(search.toolCall.name).toBe("board.add_widget");
      expect(search.confidence).toBeLessThan(0.9);
      expect(search.toolCall.arguments).toEqual({
        definitionId: "wd_music",
        followUp: {
          name: "music.search",
          arguments: { query: "轻松" }
        }
      });
    }
    expect(play.matched).toBe(true);
    if (play.matched) {
      expect(play.toolCall.name).toBe("music.play");
      expect(play.confidence).toBeLessThan(0.9);
      expect(play.toolCall.arguments).toEqual({ widgetId: "wi_music", query: "陈奕迅 十年" });
    }
  });

  it("routes music search commands without playback", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("搜索周杰伦音乐", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_music",
        followUp: {
          name: "music.search",
          arguments: { query: "周杰伦" }
        }
      });
    }
  });

  it("keeps semantic info and media commands below the local confidence threshold", () => {
    const router = createDefaultIntentShortcutRouter();
    const contextWithDialClock: IntentShortcutContext = {
      ...context,
      availableDefinitions: [
        ...(context.availableDefinitions ?? []),
        { definitionId: "wd_dialClock", type: "dialClock", name: "表盘时钟" }
      ]
    };
    const cases = [
      { input: "刷新重大新闻", tool: "headline.request_refresh" },
      { input: "今天有什么头条新闻", tool: "headline.request_refresh" },
      { input: "看美股三大指数", tool: "market.set_indices" },
      { input: "打开恒生和上证行情", tool: "market.set_indices" },
      { input: "留言板发一句我在测试", tool: "messageBoard.send" },
      { input: "搜一点轻松的音乐", tool: "board.add_widget" }
    ];

    for (const item of cases) {
      const result = router.route(item.input, contextWithDialClock);
      expect(result.matched, item.input).toBe(true);
      if (result.matched) {
        expect(result.toolCall.name, item.input).toBe(item.tool);
        expect(result.confidence, item.input).toBeLessThan(0.9);
      }
    }

    const naturalPlay = router.route("播放王菲的红豆", contextWithDialClock);
    if (naturalPlay.matched) {
      expect(naturalPlay.confidence).toBeLessThan(0.9);
    }
  });

  it("routes implicit music search when the music widget is focused", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("搜索七里香", {
      ...context,
      focusedWidget: {
        widgetId: "wi_music",
        definitionId: "wd_music",
        type: "music",
        name: "音乐",
        order: 6,
        summary: "",
        focused: true
      },
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "",
          recent: true,
          focused: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.search");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music", query: "七里香" });
    }
  });

  it("routes music album playback with a result preference", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("播放周杰伦专辑第一首", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.play");
      expect(result.toolCall.arguments).toEqual({
        widgetId: "wi_music",
        query: "周杰伦",
        kind: "album",
        resultIndex: 0
      });
    }
  });

  it("routes music resume commands to resume instead of search playback", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("继续音乐", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.resume");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
  });

  it("routes next music commands to the music next action", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("下一首音乐", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.next");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
  });

  it("routes previous music commands to the music previous action", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("上一首", {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_music",
          definitionId: "wd_music",
          type: "music",
          name: "音乐",
          order: 6,
          summary: "",
          recent: true
        }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("music.previous");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_music" });
    }
  });

  it("routes recorder controls to existing recorder capability tools", () => {
    const router = createDefaultIntentShortcutRouter();
    const recorderContext: IntentShortcutContext = {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_recorder",
          definitionId: "wd_recorder",
          type: "recorder",
          name: "录音机",
          order: 12,
          summary: "没有录音",
          recent: true
        }
      ]
    };

    const cases = [
      ["开始录音", "recorder.start"],
      ["停止录音", "recorder.stop"],
      ["播放录音", "recorder.play"],
      ["暂停录音", "recorder.pause"],
      ["开始录制", "recorder.start"],
      ["播放录制", "recorder.play"],
      ["暂停录制", "recorder.pause"]
    ] as const;

    for (const [input, toolName] of cases) {
      const result = router.route(input, recorderContext);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.toolCall.name).toBe(toolName);
        expect(result.toolCall.arguments).toEqual({ widgetId: "wi_recorder" });
      }
    }
  });

  it("adds the recorder widget before starting recording when recorder is absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("开始录音", {
      ...context,
      availableDefinitions: [
        ...(context.availableDefinitions ?? []),
        { definitionId: "wd_recorder", type: "recorder", name: "录音机" }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_recorder",
        followUp: {
          name: "recorder.start",
          arguments: {}
        }
      });
    }
  });

  it("does not add an empty recorder for playback-only commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("播放录音", {
      ...context,
      availableDefinitions: [
        ...(context.availableDefinitions ?? []),
        { definitionId: "wd_recorder", type: "recorder", name: "录音机" }
      ]
    });

    expect(result).toEqual({ matched: false, reason: "no_shortcut_match" });
  });

  it("routes dial clock night mode without removing the widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const dialClockContext: IntentShortcutContext = {
      ...context,
      availableWidgets: [
        ...(context.availableWidgets ?? []),
        {
          widgetId: "wi_dialClock",
          definitionId: "wd_dialClock",
          type: "dialClock",
          name: "表盘时钟",
          order: 12,
          summary: "日间模式",
          recent: true
        }
      ]
    };

    const on = router.route("进入时钟夜间模式", dialClockContext);
    const off = router.route("关闭时钟夜间模式", dialClockContext);
    const lampOff = router.route("退出夜灯", dialClockContext);
    const darkOn = router.route("打开深色模式", dialClockContext);

    expect(on.matched).toBe(true);
    if (on.matched) {
      expect(on.toolCall.name).toBe("dialClock.set_night_mode");
      expect(on.toolCall.arguments).toEqual({ widgetId: "wi_dialClock", enabled: true });
    }
    expect(off.matched).toBe(true);
    if (off.matched) {
      expect(off.toolCall.name).toBe("dialClock.set_night_mode");
      expect(off.toolCall.arguments).toEqual({ widgetId: "wi_dialClock", enabled: false });
    }
    expect(lampOff.matched).toBe(true);
    if (lampOff.matched) {
      expect(lampOff.toolCall.name).toBe("dialClock.set_night_mode");
      expect(lampOff.toolCall.arguments).toEqual({ widgetId: "wi_dialClock", enabled: false });
    }
    expect(darkOn.matched).toBe(true);
    if (darkOn.matched) {
      expect(darkOn.toolCall.name).toBe("dialClock.set_night_mode");
      expect(darkOn.toolCall.arguments).toEqual({ widgetId: "wi_dialClock", enabled: true });
    }
  });

  it("adds the dial clock before entering night mode when absent", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("进入夜间模式", {
      ...context,
      availableDefinitions: [
        ...(context.availableDefinitions ?? []),
        { definitionId: "wd_dialClock", type: "dialClock", name: "表盘时钟" }
      ]
    });

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({
        definitionId: "wd_dialClock",
        followUp: {
          name: "dialClock.set_night_mode",
          arguments: { enabled: true }
        }
      });
    }
  });

  it("routes fullscreen to the focused widget", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("全屏", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("widget.fullscreen_focus");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_tv" });
    }
  });

  it("falls back when no deterministic shortcut matches", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("帮我分析一下今天应该做什么", context);

    expect(result).toEqual({ matched: false, reason: "no_shortcut_match" });
  });
});

describe("WidgetTargetResolver", () => {
  const widgets: CompactWidgetSummary[] = [
    {
      widgetId: "wi_note_old",
      definitionId: "wd_note",
      type: "note",
      name: "便签",
      order: 1,
      summary: "旧便签"
    },
    {
      widgetId: "wi_tv",
      definitionId: "wd_tv",
      type: "tv",
      name: "电视",
      order: 2,
      summary: "CCTV1",
      recent: true
    },
    {
      widgetId: "wi_countdown_first",
      definitionId: "wd_countdown",
      type: "countdown",
      name: "倒计时",
      order: 3,
      summary: "10 分钟"
    },
    {
      widgetId: "wi_countdown_second",
      definitionId: "wd_countdown",
      type: "countdown",
      name: "倒计时",
      order: 4,
      summary: "25 分钟"
    },
    {
      widgetId: "wi_note_recent",
      definitionId: "wd_note",
      type: "note",
      name: "便签",
      order: 5,
      summary: "明早九点开会",
      recent: true
    }
  ];

  it("resolves that tv by type and recent reference", () => {
    const resolver = new WidgetTargetResolver();
    const result = resolver.resolve("那个电视", { widgets, recentWidgetIds: ["wi_tv", "wi_note_recent"] });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.target.widgetId).toBe("wi_tv");
      expect(result.target.reason).toBe("matched_by_recent");
    }
  });

  it("resolves the recent note", () => {
    const resolver = new WidgetTargetResolver();
    const result = resolver.resolve("最近的便签", { widgets, recentWidgetIds: ["wi_note_recent"] });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.target.widgetId).toBe("wi_note_recent");
    }
  });

  it("resolves the first countdown by board order", () => {
    const resolver = new WidgetTargetResolver();
    const result = resolver.resolve("第一个倒计时", { widgets });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.target.widgetId).toBe("wi_countdown_first");
      expect(result.target.reason).toBe("matched_by_order");
    }
  });

  it("resolves by content summary text", () => {
    const resolver = new WidgetTargetResolver();
    const result = resolver.resolve("明早九点开会", { widgets });

    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.target.widgetId).toBe("wi_note_recent");
      expect(result.target.reason).toBe("matched_by_text");
    }
  });

  it("asks for clarification for ambiguous bare references", () => {
    const resolver = new WidgetTargetResolver();
    const result = resolver.resolve("那个", { widgets: widgets.map((widget) => ({ ...widget, recent: false })) });

    expect(result.status).toBe("needs_clarification");
    if (result.status === "needs_clarification") {
      expect(result.candidates.length).toBeGreaterThan(1);
      expect(result.message).toContain("哪一个");
    }
  });

  it("asks for clarification when multiple widgets of a type match", () => {
    const resolver = new WidgetTargetResolver();
    const result = resolver.resolve("倒计时", { widgets });

    expect(result.status).toBe("needs_clarification");
    if (result.status === "needs_clarification") {
      expect(result.candidates.map((candidate) => candidate.widgetId)).toEqual([
        "wi_countdown_first",
        "wi_countdown_second"
      ]);
    }
  });

  it("returns not_found when the board has no widgets", () => {
    const resolver = new WidgetTargetResolver();
    const result = resolver.resolve("那个电视", { widgets: [] });

    expect(result).toMatchObject({
      status: "not_found"
    });
  });
});

describe("ToolScopeManager", () => {
  const noopSchema = createPassthroughSchema<Record<string, never>>();
  const tools: AssistantToolSpec[] = [
    {
      name: "board.add_widget",
      description: "Add widget",
      parameters: noopSchema,
      scope: "desktop"
    },
    {
      name: "widget.resolve_target",
      description: "Resolve target",
      parameters: noopSchema,
      scope: "widget-selection"
    },
    {
      name: "tv.play",
      description: "Play TV",
      parameters: noopSchema,
      scope: "widget-detail",
      widgetType: "tv"
    },
    {
      name: "note.append",
      description: "Append note",
      parameters: noopSchema,
      scope: "widget-detail",
      widgetType: "note"
    },
    {
      name: "gomoku.play",
      description: "Deferred game action",
      parameters: noopSchema,
      scope: "deferred",
      widgetType: "gomoku"
    },
    {
      name: "widget.generate",
      description: "Deferred dynamic generation",
      parameters: noopSchema,
      scope: "deferred"
    }
  ];

  it("exposes only desktop and selection tools initially", () => {
    const manager = new ToolScopeManager(tools);

    expect(manager.getInitialTools().map((tool) => tool.name)).toEqual(["board.add_widget", "widget.resolve_target"]);
  });

  it("loads only the selected widget type detail tools", () => {
    const manager = new ToolScopeManager(tools);

    expect(manager.getWidgetDetailTools("tv").map((tool) => tool.name)).toEqual([
      "board.add_widget",
      "widget.resolve_target",
      "tv.play"
    ]);
  });

  it("loads detail tools for all mounted widget types", () => {
    const manager = new ToolScopeManager(tools);

    expect(manager.getMountedWidgetDetailTools(["note", "tv"]).map((tool) => tool.name)).toEqual([
      "board.add_widget",
      "widget.resolve_target",
      "tv.play",
      "note.append"
    ]);
  });

  it("loads every non-deferred tool for realtime selection", () => {
    const manager = new ToolScopeManager(tools);

    expect(manager.getActiveTools().map((tool) => tool.name)).toEqual([
      "board.add_widget",
      "widget.resolve_target",
      "tv.play",
      "note.append"
    ]);
  });

  it("does not expose deferred tools through active scopes", () => {
    const manager = new ToolScopeManager(tools);

    expect(manager.getWidgetDetailTools("gomoku").map((tool) => tool.name)).toEqual([
      "board.add_widget",
      "widget.resolve_target"
    ]);
    expect(manager.getDeferredTools().map((tool) => tool.name)).toEqual(["gomoku.play", "widget.generate"]);
  });
});

describe("ContextSummarizer", () => {
  it("summarizes board state without full widget payloads", () => {
    const summarizer = new ContextSummarizer();
    const longNote = "这是一段很长很长的便签内容，用来确认摘要不会把完整正文塞进 Realtime 上下文里面。";
    const clipboardItems = Array.from({ length: 20 }, (_, index) => ({
      id: `clip_${index}`,
      text: `secret-full-clipboard-payload-${index}`
    }));
    const result = summarizer.summarize({
      boardId: "board_1",
      boardName: "我的桌板",
      focusedWidgetId: "wi_note",
      recentWidgetIds: ["wi_clipboard"],
      availableDefinitions: [
        { definitionId: "wd_note", type: "note", name: "便签" },
        { definitionId: "wd_music", type: "music", name: "音乐" }
      ],
      pendingConfirmation: {
        id: "confirm_1",
        actionName: "widget.remove",
        arguments: { widgetId: "wi_note" },
        message: "删除便签？",
        createdAt: "2026-06-16T00:00:00.000Z"
      },
      widgets: [
        {
          widgetId: "wi_note",
          definitionId: "wd_note",
          type: "note",
          name: "便签",
          order: 2,
          state: {
            content: longNote,
            privateDraft: "this should not leak"
          }
        },
        {
          widgetId: "wi_clipboard",
          definitionId: "wd_clipboard",
          type: "clipboard",
          name: "剪贴板",
          order: 1,
          state: {
            items: clipboardItems
          }
        }
      ]
    });

	    const serialized = JSON.stringify(result);
	    expect(result.contextVersion).toMatch(/^ctx_/);
	    expect(result.availableDefinitions).toEqual([
      { definitionId: "wd_note", type: "note", name: "便签" },
      { definitionId: "wd_music", type: "music", name: "音乐" }
    ]);
    expect(result.widgetCountsByType).toEqual({ note: 1, clipboard: 1 });
    expect(result.focusedWidget?.widgetId).toBe("wi_note");
    expect(result.pendingConfirmation).toEqual({
      id: "confirm_1",
      actionName: "widget.remove",
      message: "删除便签？"
    });
    expect(serialized).not.toContain(longNote);
    expect(serialized).not.toContain("this should not leak");
    expect(serialized).not.toContain("secret-full-clipboard-payload");
    expect(result.widgets.find((widget) => widget.widgetId === "wi_clipboard")?.summary).toBe("20 条剪贴板记录");
  });

	  it("limits the number of summarized widgets and orders focused/recent first", () => {
    const summarizer = new ContextSummarizer();
    const result = summarizer.summarize({
      focusedWidgetId: "wi_3",
      recentWidgetIds: ["wi_2"],
      maxWidgets: 2,
      widgets: [
        { widgetId: "wi_1", definitionId: "wd_note", type: "note", name: "便签", order: 1, summary: "one" },
        { widgetId: "wi_2", definitionId: "wd_tv", type: "tv", name: "电视", order: 2, summary: "two" },
        { widgetId: "wi_3", definitionId: "wd_weather", type: "weather", name: "天气", order: 3, summary: "three" }
      ]
    });

    expect(result.widgets.map((widget) => widget.widgetId)).toEqual(["wi_3", "wi_2"]);
    expect(result.focusedWidget?.focused).toBe(true);
	    expect(result.widgets[1].recent).toBe(true);
	  });

	  it("changes context version when compact state changes", () => {
	    const summarizer = new ContextSummarizer();
	    const base = summarizer.summarize({
	      boardId: "board_1",
	      boardName: "我的桌板",
	      widgets: [{ widgetId: "wi_1", definitionId: "wd_note", type: "note", name: "便签", order: 1, summary: "one" }]
	    });
	    const same = summarizer.summarize({
	      boardId: "board_1",
	      boardName: "我的桌板",
	      widgets: [{ widgetId: "wi_1", definitionId: "wd_note", type: "note", name: "便签", order: 1, summary: "one" }]
	    });
	    const changed = summarizer.summarize({
	      boardId: "board_1",
	      boardName: "我的桌板",
	      widgets: [{ widgetId: "wi_1", definitionId: "wd_note", type: "note", name: "便签", order: 1, summary: "two" }]
	    });

	    expect(base.contextVersion).toBe(same.contextVersion);
	    expect(changed.contextVersion).not.toBe(base.contextVersion);
	  });
	});

describe("Strict schemas, preview gate, executor, budget, outbox, learning, and module review", () => {
  function createPlan(commands: CommandPlan["commands"]): CommandPlan {
    return {
      id: "plan_test",
      sourceText: "test",
      normalizedText: "test",
      commands,
      dependencies: [],
      executionGroups: [{ id: "group_1", mode: "parallel", commandIds: commands.map((command) => command.id) }],
      confidence: 0.9,
      needsConfirmation: commands.some((command) => command.risk !== "safe"),
      createdBy: "realtime-2",
      requiresHarnessValidation: true
    };
  }

  it("rejects extra fields with strict action schemas", () => {
    const schema = createStrictObjectSchema({ widgetId: { type: "string", required: true } });
    const parsed = schema.safeParse({ widgetId: "w1", query: "should-not-pass" });

    expect(parsed.success).toBe(false);
  });

  it("creates a preview for destructive or confirmation-required plans", () => {
    const plan = createPlan([
      {
        id: "clear",
        module: "clipboard",
        tool: "clipboard.clear",
        args: { widgetId: "clip_1" },
        risk: "destructive",
        confidence: 0.93,
        source: "realtime",
        requiresHarnessValidation: true
      }
    ]);

    const preview = createPlanPreview(plan);

    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.commands[0]).toMatchObject({ module: "clipboard", tool: "clipboard.clear", reversible: false });
  });

  it("executes independent commands in parallel and skips failed dependencies", async () => {
    const started: string[] = [];
    const executor = new CommandExecutor({
      async execute(call) {
        started.push(call.name);
        if (call.name === "weather.set_city") {
          return { status: "failed", message: "weather failed" };
        }
        return { status: "success", message: "ok" };
      }
    });
    const plan: CommandPlan = {
      ...createPlan([
        {
          id: "weather",
          module: "weather",
          tool: "weather.set_city",
          args: { widgetId: "w_weather", city: "北京" },
          risk: "safe",
          confidence: 0.9,
          source: "realtime",
          requiresHarnessValidation: true
        },
        {
          id: "headline",
          module: "headline",
          tool: "headline.request_refresh",
          args: { widgetId: "w_headline" },
          risk: "safe",
          confidence: 0.9,
          source: "realtime",
          requiresHarnessValidation: true
        },
        {
          id: "weather_dep",
          module: "weather",
          tool: "weather.set_city",
          args: { widgetId: "w_weather", city: "上海" },
          risk: "safe",
          confidence: 0.9,
          dependsOn: ["weather"],
          source: "realtime",
          requiresHarnessValidation: true
        }
      ]),
      executionGroups: [
        { id: "group_1", mode: "parallel", commandIds: ["weather", "headline"] },
        { id: "group_2", mode: "sequential", commandIds: ["weather_dep"] }
      ]
    };

    const result = await executor.execute(plan);

    expect(started).toEqual(["weather.set_city", "headline.request_refresh"]);
    expect(result.records.find((record) => record.command.id === "weather_dep")?.phase).toBe("skipped");
    expect(result.status).toBe("failed");
  });

  it("serializes parallel commands that share a concurrency key", async () => {
    const events: string[] = [];
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const executor = new CommandExecutor({
      getConcurrencyKey(command) {
        return command.module === "music" ? "music" : command.module;
      },
      async execute(call) {
        events.push(`start:${call.id}`);
        await delay(call.id === "music_1" ? 10 : 1);
        events.push(`finish:${call.id}`);
        return { status: "success", message: "ok" };
      }
    });
    const plan: CommandPlan = {
      ...createPlan([
        {
          id: "music_1",
          module: "music",
          tool: "music.play",
          args: { widgetId: "w_music", query: "a" },
          risk: "safe",
          confidence: 0.9,
          source: "realtime",
          requiresHarnessValidation: true
        },
        {
          id: "music_2",
          module: "music",
          tool: "music.next",
          args: { widgetId: "w_music" },
          risk: "safe",
          confidence: 0.9,
          source: "realtime",
          requiresHarnessValidation: true
        },
        {
          id: "weather_1",
          module: "weather",
          tool: "weather.set_city",
          args: { widgetId: "w_weather", city: "北京" },
          risk: "safe",
          confidence: 0.9,
          source: "realtime",
          requiresHarnessValidation: true
        }
      ]),
      executionGroups: [{ id: "group_1", mode: "parallel", commandIds: ["music_1", "music_2", "weather_1"] }]
    };

    await executor.execute(plan);

    expect(events.indexOf("start:music_2")).toBeGreaterThan(events.indexOf("finish:music_1"));
    expect(events.indexOf("start:weather_1")).toBeLessThan(events.indexOf("finish:music_1"));
  });

  it("tracks low-cost runtime soft and hard limits", () => {
    const controller = new RealtimeRuntimeController({
      dailyBudgetUsd: 1,
      softLimitUsd: 0.8,
      hardLimitUsd: 1,
      commandWindowIdleMs: 10_000,
      dialogueIdleMs: 30_000,
      maxSingleCommandSessionMs: 60_000,
      maxDialogueSessionMs: 300_000,
      assistantAudioDailyLimitSeconds: 300
    });

    expect(controller.requestRealtime("wake").allowed).toBe(true);
    controller.recordRealtimeUsage({ userAudioSeconds: 2500, assistantAudioSeconds: 0 });
    expect(controller.mode).toBe("saving_mode");
    controller.recordRealtimeUsage({ userAudioSeconds: 800, assistantAudioSeconds: 0 });
    expect(controller.requestRealtime("wake")).toMatchObject({ allowed: false, mode: "hard_limited" });
  });

  it("keeps 24 hour local standby free of realtime sessions and cost", () => {
    const controller = new RealtimeRuntimeController();

    controller.standbyElapsed(24 * 60 * 60 * 1000);
    controller.recordLocalHit();

    expect(controller.mode).toBe("local_standby");
    expect(controller.metrics).toMatchObject({
      realtimeSessionCount: 0,
      realtimeActiveMs: 0,
      estimatedCostUsd: 0,
      localHitCount: 1
    });
  });

  it("moves through wake, command, dialogue, cooldown, and manual hard-limit override states", () => {
    const controller = new RealtimeRuntimeController({
      dailyBudgetUsd: 0.01,
      softLimitUsd: 0.005,
      hardLimitUsd: 0.01,
      commandWindowIdleMs: 10,
      dialogueIdleMs: 20,
      cooldownMs: 5,
      maxSingleCommandSessionMs: 60_000,
      maxDialogueSessionMs: 300_000,
      assistantAudioDailyLimitSeconds: 300
    });

    expect(controller.detectLocalWake()).toBe("local_wake_detected");
    expect(controller.requestRealtime("wake")).toMatchObject({ allowed: true, mode: "realtime_command_window" });
    expect(controller.idleElapsed(10)).toBe("local_standby");
    expect(controller.requestRealtime("manual")).toMatchObject({ allowed: true, mode: "realtime_dialogue_window" });
    expect(controller.idleElapsed(20)).toBe("realtime_cooldown");
    expect(controller.idleElapsed(5)).toBe("local_standby");
    controller.recordRealtimeUsage({ userAudioSeconds: 40 });
    expect(controller.requestRealtime("wake")).toMatchObject({ allowed: false, mode: "hard_limited" });
    expect(controller.requestRealtime("manual")).toMatchObject({
      allowed: true,
      mode: "realtime_dialogue_window",
      reason: "manual_override_allowed"
    });
  });

  it("keeps failed cloud writes in the outbox for retry", async () => {
    const outbox = new MutationOutbox(undefined, { maxRetries: 2 }, () => "2026-06-17T00:00:00.000Z");
    await outbox.enqueue({ type: "widget.upsert", payload: { widgetId: "w1" }, operationId: "op1" });
    const remaining = await outbox.retry({
      sync() {
        throw new Error("network down");
      }
    });

    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ status: "failed", retryCount: 1, operationId: "op1" });
    expect(await outbox.pendingCount()).toBe(1);
  });

  it("stores confirmed learned shortcuts without overwriting conflicts and respects rejection", async () => {
    const store = new LearnedCommandStore();
    const candidate = {
      id: "learn1",
      type: "shortcut_alias" as const,
      module: "music",
      rawText: "把音乐收了",
      normalizedText: "音乐 收",
      intent: "widget.remove",
      tool: "widget.remove",
      args: { widgetId: "music1" },
      risk: "safe" as const,
      confidence: 0.92,
      source: "realtime-success" as const,
      status: "candidate" as const,
      createdAt: "2026-06-17T00:00:00.000Z"
    };

    await store.addCandidate(candidate);
    await store.confirm("learn1");

    expect(await store.match("音乐 收")).toMatchObject({ tool: "widget.remove", status: "confirmed" });
    await expect(store.addCandidate({ ...candidate, id: "learn2", tool: "music.pause" })).rejects.toThrow("冲突");
    await store.reject("learn1");
    expect(await store.match("音乐 收")).toBeNull();
  });

  it("does not create learning candidates for sensitive arguments", () => {
    const plan = createPlan([
      {
        id: "note",
        module: "note",
        tool: "note.write",
        args: { content: "password=abc123" },
        risk: "safe",
        confidence: 0.95,
        source: "realtime",
        requiresHarnessValidation: true
      }
    ]);

    expect(
      createLearningCandidate({
        rawText: "记住 password=abc123",
        normalizedText: "记住 password abc123",
        plan,
        call: { id: "note", name: "note.write", arguments: { content: "password=abc123" }, source: "realtime" },
        result: { status: "success", message: "ok" }
      })
    ).toBeNull();
  });

  it("reviews AI generated modules before install", () => {
    const registry = new WidgetAssistantRegistry();
    const schema = createStrictObjectSchema({});
    registry.register({
      type: "music",
      definition: { id: "music", type: "music", name: "音乐" },
      aliases: ["音乐"],
      shortcuts: [],
      tools: [
        {
          spec: { name: "music.pause", description: "pause", parameters: schema, resultSchema: {}, examples: ["暂停音乐", "停一下", "别放了"] },
          execute: () => ({ status: "success", message: "ok" })
        }
      ],
      context: { maxRealtimeContextTokens: 100, getScopedContext: () => ({ moduleType: "music", tools: [], toolSchemas: {}, instances: [], stateSummary: {}, shortcutExamples: [], executionPolicy: { defaultMode: "sequential" }, riskPolicy: { safe: [], confirm: [], destructive: [] } }), redactContext: (context) => context },
      realtime: { exposeCatalog: () => ({ type: "music", displayName: "音乐", aliases: ["音乐"], capabilities: [], shortcutExamples: [], riskSummary: [] }), getScopedContext: () => ({ moduleType: "music", tools: [], toolSchemas: {}, instances: [], stateSummary: {}, shortcutExamples: [], executionPolicy: { defaultMode: "sequential" }, riskPolicy: { safe: [], confirm: [], destructive: [] } }) },
      executionPolicy: { defaultMode: "sequential" }
    });

    const preview = reviewAiGeneratedModule(
      {
        type: "newTool",
        displayName: "New Tool",
        aliases: ["音乐"],
        shortcuts: [],
        tools: [{ name: "music.pause", description: "conflict", argsSchema: {}, risk: "safe" }],
        logicSpec: { kind: "eval" }
      },
      registry
    );

    expect(preview.canInstall).toBe(false);
    expect(preview.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["TOOL_CONFLICT", "TOOL_SCOPE_INVALID", "ALIAS_CONFLICT", "UNSAFE_LOGIC", "SCHEMA_ALLOWS_EXTRA_FIELDS"])
    );
  });

  it("parses AI generated module manifests with a strict manifest shape", () => {
    expect(parseAiGeneratedModuleManifest("not-json").success).toBe(false);
    expect(
      parseAiGeneratedModuleManifest({
        type: "focusTimer",
        displayName: "专注计时",
        aliases: ["专注计时"],
        shortcuts: [{ id: "focus.start", intent: "start", examples: ["开始专注"], risk: "safe" }],
        tools: [
          {
            name: "focusTimer.start",
            description: "start focus timer",
            argsSchema: { type: "object", additionalProperties: false, required: [], properties: {} },
            risk: "safe"
          }
        ],
        logicSpec: { kind: "static" }
      }).success
    ).toBe(true);
    expect(
      parseAiGeneratedModuleManifest({
        type: "bad",
        displayName: "bad",
        aliases: ["bad"],
        shortcuts: [],
        tools: [{ name: "bad.run", description: "run", argsSchema: {}, risk: "safe", sourceCode: "console.log(1)" }]
      }).success
    ).toBe(false);
  });

  it("requires review, sandbox, and user confirmation before installing an AI generated module", () => {
    const registry = new WidgetAssistantRegistry();
    const manifest = {
      type: "focusTimer",
      displayName: "专注计时",
      aliases: ["专注计时"],
      shortcuts: [{ id: "focus.start", intent: "start", examples: ["开始专注"], risk: "safe" as const }],
      tools: [
        {
          name: "focusTimer.start",
          description: "start focus timer",
          argsSchema: {
            type: "object",
            additionalProperties: false,
            required: ["minutes"],
            properties: { minutes: { type: "number" } }
          },
          risk: "safe" as const
        }
      ],
      logicSpec: { kind: "static" }
    };
    const moduleSchema = createStrictObjectSchema({ minutes: { type: "number", required: true } });
    const module = {
      type: "focusTimer",
      definition: { id: "focusTimer", type: "focusTimer", name: "专注计时" },
      aliases: manifest.aliases,
      shortcuts: manifest.shortcuts,
      tools: [
        {
          spec: {
            name: "focusTimer.start",
            description: "start focus timer",
            parameters: moduleSchema,
            argumentKeys: moduleSchema.argumentKeys,
            resultSchema: {},
            examples: ["开始专注"]
          },
          execute: () => ({ status: "success" as const, message: "ok" })
        }
      ],
      context: {
        maxRealtimeContextTokens: 120,
        getScopedContext: () => ({
          moduleType: "focusTimer",
          tools: [],
          toolSchemas: {},
          instances: [],
          stateSummary: {},
          shortcutExamples: ["开始专注"],
          executionPolicy: { defaultMode: "sequential" as const },
          riskPolicy: { safe: ["focusTimer.start"], confirm: [], destructive: [] }
        }),
        redactContext: (context: RealtimeScopedModuleContext) => context
      },
      realtime: {
        exposeCatalog: () => ({
          type: "focusTimer",
          displayName: "专注计时",
          aliases: ["专注计时"],
          capabilities: ["开始专注计时"],
          shortcutExamples: ["开始专注"],
          riskSummary: []
        }),
        getScopedContext: () => ({
          moduleType: "focusTimer",
          tools: [],
          toolSchemas: {},
          instances: [],
          stateSummary: {},
          shortcutExamples: ["开始专注"],
          executionPolicy: { defaultMode: "sequential" as const },
          riskPolicy: { safe: ["focusTimer.start"], confirm: [], destructive: [] }
        })
      },
      executionPolicy: { defaultMode: "sequential" as const }
    };

    const session = createAiModuleInstallSession(manifest, registry);

    expect(session.canRequestConfirmation).toBe(true);
    expect(installReviewedModule(session.preview, module, registry, false, { sandbox: session.sandbox })).toBe(false);
    expect(registry.getRealtimeCatalog()).toEqual([]);
    expect(installReviewedModule(session.preview, module, registry, true, { sandbox: { passed: false, results: [] } })).toBe(false);
    expect(installReviewedModule(session.preview, module, registry, true, { sandbox: session.sandbox })).toBe(true);
    expect(registry.getRealtimeCatalog()).toEqual([
      expect.objectContaining({ type: "focusTimer", aliases: ["专注计时"] })
    ]);
    expect(registry.listShortcuts()).toEqual([expect.objectContaining({ id: "focus.start" })]);
    expect(registry.disable("focusTimer")).toBe(true);
    expect(registry.getRealtimeCatalog()).toEqual([]);
    expect(registry.listShortcuts()).toEqual([]);
    expect(registry.unregister("focusTimer")).toBe(true);
    expect(registry.list({ includeDisabled: true })).toEqual([]);
  });

  it("blocks AI module install when sandbox catches schemas that allow extra fields", () => {
    const registry = new WidgetAssistantRegistry();
    const manifest = {
      type: "looseTool",
      displayName: "Loose Tool",
      aliases: ["loose"],
      shortcuts: [],
      tools: [{ name: "looseTool.run", description: "run", argsSchema: { type: "object", properties: {} }, risk: "safe" as const }],
      logicSpec: { kind: "static" }
    };

    const session = createAiModuleInstallSession(manifest, registry);

    expect(session.preview.canInstall).toBe(false);
    expect(session.canRequestConfirmation).toBe(false);
    expect(session.preview.issues.map((issue) => issue.code)).toContain("SCHEMA_ALLOWS_EXTRA_FIELDS");
  });

  it("reports module static completeness gaps", () => {
    const registry = new WidgetAssistantRegistry();
    const schema = createStrictObjectSchema({});
    const module = {
      type: "weather",
      definition: { id: "weather", type: "weather", name: "天气" },
      aliases: ["天气"],
      shortcuts: [{ id: "weather.query", intent: "query", examples: ["北京天气"], risk: "safe" as const }],
      tools: [
        {
          spec: {
            name: "weather.set_city",
            description: "set city",
            parameters: schema,
            argumentKeys: schema.argumentKeys,
            resultSchema: {},
            examples: ["北京天气", "上海天气", "查天气"]
          },
          execute: () => ({ status: "success" as const, message: "ok" })
        }
      ],
      actionSpecs: [
        {
          name: "weather.set_city",
          intent: "query_weather",
          description: "set city",
          argsSchema: schema.jsonSchema,
          resultSchema: {},
          risk: "safe" as const,
          idempotency: "stateful" as const,
          missingArgPolicy: "ask" as const,
          examples: ["北京天气", "上海天气", "查天气"]
        }
      ],
      context: {
        maxRealtimeContextTokens: 100,
        getScopedContext: () => ({ moduleType: "weather", tools: [], toolSchemas: {}, instances: [], stateSummary: {}, shortcutExamples: [], executionPolicy: { defaultMode: "latest-wins" as const }, riskPolicy: { safe: [], confirm: [], destructive: [] } }),
        redactContext: (context: RealtimeScopedModuleContext) => context
      },
      realtime: {
        exposeCatalog: () => ({ type: "weather", displayName: "天气", aliases: ["天气"], capabilities: ["查询"], shortcutExamples: ["北京天气"], riskSummary: [] }),
        getScopedContext: () => ({ moduleType: "weather", tools: [], toolSchemas: {}, instances: [], stateSummary: {}, shortcutExamples: [], executionPolicy: { defaultMode: "latest-wins" as const }, riskPolicy: { safe: [], confirm: [], destructive: [] } })
      },
      executionPolicy: { defaultMode: "latest-wins" as const }
    };
    registry.register(module);

    const report = runWidgetModuleStaticChecks(registry, module, [
      { id: "weather-1", input: "北京天气", expected: { module: "weather", tool: "weather.set_city" } }
    ]);

    expect(report.ok).toBe(true);
    expect(report.uncoveredActions).toEqual([]);
    expect(report.scopedContextFields).toContain("stateSummary");
  });

  it("exposes shared command policy rules for runtime recovery and semantic contracts", () => {
    expect(commandPolicyManifest.version).toBe("command_policy_v1");
    expect(isNonActionModelTool("assistant.runtime_diagnostics")).toBe(true);
    expect(isNonActionModelTool("widget.remove")).toBe(false);
    expect(getNonActionModelTools()).toContain("assistant.reply");
    expect(commandPolicyManifest.recoverableNonActionRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "recover-auto-align-after-diagnostics",
          tools: ["board.auto_align"]
        })
      ])
    );
    expect(commandPolicyManifest.semanticContractRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "close-message-board-forbids-send",
          kind: "forbid",
          tools: ["messageBoard.send"]
        })
      ])
    );
  });
});
