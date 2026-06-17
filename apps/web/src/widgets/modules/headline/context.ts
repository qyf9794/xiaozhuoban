import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { headlineExecutionPolicy } from "./executionPolicy";
import { HEADLINE_MODULE_TYPE, headlineShortcutExamples } from "./definition";

function safeHeadlineSummary(summary: string) {
  const lower = summary.toLowerCase();
  const parts = ["headline-metadata-only"];
  const countMatch = summary.match(/(\d+)/);
  if (countMatch) parts.push(`count:${countMatch[1]}`);
  if (lower.includes("error") || summary.includes("错误")) parts.push("has-error");
  return parts.join(" ");
}

export function createHeadlineScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === HEADLINE_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeHeadlineSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: HEADLINE_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      fullArticlePayloadIncluded: false,
      tvChannelIntentExcluded: true
    },
    shortcutExamples: headlineShortcutExamples.slice(0, 8),
    executionPolicy: headlineExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createHeadlineContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 550,
    getScopedContext: (request: ScopedContextRequest) => createHeadlineScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeHeadlineSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        fullArticlePayloadIncluded: false,
        tvChannelIntentExcluded: true
      }
    })
  };
}
