import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  createDefaultIntentShortcutRouter,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";
import { useAppStore } from "../store";
import { registerBoardActions } from "./boardActions";
import { AssistantHarness, type AssistantRealtimeAdapter } from "./AssistantHarness";
import { createGuardrailActions } from "./guardrailActions";
import { WidgetCapabilityBridge, createWidgetCapabilityActions } from "./widgetCapabilityBridge";
import { createWidgetStateActions } from "./widgetStateActions";

const noopRealtimeAdapter: AssistantRealtimeAdapter = {
  updateTools() {},
  sendToolResult() {},
  requestToolCall() {
    return null;
  }
};

function createContextInput(): ContextSummarizerInput {
  const state = useAppStore.getState();
  const activeBoard = state.boards.find((board) => board.id === state.activeBoardId);
  const definitionById = new Map(state.widgetDefinitions.map((definition) => [definition.id, definition]));

  return {
    boardId: activeBoard?.id,
    boardName: activeBoard?.name,
    recentWidgetIds: state.widgetInstances.slice(-3).map((widget) => widget.id),
    widgets: state.widgetInstances.map((widget, index) => {
      const definition = definitionById.get(widget.definitionId);
      return {
        widgetId: widget.id,
        definitionId: widget.definitionId,
        type: definition?.type ?? "unknown",
        name: definition?.name ?? "小工具",
        order: index + 1,
        state: widget.state
      };
    })
  };
}

export function createLocalAssistantHarness(options?: {
  capabilityBridge?: WidgetCapabilityBridge;
  realtime?: AssistantRealtimeAdapter;
}): AssistantHarness {
  const registry = new ActionRegistry();
  const capabilityBridge = options?.capabilityBridge ?? new WidgetCapabilityBridge();
  const adapter = {
    getWidgetInstances: () => useAppStore.getState().widgetInstances,
    getWidgetDefinitions: () => useAppStore.getState().widgetDefinitions,
    addWidgetInstance: (definitionId: string, widgetOptions?: { mobileMode?: boolean }) =>
      useAppStore.getState().addWidgetInstance(definitionId, widgetOptions),
    removeWidgetInstance: (widgetId: string) => useAppStore.getState().removeWidgetInstance(widgetId),
    updateWidgetPosition: (widgetId: string, x: number, y: number) =>
      useAppStore.getState().updateWidgetPosition(widgetId, x, y),
    updateWidgetSize: (widgetId: string, w: number, h: number) => useAppStore.getState().updateWidgetSize(widgetId, w, h),
    updateWidgetState: (widgetId: string, nextState: Record<string, unknown>) =>
      useAppStore.getState().updateWidgetState(widgetId, nextState),
    autoAlignWidgets: (viewportWidth: number, alignOptions?: { mobileMode?: boolean }) =>
      useAppStore.getState().autoAlignWidgets(viewportWidth, alignOptions),
    setActiveBoard: (boardId: string) => useAppStore.getState().setActiveBoard(boardId),
    addBoard: (name?: string) => useAppStore.getState().addBoard(name),
    renameBoard: (boardId: string, name: string) => useAppStore.getState().renameBoard(boardId, name)
  };

  registerBoardActions(registry, adapter);
  createGuardrailActions().forEach((action) => registry.register(action));
  createWidgetStateActions(adapter).forEach((action) => registry.register(action));
  createWidgetCapabilityActions(adapter, capabilityBridge).forEach((action) => registry.register(action));

  return new AssistantHarness({
    registry,
    shortcutRouter: createDefaultIntentShortcutRouter(),
    targetResolver: new WidgetTargetResolver(),
    toolScopeManager: new ToolScopeManager(registry.list()),
    contextSummarizer: new ContextSummarizer(),
    realtime: options?.realtime ?? noopRealtimeAdapter,
    getContextInput: createContextInput,
    actionTimeoutMs: 8_000,
    now: () => new Date().toISOString()
  });
}
