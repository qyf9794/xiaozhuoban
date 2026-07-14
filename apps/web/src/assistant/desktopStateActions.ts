import {
  createStrictObjectSchema,
  type AssistantAction,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";

type EmptyArgs = Record<string, never>;

function countWidgetsByType(widgets: ContextSummarizerInput["widgets"]): Record<string, number> {
  return widgets.reduce<Record<string, number>>((counts, widget) => {
    counts[widget.type] = (counts[widget.type] ?? 0) + 1;
    return counts;
  }, {});
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : undefined;
}

function readStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    const text = readString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    items.push(text);
    if (items.length >= limit) break;
  }
  return items;
}

function summarizeWidgetState(type: string, state: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!state) return undefined;
  if (type === "tv") {
    return {
      selectedChannelName: readString(state.selectedChannelName),
      playlistUrl: readString(state.playlistUrl),
      channelCount:
        typeof state.assistantChannelCount === "number" && Number.isFinite(state.assistantChannelCount)
          ? Math.round(state.assistantChannelCount)
          : undefined,
      channelNames: readStringList(state.assistantChannelNames, 30)
    };
  }
  if (type === "music") {
    return {
      query: readString(state.query),
      title: readString(state.title),
      artistName: readString(state.artistName)
    };
  }
  if (type === "countdown") {
    return {
      totalSeconds: typeof state.totalSeconds === "number" ? state.totalSeconds : undefined,
      remainingSeconds: typeof state.remainingSeconds === "number" ? state.remainingSeconds : undefined,
      running: typeof state.running === "boolean" ? state.running : undefined
    };
  }
  if (type === "todo") {
    return {
      itemCount: Array.isArray(state.items) ? state.items.length : undefined
    };
  }
  if (type === "note") {
    return {
      hasContent: Boolean(readString(state.content)),
      preview: readString(state.content)?.slice(0, 80)
    };
  }
  return undefined;
}

function compactWidget(widget: ContextSummarizerInput["widgets"][number], focusedWidgetId?: string) {
  return {
    widgetId: widget.widgetId,
    definitionId: widget.definitionId,
    type: widget.type,
    name: widget.name,
    order: widget.order,
    focused: widget.widgetId === focusedWidgetId || undefined,
    recent: undefined,
    position: widget.position,
    size: widget.size,
    state: summarizeWidgetState(widget.type, widget.state)
  };
}

export function createDesktopStateActions(getContextInput: () => ContextSummarizerInput): AssistantAction[] {
  const emptySchema = createStrictObjectSchema<EmptyArgs>({});
  return [
    {
      spec: {
        name: "assistant.get_desktop_state",
        description:
          "Read the current Xiaozhuoban desktop state, including active board, widget counts, focused widget, visible widgets, and TV channel catalog summary. Use this for status questions before answering.",
        parameters: emptySchema,
        argumentKeys: emptySchema.argumentKeys,
        resultSchema: { type: "object", additionalProperties: true },
        risk: "safe",
        scope: "desktop",
        idempotency: "idempotent",
        concurrencyKey: "assistant.state.read",
        examples: ["桌面上有多少个工具", "现在打开了哪些小工具", "当前电视是什么频道", "电视有哪些频道", "当前小工具是什么"]
      },
      execute() {
        const context = getContextInput();
        const widgetsByType = countWidgetsByType(context.widgets);
        const tvCatalog = context.moduleStates?.tv;
        return {
          status: "success",
          message: "已读取桌面状态",
          data: {
            board: {
              boardId: context.boardId,
              boardName: context.boardName,
              widgetCount: context.widgets.length,
              widgetsByType,
              focusedWidgetId: context.focusedWidgetId,
              viewport: context.viewport
            },
            boards: context.availableBoards,
            widgets: context.widgets.map((widget) => compactWidget(widget, context.focusedWidgetId)),
            definitions: context.availableDefinitions,
            tv: tvCatalog
              ? {
                  selectedChannelName: readString(tvCatalog.selectedChannelName),
                  channelCount:
                    typeof tvCatalog.assistantChannelCount === "number" && Number.isFinite(tvCatalog.assistantChannelCount)
                      ? Math.round(tvCatalog.assistantChannelCount)
                      : undefined,
                  channelNames: readStringList(tvCatalog.assistantChannelNames, 80),
                  updatedAt: readString(tvCatalog.updatedAt)
                }
              : undefined
          }
        };
      }
    }
  ];
}
