import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  AssistantRegistryError,
  createDefaultIntentShortcutRouter,
  createPassthroughSchema,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  type AssistantParameterSchema,
  type AssistantToolSpec,
  type CompactWidgetSummary,
  type IntentShortcutContext
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

describe("IntentShortcutRouter", () => {
  const context: IntentShortcutContext = {
    source: "shortcut",
    availableDefinitions: [
      { definitionId: "wd_weather", type: "weather", name: "天气" },
      { definitionId: "wd_countdown", type: "countdown", name: "倒计时" },
      { definitionId: "wd_note", type: "note", name: "便签" }
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
      expect(result.confidence).toBeGreaterThan(0.8);
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

  it("routes countdown duration commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("十分钟倒计时", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("countdown.set");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_countdown", totalSeconds: 600, start: true });
    }
  });

  it("routes deferred game commands to a local out-of-scope result", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("大富翁掷骰", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("assistant.out_of_scope");
      expect(result.toolCall.arguments).toMatchObject({ category: "deferred_widget", targetType: "monopoly" });
    }
  });

  it("routes AI form, dynamic widget, and long text requests out of scope", () => {
    const router = createDefaultIntentShortcutRouter();
    const aiForm = router.route("提交这个 AI 表单", context);
    const dynamicWidget = router.route("帮我生成一个新工具", context);
    const longText = router.route("帮我重写这篇长文", context);

    expect(aiForm.matched && aiForm.toolCall.name).toBe("assistant.out_of_scope");
    expect(dynamicWidget.matched && dynamicWidget.toolCall.name).toBe("assistant.out_of_scope");
    expect(longText.matched && longText.toolCall.name).toBe("assistant.out_of_scope");
    if (aiForm.matched) expect(aiForm.toolCall.arguments).toMatchObject({ category: "ai_form" });
    if (dynamicWidget.matched) expect(dynamicWidget.toolCall.arguments).toMatchObject({ category: "dynamic_widget_generation" });
    if (longText.matched) expect(longText.toolCall.arguments).toMatchObject({ category: "long_text_rewrite" });
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
    const result = router.route("打开便签", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("board.add_widget");
      expect(result.toolCall.arguments).toEqual({ definitionId: "wd_note" });
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
});
