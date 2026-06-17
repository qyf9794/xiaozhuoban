import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { translateExecutionPolicy } from "./executionPolicy";
import { TRANSLATE_MODULE_TYPE, translateShortcutExamples } from "./definition";

function safeTranslateSummary(summary: string) {
  const compact = summary.replace(/\s+/g, " ").trim();
  const lengthMatch = compact.match(/(?:length|长度|字数)[:：]?\s*(\d+)/i);
  const parts = ["translate-draft-metadata-only"];
  if (lengthMatch) parts.push(`sourceLength:${lengthMatch[1]}`);
  if (/zh|中文|en|英文|auto/i.test(compact)) parts.push("language-hint-present");
  return parts.join(" ");
}

export function createTranslateScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === TRANSLATE_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeTranslateSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: TRANSLATE_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      longSourceTextIncluded: false,
      draftMetadataOnly: true
    },
    shortcutExamples: translateShortcutExamples.slice(0, 8),
    executionPolicy: translateExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createTranslateContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 600,
    getScopedContext: (request: ScopedContextRequest) => createTranslateScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeTranslateSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        longSourceTextIncluded: false,
        draftMetadataOnly: true
      }
    })
  };
}
