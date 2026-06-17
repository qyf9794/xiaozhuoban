import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { countdownExecutionPolicy } from "./executionPolicy";
import { COUNTDOWN_MODULE_TYPE, countdownShortcutExamples } from "./definition";

function safeCountdownSummary(summary: string) {
  const compact = summary.replace(/\s+/g, " ").trim();
  const timeMatch = compact.match(/(\d+\s*(?:小时|分钟|秒|h|m|s)?)/i);
  const parts = ["countdown-state-summary"];
  if (timeMatch) parts.push(`time:${timeMatch[1]}`);
  if (compact.includes("暂停")) parts.push("paused");
  if (compact.includes("运行") || compact.includes("running")) parts.push("running");
  return parts.join(" ");
}

export function createCountdownScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === COUNTDOWN_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeCountdownSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: COUNTDOWN_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      compactTimerStateOnly: true
    },
    shortcutExamples: countdownShortcutExamples.slice(0, 8),
    executionPolicy: countdownExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createCountdownContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 600,
    getScopedContext: (request: ScopedContextRequest) => createCountdownScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeCountdownSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        compactTimerStateOnly: true
      }
    })
  };
}
