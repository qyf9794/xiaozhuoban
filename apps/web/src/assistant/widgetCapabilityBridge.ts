import {
  createPassthroughSchema,
  type AssistantAction,
  type AssistantActionContext,
  type AssistantToolResult
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";

export interface WidgetCapabilityStore {
  getWidgetInstances: () => WidgetInstance[];
  getWidgetDefinitions: () => WidgetDefinition[];
  updateWidgetState?: (widgetId: string, state: Record<string, unknown>) => Promise<void> | void;
}

export type WidgetCapabilityHandler = (
  args: Record<string, unknown>,
  context: AssistantActionContext
) => Promise<AssistantToolResult | void> | AssistantToolResult | void;

export type WidgetCapabilityMap = Record<string, WidgetCapabilityHandler>;

type WidgetCapabilityArgs = {
  query?: string;
  kind?: string;
  resultIndex?: number;
  channelName?: string;
  channelUrl?: string;
  recordingId?: string;
  text?: string;
  enabled?: boolean;
  followUp?: {
    name: string;
    arguments?: Record<string, unknown>;
  };
};

const CAPABILITY_WIDGET_TYPES = ["music", "tv", "recorder", "dialClock", "messageBoard"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasOptionalString(value: Record<string, unknown>, key: string) {
  return value[key] === undefined || typeof value[key] === "string";
}

function parseWith<T>(guard: (value: unknown) => value is T) {
  return createPassthroughSchema<T>(guard);
}

const genericCapabilitySchema = parseWith<WidgetCapabilityArgs>(
  (value): value is WidgetCapabilityArgs =>
    isRecord(value) &&
    hasOptionalString(value, "query") &&
    hasOptionalString(value, "kind") &&
    (value.resultIndex === undefined || typeof value.resultIndex === "number") &&
    hasOptionalString(value, "channelName") &&
    hasOptionalString(value, "channelUrl") &&
    hasOptionalString(value, "recordingId") &&
    hasOptionalString(value, "text") &&
    (value.enabled === undefined || typeof value.enabled === "boolean") &&
    (value.followUp === undefined ||
      (isRecord(value.followUp) &&
        typeof value.followUp.name === "string" &&
        (value.followUp.arguments === undefined || isRecord(value.followUp.arguments))))
);

function success(message: string, data?: unknown): AssistantToolResult {
  return { status: "success", message, data };
}

function failed(message: string, errorCode: string): AssistantToolResult {
  return { status: "failed", message, errorCode };
}

function defineAction<TArgs>(action: AssistantAction<TArgs>): AssistantAction<TArgs> {
  return action;
}

function isSuccess(result: AssistantToolResult) {
  return result.status === "success";
}

function getDefinition(store: WidgetCapabilityStore, widget: WidgetInstance) {
  return store.getWidgetDefinitions().find((item) => item.id === widget.definitionId);
}

function getTarget(
  store: WidgetCapabilityStore,
  context: AssistantActionContext,
  expectedType: string
): { widget: WidgetInstance; definition: WidgetDefinition } | AssistantToolResult {
  const targetId = context.target?.widgetId;
  if (!targetId) {
    return failed("需要先指定一个小工具", "TARGET_REQUIRED");
  }
  const widget = store.getWidgetInstances().find((item) => item.id === targetId);
  if (!widget) {
    return failed("没有找到这个小工具", "WIDGET_NOT_FOUND");
  }
  const definition = getDefinition(store, widget);
  if (!definition) {
    return failed("没有找到这个小工具定义", "WIDGET_DEFINITION_NOT_FOUND");
  }
  if (definition.type !== expectedType) {
    return failed(`这个操作只能用于${expectedType}小工具`, "WIDGET_TYPE_MISMATCH");
  }
  return { widget, definition };
}

function isToolResult(value: { widget: WidgetInstance; definition: WidgetDefinition } | AssistantToolResult): value is AssistantToolResult {
  return "status" in value;
}

async function patchWidgetState(store: WidgetCapabilityStore, widget: WidgetInstance, patch: Record<string, unknown>) {
  if (!store.updateWidgetState) return;
  await store.updateWidgetState(widget.id, { ...widget.state, ...patch });
}

export class WidgetCapabilityBridge {
  private readonly capabilitiesByWidgetId = new Map<string, WidgetCapabilityMap>();

  register(widgetId: string, capabilities: WidgetCapabilityMap): () => void {
    this.capabilitiesByWidgetId.set(widgetId, capabilities);
    return () => {
      if (this.capabilitiesByWidgetId.get(widgetId) === capabilities) {
        this.capabilitiesByWidgetId.delete(widgetId);
      }
    };
  }

  has(widgetId: string, capabilityName: string): boolean {
    return typeof this.capabilitiesByWidgetId.get(widgetId)?.[capabilityName] === "function";
  }

  async invoke(
    widgetId: string,
    capabilityName: string,
    args: Record<string, unknown>,
    context: AssistantActionContext
  ): Promise<AssistantToolResult> {
    const capabilities = this.capabilitiesByWidgetId.get(widgetId);
    if (!capabilities) {
      return failed("这个小工具还没有挂载，暂时不能执行该操作", "WIDGET_NOT_MOUNTED");
    }
    const handler = capabilities[capabilityName];
    if (!handler) {
      return failed("这个小工具暂不支持该操作", "WIDGET_CAPABILITY_UNAVAILABLE");
    }
    const result = await handler(args, context);
    return result ?? success("已执行小工具操作", { widgetId, capabilityName });
  }
}

async function invokeCapability(
  store: WidgetCapabilityStore,
  bridge: WidgetCapabilityBridge,
  context: AssistantActionContext,
  expectedType: string,
  capabilityName: string,
  args: WidgetCapabilityArgs,
  message: string,
  statePatch?: Record<string, unknown>
): Promise<AssistantToolResult> {
  const target = getTarget(store, context, expectedType);
  if (isToolResult(target)) return target;
  const result = await bridge.invoke(target.widget.id, capabilityName, args as Record<string, unknown>, context);
  if (isSuccess(result) && statePatch) {
    await patchWidgetState(store, target.widget, statePatch);
  }
  if (result.message === "已执行小工具操作") {
    return success(message, { widgetId: target.widget.id, capabilityName });
  }
  return result;
}

function createMusicActions(store: WidgetCapabilityStore, bridge: WidgetCapabilityBridge): Array<AssistantAction<WidgetCapabilityArgs>> {
  return [
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "music.search",
        description: "Search music without starting playback.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      },
      execute(args, context) {
        const patch = args.query?.trim() ? { query: args.query.trim() } : undefined;
        return invokeCapability(store, bridge, context, "music", "search", args, "已搜索音乐", patch);
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "music.play",
        description: "Play music, optionally searching by query first.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      },
      execute(args, context) {
        const patch = args.query?.trim() ? { query: args.query.trim() } : undefined;
        return invokeCapability(store, bridge, context, "music", "play", args, "已开始播放音乐", patch);
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "music.pause",
        description: "Pause the current music widget playback.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "music", "pause", args, "已暂停音乐");
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "music.resume",
        description: "Resume music widget playback.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "music", "resume", args, "已继续播放音乐");
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "music.next",
        description: "Play the next music result.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "music", "next", args, "已切到下一首");
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "music.previous",
        description: "Play the previous music result.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "music",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "music", "previous", args, "已切到上一首");
      }
    })
  ];
}

function createTvActions(store: WidgetCapabilityStore, bridge: WidgetCapabilityBridge): Array<AssistantAction<WidgetCapabilityArgs>> {
  return [
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "tv.play",
        description: "Play TV, optionally selecting a channel.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "tv",
        requiresTarget: true
      },
      execute(args, context) {
        const patch = args.channelName?.trim()
          ? { selectedChannelName: args.channelName.trim(), ...(args.channelUrl?.trim() ? { selectedChannelUrl: args.channelUrl.trim() } : {}) }
          : undefined;
        return invokeCapability(store, bridge, context, "tv", "play", args, "已播放电视", patch);
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "tv.pause",
        description: "Pause TV playback.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "tv",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "tv", "pause", args, "已暂停电视");
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "tv.fullscreen",
        description: "Enter fullscreen for TV playback.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "tv",
        requiresTarget: true
      },
      async execute(args, context) {
        const target = getTarget(store, context, "tv");
        if (isToolResult(target)) return target;
        try {
          const result = await bridge.invoke(target.widget.id, "fullscreen", args as Record<string, unknown>, context);
          if (result.message === "已执行小工具操作") {
            return success("已全屏电视", { widgetId: target.widget.id, capabilityName: "fullscreen" });
          }
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/permission|gesture|fullscreen/i.test(message)) {
            return success("已打开电视，浏览器阻止了原生全屏", {
              widgetId: target.widget.id,
              capabilityName: "fullscreen",
              nativeFullscreenBlocked: true
            });
          }
          throw error;
        }
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "tv.select_channel",
        description: "Select a TV channel by name or URL.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "tv",
        requiresTarget: true
      },
      execute(args, context) {
        const patch = {
          ...(args.channelName?.trim() ? { selectedChannelName: args.channelName.trim() } : {}),
          ...(args.channelUrl?.trim() ? { selectedChannelUrl: args.channelUrl.trim() } : {})
        };
        return invokeCapability(store, bridge, context, "tv", "selectChannel", args, "已切换电视频道", patch);
      }
    })
  ];
}

