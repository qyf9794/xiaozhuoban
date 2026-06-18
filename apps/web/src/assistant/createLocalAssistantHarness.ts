import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetAssistantRegistry,
  WidgetTargetResolver,
  createDefaultIntentShortcutRouter,
  type AssistantAction,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";
import { useAuthStore } from "../auth/authStore";
import { useAppStore } from "../store";
import { supabase, supabaseConfigError } from "../lib/supabase";
import { registerBoardActions } from "./boardActions";
import { AssistantHarness, type AssistantAuditEvent, type AssistantOperationEvent, type AssistantRealtimeAdapter } from "./AssistantHarness";
import { createLocalAssistantAuditAdapter, createSupabaseAssistantAuditAdapter, type AssistantAuditContext } from "./assistantAudit";
import { assistantLearnedCommandStore } from "./assistantLearning";
import { WidgetCapabilityBridge, createWidgetCapabilityActions } from "./widgetCapabilityBridge";
import { createAppShellActions, type AppShellActionBridge } from "./appShellActions";
import { createWidgetStateActions } from "./widgetStateActions";
import { createDailyWidgetAssistantModules } from "../widgets/modules/dailyWidgetAssistantModules";
import { createCalculatorAssistantModule } from "../widgets/modules/calculator/assistant";
import { createClipboardAssistantModule } from "../widgets/modules/clipboard/assistant";
import { createCountdownAssistantModule } from "../widgets/modules/countdown/assistant";
import { createHeadlineAssistantModule } from "../widgets/modules/headline/assistant";
import { createMarketAssistantModule } from "../widgets/modules/market/assistant";
import { createMusicAssistantModule } from "../widgets/modules/music/assistant";
import { createRecorderAssistantModule } from "../widgets/modules/recorder/assistant";
import { createTodoAssistantModule } from "../widgets/modules/todo/assistant";
import { createTranslateAssistantModule } from "../widgets/modules/translate/assistant";
import { createTvAssistantModule } from "../widgets/modules/tv/assistant";
import { createWeatherAssistantModule } from "../widgets/modules/weather/assistant";
import { createWorldClockAssistantModule } from "../widgets/modules/worldClock/assistant";

const noopRealtimeAdapter: AssistantRealtimeAdapter = {
  updateTools() {},
  updateContext() {},
  updateModules() {},
  sendToolResult() {},
  requestToolCall() {
    return null;
  }
};

