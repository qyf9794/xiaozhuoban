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
import { AssistantHarness, type AssistantRealtimeAdapter } from "./AssistantHarness";
import { createGuardrailActions } from "./guardrailActions";

function createRegistry() {
  const registry = new ActionRegistry();
  createGuardrailActions().forEach((action) => registry.register(action));
  return registry;
}

function createContextInput(): ContextSummarizerInput {
  return {
    boardId: "board_1",
    boardName: "我的桌板",
    widgets: [
      {
        widgetId: "wi_monopoly",
        definitionId: "wd_monopoly",
        type: "monopoly",
        name: "大富翁",
        order: 1,
        summary: "等待操作"
      },
      {
        widgetId: "wi_ai",
        definitionId: "wd_ai",
        type: "aiForm",
        name: "AI 表单",
        order: 2,
        summary: "有表单"
      }
    ]
  };
}

function createHarness(modelCalls: AssistantToolCall[] = []) {
  const toolUpdates: string[][] = [];
  const sentResults: AssistantToolResult[] = [];
  const realtime: AssistantRealtimeAdapter = {
    updateTools(tools) {
      toolUpdates.push(tools.map((tool) => tool.name));
    },
    sendToolResult(_call, result) {
      sentResults.push(result);
    },
    requestToolCall() {
      return modelCalls.shift() ?? null;
    }
  };
  const actions = createGuardrailActions();
  const harness = new AssistantHarness({
    registry: createRegistry(),
    shortcutRouter: createDefaultIntentShortcutRouter(),
    targetResolver: new WidgetTargetResolver(),
    toolScopeManager: new ToolScopeManager(actions.map((action) => action.spec)),
    contextSummarizer: new ContextSummarizer(),
    realtime,
    getContextInput: createContextInput,
    now: () => "2026-06-16T00:00:00.000Z"
  });

  return { harness, sentResults, toolUpdates };
}

describe("guardrail assistant actions", () => {
  it("returns short out-of-scope messages for deferred categories", async () => {
    const registry = createRegistry();

    const game = await registry.execute({
      id: "call_1",
      name: "assistant.out_of_scope",
      arguments: { category: "deferred_widget", targetType: "monopoly" },
      source: "test"
    });
    const dynamic = await registry.execute({
      id: "call_2",
      name: "assistant.out_of_scope",
      arguments: { category: "dynamic_widget_generation" },
      source: "test"
    });

    expect(game).toMatchObject({ status: "failed", errorCode: "OUT_OF_SCOPE" });
    expect(game.message.length).toBeLessThan(28);
    expect(dynamic).toMatchObject({ status: "failed", errorCode: "OUT_OF_SCOPE" });
  });

  it("lets Harness stop deferred widget commands before model fallback", async () => {
    const { harness, sentResults } = createHarness([
      { id: "model_should_not_run", name: "board.auto_align", arguments: {}, source: "realtime" }
    ]);
    await harness.initialize();

    const response = await harness.handleUserInput("大富翁掷骰");

    expect(response.route).toBe("shortcut");
    expect(response.call?.name).toBe("assistant.out_of_scope");
    expect(response.result).toMatchObject({ status: "failed", errorCode: "OUT_OF_SCOPE" });
    expect(sentResults).toHaveLength(1);
  });

  it("blocks AI form, dynamic widget generation, and long text rewrite through Harness", async () => {
    const { harness } = createHarness();
    await harness.initialize();

    const aiForm = await harness.handleUserInput("提交这个 AI 表单");
    const dynamicWidget = await harness.handleUserInput("帮我生成一个新工具");
    const rewrite = await harness.handleUserInput("帮我重写这篇长文");

    expect(aiForm.result).toMatchObject({ status: "failed", errorCode: "OUT_OF_SCOPE" });
    expect(dynamicWidget.result).toMatchObject({ status: "failed", errorCode: "OUT_OF_SCOPE" });
    expect(rewrite.result).toMatchObject({ status: "failed", errorCode: "OUT_OF_SCOPE" });
  });
});