function createRecorderActions(store: WidgetCapabilityStore, bridge: WidgetCapabilityBridge): Array<AssistantAction<WidgetCapabilityArgs>> {
  return [
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "recorder.start",
        description: "Start recording audio.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "recorder",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "recorder", "start", args, "已开始录音", { recording: true, recordError: "" });
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "recorder.stop",
        description: "Stop recording audio.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "recorder",
        requiresTarget: true
	      },
	      async execute(args, context) {
	        const target = getTarget(store, context, "recorder");
	        if (isToolResult(target)) return target;
	        const result = await bridge.invoke(target.widget.id, "stop", args as Record<string, unknown>, context);
	        const hasRecordingId = isRecord(result.data) && typeof result.data.recordingId === "string";
	        if (isSuccess(result) && !hasRecordingId) {
	          await patchWidgetState(store, target.widget, { recording: false });
	        }
	        if (result.message === "已执行小工具操作") {
	          return success("已停止录音", { widgetId: target.widget.id, capabilityName: "stop" });
	        }
	        return result;
	      }
	    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "recorder.play",
        description: "Play a recorder item.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "recorder",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "recorder", "play", args, "已播放录音");
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "recorder.pause",
        description: "Pause recorder playback.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "recorder",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "recorder", "pause", args, "已暂停录音");
      }
    })
  ];
}