function createContextInput(): ContextSummarizerInput {
  const state = useAppStore.getState();
  const activeBoard = state.boards.find((board) => board.id === state.activeBoardId);
  const definitionById = new Map(state.widgetDefinitions.map((definition) => [definition.id, definition]));
  const activeWidgets = state.widgetInstances.filter((widget) => widget.boardId === state.activeBoardId);

  return {
    boardId: activeBoard?.id,
    boardName: activeBoard?.name,
    availableBoards: state.boards.map((board) => ({
      boardId: board.id,
      name: board.name,
      active: board.id === state.activeBoardId || undefined
    })),
    focusedWidgetId: state.focusedWidgetId,
    availableDefinitions: state.widgetDefinitions.map((definition) => ({
      definitionId: definition.id,
      type: definition.type,
      name: definition.name
    })),
    maxWidgets: Math.min(16, Math.max(8, activeWidgets.length)),
    recentWidgetIds: activeWidgets.slice(-3).map((widget) => widget.id),
    widgets: activeWidgets.map((widget, index) => {
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
  appShellBridge?: AppShellActionBridge;
  realtime?: AssistantRealtimeAdapter;
  onOperation?: (event: AssistantOperationEvent) => void;
}): AssistantHarness {
  const registry = new ActionRegistry();
  const capabilityBridge = options?.capabilityBridge ?? new WidgetCapabilityBridge();
  const adapter = {
    getWidgetInstances: () => useAppStore.getState().widgetInstances,
    getWidgetDefinitions: () => useAppStore.getState().widgetDefinitions,
    addWidgetInstance: (definitionId: string, widgetOptions?: { mobileMode?: boolean; operationId?: string }) =>
      useAppStore.getState().addWidgetInstance(definitionId, widgetOptions),
    removeWidgetInstance: (widgetId: string, persistOptions?: { operationId?: string }) =>
      useAppStore.getState().removeWidgetInstance(widgetId, persistOptions),
    focusWidget: async (widgetId: string, persistOptions?: { operationId?: string }) => {
      await useAppStore.getState().focusWidget(widgetId, persistOptions);
      if (typeof document === "undefined") return;
      const element = document.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(widgetId)}"]`);
      element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      element?.animate?.(
        [
          { boxShadow: "0 0 0 0 rgba(14, 165, 233, 0)" },
          { boxShadow: "0 0 0 4px rgba(14, 165, 233, 0.35)" },
          { boxShadow: "0 0 0 0 rgba(14, 165, 233, 0)" }
        ],
        { duration: 900, easing: "ease-out" }
      );
    },
    fullscreenWidget: async (widgetId: string, persistOptions?: { operationId?: string }) => {
      await useAppStore.getState().fullscreenWidget(widgetId, persistOptions);
      if (typeof document === "undefined") return;
      const element = document.querySelector<HTMLElement>(`[data-widget-id="${CSS.escape(widgetId)}"]`);
      await element?.requestFullscreen?.();
    },
    bringWidgetToFront: (widgetId: string, persistOptions?: { operationId?: string }) =>
      useAppStore.getState().bringWidgetToFront(widgetId, persistOptions),
    updateWidgetPosition: (widgetId: string, x: number, y: number, persistOptions?: { operationId?: string }) =>
      useAppStore.getState().updateWidgetPosition(widgetId, x, y, persistOptions),
    updateWidgetSize: (widgetId: string, w: number, h: number, persistOptions?: { operationId?: string }) =>
      useAppStore.getState().updateWidgetSize(widgetId, w, h, persistOptions),
    updateWidgetState: (widgetId: string, nextState: Record<string, unknown>, persistOptions?: { operationId?: string }) =>
      useAppStore.getState().updateWidgetState(widgetId, nextState, persistOptions),
    autoAlignWidgets: (viewportWidth: number, alignOptions?: { mobileMode?: boolean; operationId?: string }) =>
      useAppStore.getState().autoAlignWidgets(viewportWidth, alignOptions),
    setActiveBoard: (boardId: string) => useAppStore.getState().setActiveBoard(boardId),
    addBoard: (name?: string, persistOptions?: { operationId?: string }) => useAppStore.getState().addBoard(name, persistOptions),
    renameBoard: (boardId: string, name: string, persistOptions?: { operationId?: string }) =>
      useAppStore.getState().renameBoard(boardId, name, persistOptions)
  };

  const actions: AssistantAction[] = [
    ...createAppShellActions(options?.appShellBridge ?? {}),
    ...registerBoardActions(registry, adapter),
    ...createWidgetStateActions(adapter),
    ...createWidgetCapabilityActions(adapter, capabilityBridge)
  ];
  actions.forEach((action) => {
    if (!registry.get(action.spec.name)) {
      registry.register(action);
    }
  });

  const moduleRegistry = new WidgetAssistantRegistry();
  const widgetDefinitions = useAppStore.getState().widgetDefinitions;
  moduleRegistry.register(createMusicAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createWeatherAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createClipboardAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createTodoAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createCountdownAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createWorldClockAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createHeadlineAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createMarketAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createCalculatorAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createTranslateAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createRecorderAssistantModule(widgetDefinitions, actions));
  moduleRegistry.register(createTvAssistantModule(widgetDefinitions, actions));
  createDailyWidgetAssistantModules(widgetDefinitions, actions).forEach((module) => moduleRegistry.register(module));

  const auditContext: AssistantAuditContext = {
    getUserId: () => useAuthStore.getState().user?.id,
    getBoardId: () => useAppStore.getState().activeBoardId
  };
  const localAudit = createLocalAssistantAuditAdapter(auditContext);
  const supabaseAudit = supabaseConfigError ? null : createSupabaseAssistantAuditAdapter(supabase, auditContext);

  return new AssistantHarness({
    registry,
    shortcutRouter: createDefaultIntentShortcutRouter(),
    targetResolver: new WidgetTargetResolver(),
    toolScopeManager: new ToolScopeManager(registry.list()),
    contextSummarizer: new ContextSummarizer(),
    realtime: options?.realtime ?? noopRealtimeAdapter,
    moduleRegistry,
    learnedCommandStore: assistantLearnedCommandStore,
    audit: {
      async write(event: AssistantAuditEvent) {
        if (!useAuthStore.getState().user?.id || !supabaseAudit) {
          return localAudit.write(event);
        }
        try {
          await supabaseAudit.write(event);
        } catch {
          await localAudit.write(event);
        }
      }
    },
    onOperation: options?.onOperation,
    getContextInput: createContextInput,
    actionTimeoutMs: 8_000,
    now: () => new Date().toISOString()
  });
}
