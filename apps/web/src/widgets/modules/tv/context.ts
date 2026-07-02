import {
  type AssistantAction,
  type AssistantToolSpec,
  type CompactWidgetSummary,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest
} from "@xiaozhuoban/assistant-core";
import { tvExecutionPolicy } from "./executionPolicy";
import { TV_MODULE_TYPE, tvShortcutExamples } from "./definition";
import { normalizeTvChannelSearchName } from "../../tvShared";

const TV_CONTEXT_CHANNEL_LIMIT = 120;

function safeTvSummary(summary: string) {
  const compact = summary.replace(/\s+/g, " ").trim();
  const parts = ["tv-playback-summary-only"];
  const channelMatch = compact.match(/(CCTV[-\s]?\d+|央视新闻|央视五套|CCTV[-\s]?13|CCTV1)/i);
  if (channelMatch) parts.push(`channel:${channelMatch[1]}`);
  if (/paused|暂停/i.test(compact)) parts.push("paused");
  if (/playing|播放|直播/i.test(compact)) parts.push("playing");
  return parts.join(" ");
}

function readChannelNames(state: Record<string, unknown> | undefined): string[] {
  const names = Array.isArray(state?.channelNames) ? state?.channelNames : state?.assistantChannelNames;
  if (!Array.isArray(names)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of names) {
    if (typeof item !== "string") continue;
    const compact = item.replace(/\s+/g, " ").trim();
    if (!compact || seen.has(compact)) continue;
    seen.add(compact);
    result.push(compact);
  }
  return result;
}

function channelCount(state: Record<string, unknown> | undefined, fallback: number) {
  const count = typeof state?.channelCount === "number" ? state.channelCount : state?.assistantChannelCount;
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.round(count) : fallback;
}

function chooseRelevantChannelNames(channelNames: string[], userText: string, limit = TV_CONTEXT_CHANNEL_LIMIT): string[] {
  const normalizedUserText = normalizeTvChannelSearchName(
    userText.replace(/(打开|播放|看看|看|切到|换到|切换到|切换|换台|电视频道|电视|直播|频道|我想|我要|想看|想要)/g, " ")
  );
  const matched: string[] = [];
  const rest: string[] = [];

  for (const name of channelNames) {
    const normalizedName = normalizeTvChannelSearchName(name);
    if (
      normalizedUserText &&
      normalizedName &&
      (normalizedName.includes(normalizedUserText) || normalizedUserText.includes(normalizedName))
    ) {
      matched.push(name);
    } else {
      rest.push(name);
    }
  }

  return [...matched, ...rest].slice(0, limit);
}

function sanitizeTvAssistantState(
  widget: CompactWidgetSummary,
  userText: string,
  limit = TV_CONTEXT_CHANNEL_LIMIT
): Record<string, unknown> | undefined {
  const rawState = widget.assistantState;
  const channelNames = chooseRelevantChannelNames(readChannelNames(rawState), userText, limit);
  const count = channelCount(rawState, channelNames.length);
  const selectedChannelName =
    typeof rawState?.selectedChannelName === "string" ? rawState.selectedChannelName.replace(/\s+/g, " ").trim() : "";

  if (!selectedChannelName && channelNames.length === 0 && count === 0) return undefined;

  return {
    selectedChannelName: selectedChannelName || undefined,
    channelNames,
    channelCount: count,
    channelNamesTruncated: count > channelNames.length || undefined,
    channelUrlsExposed: false,
    channelSelectionArgument: "channelName"
  };
}

export function createTvScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const instances = (request.compactContext?.widgets ?? [])
    .filter((widget) => widget.type === TV_MODULE_TYPE)
    .map((widget) => ({
      ...widget,
      summary: safeTvSummary(widget.summary),
      assistantState: sanitizeTvAssistantState(widget, request.userText)
    }));
  const safeTools = tools.map((action): AssistantToolSpec => action.spec);
  const allChannelNames = [
    ...new Set(
      instances.flatMap((instance) =>
        readChannelNames(instance.assistantState).map((name) => name.replace(/\s+/g, " ").trim()).filter(Boolean)
      )
    )
  ].slice(0, TV_CONTEXT_CHANNEL_LIMIT);
  const parsedChannelCount = instances.reduce((sum, instance) => sum + channelCount(instance.assistantState, 0), 0);
  return {
    moduleType: TV_MODULE_TYPE,
    tools: safeTools,
    toolSchemas: Object.fromEntries(safeTools.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances,
    stateSummary: {
      instanceCount: instances.length,
      focusedWidgetId: instances.find((widget) => widget.focused)?.widgetId,
      selectedToolHint: request.selectedToolHint,
      parsedChannelListIncluded: allChannelNames.length > 0,
      availableChannelNames: allChannelNames,
      availableChannelCount: parsedChannelCount,
      channelNamesTruncated: parsedChannelCount > allChannelNames.length,
      channelSelectionArgument: "channelName",
      playlistIncluded: false,
      channelUrlsExposed: false,
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
      instances: context.instances.map((instance) => ({
        ...instance,
        summary: safeTvSummary(instance.summary),
        assistantState: sanitizeTvAssistantState(instance, "", TV_CONTEXT_CHANNEL_LIMIT)
      })),
      stateSummary: {
        instanceCount: context.stateSummary.instanceCount,
        focusedWidgetId: context.stateSummary.focusedWidgetId,
        selectedToolHint: context.stateSummary.selectedToolHint,
        parsedChannelListIncluded: Boolean(context.stateSummary.availableChannelNames),
        availableChannelNames: Array.isArray(context.stateSummary.availableChannelNames)
          ? context.stateSummary.availableChannelNames.slice(0, TV_CONTEXT_CHANNEL_LIMIT)
          : [],
        availableChannelCount: context.stateSummary.availableChannelCount,
        channelNamesTruncated: context.stateSummary.channelNamesTruncated,
        channelSelectionArgument: "channelName",
        playlistIncluded: false,
        channelUrlsExposed: false,
        currentChannelSummaryOnly: true,
        conflictsWithMusicPlayback: true
      }
    })
  };
}
