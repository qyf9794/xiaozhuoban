import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  createDefaultIntentShortcutRouter,
  type AssistantToolCall,
  type AssistantToolResult,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { AssistantHarness, type AssistantRealtimeAdapter } from "./AssistantHarness";
import { registerBoardActions } from "./boardActions";
import { createGuardrailActions } from "./guardrailActions";
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
  const definitions = [definition("weather", "天气"), definition("countdown", "倒计时"), definition("note", "便签")];
  let widgets = (options?.initialWidgetTypes ?? ["weather", "countdown", "note"]).map(widget);
  const sentResults: AssistantToolResult[] = [];
  const modelInputs: string[] = [];
  const registry = new ActionRegistry();
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
    setActiveBoard() {},
    addBoard() {},
    renameBoard() {}
  };
  registerBoardActions(registry, adapter);
  createGuardrailActions().forEach((action) => registry.register(action));
  createWidgetStateActions(adapter).forEach((action) => registry.register(action));

  const realtime: AssistantRealtimeAdapter = {
    updateTools() {},
    sendToolResult(_call, result) {
      sentResults.push(result);
    },
    requestToolCall(input) {
      modelInputs.push(input);
      return options?.modelCall ?? null;
    }
  };
  const getContextInput = (): ContextSummarizerInput => ({
    boardId: "board_1",
    boardName: "我的桌板",
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
    modelInputs,
    getWidget: (type: string) => widgets.find((item) => item.id === `wi_${type}`)
  };
}

describe("stage-one assistant acceptance scenarios", () => {
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

  it("cancels a destructive pending action without mutation", async () => {
    const { harness, getWidget } = createAcceptanceHarness();
    await harness.initialize();
    await harness.handleFunctionCall({
      id: "call_1",
      name: "widget.remove",
      arguments: { widgetId: "wi_note" },
      source: "test"
    });

    const response = await harness.handleUserInput("取消");

    expect(response.result.status).toBe("cancelled");
    expect(getWidget("note")).toBeTruthy();
  });

  it("keeps out-of-scope requests short and local", async () => {
    const { harness, modelInputs } = createAcceptanceHarness();
    await harness.initialize();

    const response = await harness.handleUserInput("帮我生成一个新工具");

    expect(response.route).toBe("shortcut");
    expect(response.result).toMatchObject({ status: "failed", errorCode: "OUT_OF_SCOPE" });
    expect(response.result.message.length).toBeLessThan(24);
    expect(modelInputs).toEqual([]);
  });
});
