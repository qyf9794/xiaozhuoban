import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { recorderExecutionPolicy } from "./executionPolicy";
import { RECORDER_MODULE_TYPE, recorderShortcutExamples } from "./definition";

function safeRecorderSummary(summary: string) {
  const compact = summary.replace(/\s+/g, " ").trim();
  const parts = ["recorder-state-summary-only"];
  if (/recording|录音中|正在录|录制中/i.test(compact)) parts.push("recording");
  if (/permission|权限|microphone|麦克风/i.test(compact)) parts.push("permission-state-present");
  if (/error|错误|失败/i.test(compact)) parts.push("has-error");
  return parts.join(" ");
}

export function createRecorderScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === RECORDER_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeRecorderSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: RECORDER_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      recordingContentIncluded: false,
      permissionSummaryOnly: true,
      realtimeMicrophoneConflict: true
    },
    shortcutExamples: recorderShortcutExamples.slice(0, 8),
    executionPolicy: recorderExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createRecorderContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 550,
    getScopedContext: (request: ScopedContextRequest) => createRecorderScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeRecorderSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        recordingContentIncluded: false,
        permissionSummaryOnly: true,
        realtimeMicrophoneConflict: true
      }
    })
  };
}