function createDialClockActions(store: WidgetCapabilityStore, bridge: WidgetCapabilityBridge): Array<AssistantAction<WidgetCapabilityArgs>> {
  return [
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "dialClock.set_night_mode",
        description: "Turn dial clock night mode on or off.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "dialClock",
        requiresTarget: true
      },
      execute(args, context) {
        const enabled = args.enabled !== false;
        return invokeCapability(store, bridge, context, "dialClock", "setNightMode", { ...args, enabled }, "已切换时钟夜间模式", {
          nightMode: enabled
        });
      }
    })
  ];
}

function createMessageBoardActions(store: WidgetCapabilityStore, bridge: WidgetCapabilityBridge): Array<AssistantAction<WidgetCapabilityArgs>> {
  return [
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "messageBoard.send",
        description: "Send a message to the message board widget.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "messageBoard",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "messageBoard", "send", args, "已发送留言");
      }
    }),
    defineAction<WidgetCapabilityArgs>({
      spec: {
        name: "messageBoard.clear_draft",
        description: "Clear the message board input draft without sending a message or deleting history.",
        parameters: genericCapabilitySchema,
        risk: "safe",
        scope: "widget-detail",
        widgetType: "messageBoard",
        requiresTarget: true
      },
      execute(args, context) {
        return invokeCapability(store, bridge, context, "messageBoard", "clearDraft", args, "已清空留言输入框");
      }
    })
  ];
}

export function createWidgetCapabilityActions(
  store: WidgetCapabilityStore,
  bridge: WidgetCapabilityBridge
): Array<AssistantAction<any>> {
  const allowedTypes = new Set<string>(CAPABILITY_WIDGET_TYPES);
  return [
    ...createMusicActions(store, bridge),
    ...createTvActions(store, bridge),
    ...createRecorderActions(store, bridge),
    ...createDialClockActions(store, bridge),
    ...createMessageBoardActions(store, bridge)
  ].filter((action) => {
    const type = action.spec.widgetType;
    return Boolean(type && allowedTypes.has(type));
  });
}
