import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { weatherExecutionPolicy } from "./executionPolicy";
import { weatherShortcutExamples, WEATHER_MODULE_TYPE } from "./definition";

function truncateSummary(value: string, maxLength = 24) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

export function createWeatherScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === WEATHER_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: truncateSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: WEATHER_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      locationHistoryIncluded: false
    },
    shortcutExamples: weatherShortcutExamples.slice(0, 8),
    executionPolicy: weatherExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createWeatherContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 650,
    getScopedContext: (request: ScopedContextRequest) => createWeatherScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: truncateSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        locationHistoryIncluded: false
      }
    })
  };
}
