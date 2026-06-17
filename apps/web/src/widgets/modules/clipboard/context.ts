import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { clipboardExecutionPolicy } from "./executionPolicy";
import { clipboardShortcutExamples, CLIPBOARD_MODULE_TYPE } from "./definition";

function safeClipboardSummary(summary: string) {
  const lower = summary.toLowerCase();
  const countMatch = summary.match(/(\d+)/);
  const parts = ["clipboard-content-redacted"];
  if (countMatch) parts.push(`count:${countMatch[1]}`);
  if (lower.includes("pinned") || summary.includes("固定") || summary.includes("置顶")) parts.push("pinned:present");
  return parts.join(" ");
}

export function createClipboardScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === CLIPBOARD_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeClipboardSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: CLIPBOARD_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      contentIncluded: false,
      pinnedSummaryOnly: true
    },
    shortcutExamples: clipboardShortcutExamples.slice(0, 8),
    executionPolicy: clipboardExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createClipboardContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 550,
    getScopedContext: (request: ScopedContextRequest) => createClipboardScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeClipboardSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        contentIncluded: false,
        pinnedSummaryOnly: true
      }
    })
  };
}
