import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  createDefaultIntentShortcutRouter,
  createPassthroughSchema,
  type AssistantToolCall,
  type AssistantToolResult,
  type AssistantToolSpec,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";
import { AssistantHarness, type AssistantAuditEvent, type AssistantRealtimeAdapter } from "./AssistantHarness";

function createTools(): AssistantToolSpec[] {
  const schema = createPassthroughSchema<Record<string, unknown>>();
  return [
    { name: "board.auto_align", description: "整理", parameters: schema, scope: "desktop", risk: "confirm" },
    { name: "widget.focus", description: "聚焦", parameters: schema, scope: "desktop" },
    { name: "widget.remove", description: "删除", parameters: schema, scope: "desktop", risk: "destructive" },
    {
      name: "note.append",
      description: "追加便签",
      parameters: schema,
      scope: "widget-detail",
      widgetType: "note",
      requiresTarget: true
    },
    { name: "tv.play", description: "播放电视", parameters: schema, scope: "widget-detail", widgetType: "tv" }
  ];
}

function createRegistry() {
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
      async execute(_args, context) {
        executed.push(`${name}:${context.target?.widgetId ?? "none"}`);
        if (delayMs > 0) {
          await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
        }
        return result ?? { status: "success", message: `${name} done` };
      }
    });
  };

  register("board.auto_align");
  register("widget.focus");
  register("widget.remove");
  register("note.append");
  register("tv.play");

  return { registry, executed };
}

function createContextInput(): ContextSummarizerInput {
  return {
    boardId: "board_1",
    boardName: "我的桌板",
    focusedWidgetId: "wi_tv",
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
  actionTimeoutMs?: number;
  registryFactory?: () => ReturnType<typeof createRegistry>;
}) {
  const registryState = options?.registryFactory?.() ?? createRegistry();
  const toolUpdates: string[][] = [];
  const sentResults: AssistantToolResult[] = [];
  const auditEvents: AssistantAuditEvent[] = [];
  const realtime: AssistantRealtimeAdapter = {
    updateTools(tools) {
      toolUpdates.push(tools.map((tool) => tool.name));
    },
    sendToolResult(_call, result) {
      sentResults.push(result);
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
    audit: {
      write(event) {
        auditEvents.push(event);
      }
    },
    getContextInput: createContextInput,
    actionTimeoutMs: options?.actionTimeoutMs ?? 500,
    now: () => "2026-06-16T00:00:00.000Z"
  });
  return { harness, toolUpdates, sentResults, auditEvents, executed: registryState.executed };
}

describe("AssistantHarness", () => {
  it("initializes with desktop-level tools", async () => {
    const { harness, toolUpdates } = createHarness();

    await harness.initialize();

    expect(toolUpdates).toEqual([["board.auto_align", "widget.focus", "widget.remove"]]);
  });

  it("updates tools when entering a widget context", async () => {
    const { harness, toolUpdates } = createHarness();

    await harness.initialize();
    await harness.enterWidgetContext("tv");

    expect(toolUpdates[1]).toEqual(["board.auto_align", "widget.focus", "widget.remove", "tv.play"]);
  });

  it("executes shortcut-routed commands without model fallback", async () => {
    const { harness, sentResults, auditEvents, executed } = createHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("整理桌面");

    expect(response.route).toBe("shortcut");
    expect(response.result.status).toBe("needs_confirmation");
    expect(harness.getPendingConfirmation()?.actionName).toBe("board.auto_align");
    expect(executed).toEqual([]);
    expect(sentResults[0].status).toBe("needs_confirmation");
    expect(auditEvents[0].route).toBe("shortcut");
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

  it("cancels a pending action without execution", async () => {
    const { harness, executed } = createHarness();
    await harness.initialize();
    await harness.handleFunctionCall({
      id: "call_1",
      name: "widget.remove",
      arguments: { widgetId: "wi_note" },
      source: "test"
    });

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
