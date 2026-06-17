import type {
  AssistantAction,
  AssistantToolSpec,
  RealtimeScopedModuleContext,
  ScopedContextRequest,
  WidgetContextProvider
} from "@xiaozhuoban/assistant-core";
import { musicShortcutExamples } from "./definition";
import { musicExecutionPolicy } from "./executionPolicy";

function truncateMusicSummary(value: string, maxLength = 24) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

export function createMusicScopedContext(
  tools: AssistantAction[],
  request: ScopedContextRequest
): RealtimeScopedModuleContext {
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === "music")
    .map((widget) => ({
      ...widget,
      summary: truncateMusicSummary(widget.summary)
    }));

  return {
    moduleType: "music",
    tools: safeTools,
    toolSchemas: Object.fromEntries(
      safeTools.map((tool) => [
        tool.name,
        (tool.parameters as { jsonSchema?: Record<string, unknown> }).jsonSchema ?? {
          name: tool.name,
          risk: tool.risk,
          widgetType: tool.widgetType,
          requiresTarget: tool.requiresTarget,
          argumentKeys: tool.argumentKeys
        }
      ])
    ),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      mountedCapabilityRequired: true,
      privateHistoryIncluded: false
    },
    shortcutExamples: musicShortcutExamples.slice(0, 8),
    executionPolicy: musicExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createMusicContextProvider(tools: AssistantAction[]): WidgetContextProvider {
  return {
    maxRealtimeContextTokens: 700,
    getScopedContext: (request) => createMusicScopedContext(tools, request),
    redactContext: (context) => ({
      ...context,
      instances: context.instances.map((instance) => ({
        ...instance,
        summary: truncateMusicSummary(instance.summary)
      })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        mountedCapabilityRequired: true,
        privateHistoryIncluded: false
      }
    })
  };
}
