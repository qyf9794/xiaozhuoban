import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  AssistantRegistryError,
  createDefaultIntentShortcutRouter,
  createPassthroughSchema,
  type AssistantParameterSchema,
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
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_weather", cityName: "上海" });
    }
  });

  it("routes countdown duration commands", () => {
    const router = createDefaultIntentShortcutRouter();
    const result = router.route("十分钟倒计时", context);

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.toolCall.name).toBe("countdown.set_duration");
      expect(result.toolCall.arguments).toEqual({ widgetId: "wi_countdown", durationSeconds: 600, start: true });
    }
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
