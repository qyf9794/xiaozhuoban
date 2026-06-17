import {
  type AssistantAction,
  type AssistantToolSpec,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { tvExecutionPolicy } from "./executionPolicy";
import { TV_MODULE_TYPE, tvShortcutExamples } from "./definition";

function safeTvSummary(summary: string) {
  const compact = summary.replace(/\s+/g, " ").trim();
  const parts = ["tv-playback-summary-only"];
  const channelMatch = compact.match(/(CCTV[-\s]?\d+|央视新闻|央视五套|CCTV[-\s]?13|CCTV1)/i);
  if (channelMatch) parts.push(`channel:${channelMatch[1]}`);
  if (/paused|暂停/i.test(compact)) parts.push("paused");
  if (/playing|播放|直播/i.test(compact)) parts.push("playing");
  return parts.join(" ");
}

export function createTvScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === TV_MODULE_TYPE)
    .map((widget) => ({ ...widget, summary: safeTvSummary(widget.summary) }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  return {
    moduleType: TV_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      playlistIncluded: false,
      currentChannelSummaryOnly: true,
      conflictsWithMusicPlayback: true
    },
    shortcutExamples: tvShortcutExamples.slice(0, 8),
    executionPolicy: tvExecutionPolicy,
    riskPolicy: {
      safe: safeTools.filter((tool) => !tool.risk || tool.risk === "safe").map((tool) => tool.name),
      confirm: safeTools.filter((tool) => tool.risk === "confirm").map((tool) => tool.name),
      destructive: safeTools.filter((tool) => tool.risk === "destructive").map((tool) => tool.name)
    }
  };
}

export function createTvContextProvider(tools: AssistantAction[]) {
  return {
    maxRealtimeContextTokens: 650,
    getScopedContext: (request: ScopedContextRequest) => createTvScopedContext(tools, request),
    redactContext: (context: RealtimeScopedModuleContext): RealtimeScopedModuleContext => ({
      ...context,
      instances: context.instances.map((instance) => ({ ...instance, summary: safeTvSummary(instance.summary) })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        playlistIncluded: false,
        currentChannelSummaryOnly: true,
        conflictsWithMusicPlayback: true
      }
    })
  };
}
