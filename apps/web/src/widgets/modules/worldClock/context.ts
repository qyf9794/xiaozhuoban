import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { worldClockExecutionPolicy } from "./executionPolicy";
import { WORLD_CLOCK_MODULE_TYPE, worldClockShortcutExamples } from "./definition";

function safeWorldClockSummary(summary: string) {
  const compact = summary.replace(/\s+/g, " ").trim();
  return compact.length > 40 ? `${compact.slice(0, 40)}...` : compact || "selected-zones-summary-only";
}

export function createWorldClockScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === WORLD_CLOCK_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeWorldClockSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: WORLD_CLOCK_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      locationTrackingIncluded: false,
      selectedZonesOnly: true
    },
    shortcutExamples: worldClockShortcutExamples.slice(0, 8),
    executionPolicy: worldClockExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createWorldClockContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 600,
    getScopedContext: (request: ScopedContextRequest) => createWorldClockScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeWorldClockSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        locationTrackingIncluded: false,
        selectedZonesOnly: true
      }
    })
  };
}
