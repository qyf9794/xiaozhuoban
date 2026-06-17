import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { todoExecutionPolicy } from "./executionPolicy";
import { TODO_MODULE_TYPE, todoShortcutExamples } from "./definition";

function safeTodoSummary(summary: string) {
  const countMatch = summary.match(/(\d+)/);
  return countMatch ? `todo-summary-only count:${countMatch[1]}` : "todo-summary-only";
}

export function createTodoScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === TODO_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeTodoSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: TODO_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      fullTodoListIncluded: false,
      shortTargetSummariesOnly: true
    },
    shortcutExamples: todoShortcutExamples.slice(0, 8),
    executionPolicy: todoExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createTodoContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 600,
    getScopedContext: (request: ScopedContextRequest) => createTodoScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeTodoSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        fullTodoListIncluded: false,
        shortTargetSummariesOnly: true
      }
    })
  };
}
