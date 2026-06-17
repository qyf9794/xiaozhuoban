import {
  ActionRegistry,
  createPassthroughSchema,
  type AssistantAction,
  type AssistantToolResult
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import { clampTvWidgetSize } from "../widgets/tvShared";

type AssistantStorePersistOptions = { operationId?: string };
type AddWidgetArgs = {
  definitionId: string;
  mobileMode?: boolean;
  followUp?: {
    name: string;
    arguments?: Record<string, unknown>;
  };
};
type WidgetIdArgs = { widgetId: string };
type MoveWidgetArgs = WidgetIdArgs & { x: number; y: number };
type ResizeWidgetArgs = WidgetIdArgs & { w: number; h: number };
type AutoAlignArgs = { viewportWidth?: number; mobileMode?: boolean };
type SwitchBoardArgs = { boardId: string };
type CreateBoardArgs = { name?: string };
type RenameBoardArgs = { boardId: string; name: string };

export interface BoardActionStore {
  getWidgetInstances: () => WidgetInstance[];
  getWidgetDefinitions: () => WidgetDefinition[];
  addWidgetInstance: (
    definitionId: string,
    options?: { mobileMode?: boolean; operationId?: string }
  ) => Promise<WidgetInstance | undefined | void> | WidgetInstance | undefined | void;
  removeWidgetInstance: (widgetId: string, options?: AssistantStorePersistOptions) => Promise<void> | void;
  updateWidgetPosition: (widgetId: string, x: number, y: number, options?: AssistantStorePersistOptions) => Promise<void> | void;
  updateWidgetSize: (widgetId: string, w: number, h: number, options?: AssistantStorePersistOptions) => Promise<void> | void;
  focusWidget?: (widgetId: string, options?: AssistantStorePersistOptions) => Promise<void> | void;
  fullscreenWidget?: (widgetId: string, options?: AssistantStorePersistOptions) => Promise<void> | void;
  bringWidgetToFront?: (widgetId: string, options?: AssistantStorePersistOptions) => Promise<void> | void;
  autoAlignWidgets: (viewportWidth: number, options?: { mobileMode?: boolean; operationId?: string }) => Promise<void> | void;
  setActiveBoard: (boardId: string) => Promise<void> | void;
  addBoard: (name?: string, options?: AssistantStorePersistOptions) => Promise<void> | void;
  renameBoard: (boardId: string, name: string, options?: AssistantStorePersistOptions) => Promise<void> | void;
}

export interface WidgetSizePolicy {
  resizable: boolean;
  reason?: string;
  clamp?: (w: number, h: number) => { w: number; h: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" && value[key].trim().length > 0;
}

function hasNumber(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "number" && Number.isFinite(value[key]);
}

function parseWith<T>(guard: (value: unknown) => value is T) {
  return createPassthroughSchema<T>(guard);
}

const addWidgetSchema = parseWith<AddWidgetArgs>(
  (value): value is AddWidgetArgs =>
    isRecord(value) &&
    hasString(value, "definitionId") &&
    (value.mobileMode === undefined || typeof value.mobileMode === "boolean") &&
    (value.followUp === undefined ||
      (isRecord(value.followUp) &&
        hasString(value.followUp, "name") &&
        (value.followUp.arguments === undefined || isRecord(value.followUp.arguments))))
);

const widgetIdSchema = parseWith<WidgetIdArgs>(
  (value): value is WidgetIdArgs => isRecord(value) && hasString(value, "widgetId")
);

const moveWidgetSchema = parseWith<MoveWidgetArgs>(
  (value): value is MoveWidgetArgs =>
    isRecord(value) && hasString(value, "widgetId") && hasNumber(value, "x") && hasNumber(value, "y")
);

const resizeWidgetSchema = parseWith<ResizeWidgetArgs>(
  (value): value is ResizeWidgetArgs =>
    isRecord(value) && hasString(value, "widgetId") && hasNumber(value, "w") && hasNumber(value, "h")
);

const autoAlignSchema = parseWith<AutoAlignArgs>(
  (value): value is AutoAlignArgs =>
    isRecord(value) &&
    (value.viewportWidth === undefined || hasNumber(value, "viewportWidth")) &&
    (value.mobileMode === undefined || typeof value.mobileMode === "boolean")
);

const switchBoardSchema = parseWith<SwitchBoardArgs>(
  (value): value is SwitchBoardArgs => isRecord(value) && hasString(value, "boardId")
);

const createBoardSchema = parseWith<CreateBoardArgs>(
  (value): value is CreateBoardArgs => isRecord(value) && (value.name === undefined || typeof value.name === "string")
);

const renameBoardSchema = parseWith<RenameBoardArgs>(
  (value): value is RenameBoardArgs => isRecord(value) && hasString(value, "boardId") && hasString(value, "name")
);

export function getWidgetSizePolicy(definitionType: string): WidgetSizePolicy {
  if (definitionType === "tv") {
    return {
      resizable: true,
      clamp: clampTvWidgetSize
    };
  }

  return {
    resizable: false,
    reason: "这个小工具的面板大小是固定的，不能调整"
  };
}

function success(message: string, data?: unknown): AssistantToolResult {
  return { status: "success", message, data };
}

function failed(message: string, errorCode: string): AssistantToolResult {
  return { status: "failed", message, errorCode };
}

function defineAction<TArgs>(action: AssistantAction<TArgs>): AssistantAction<TArgs> {
  return action;
}

function findWidget(store: BoardActionStore, widgetId: string) {
  const widget = store.getWidgetInstances().find((item) => item.id === widgetId);
  if (!widget) {
    return null;
  }
  const definition = store.getWidgetDefinitions().find((item) => item.id === widget.definitionId);
  return { widget, definition };
}

function persistOptions(context: { operationId?: string }): AssistantStorePersistOptions | undefined {
  return context.operationId ? { operationId: context.operationId } : undefined;
}

async function callMaybeWithOptions(
  fn: ((...args: any[]) => Promise<void> | void) | undefined,
  args: unknown[],
  options?: AssistantStorePersistOptions
) {
  if (!fn) return;
  if (options) {
    await fn(...args, options);
    return;
  }
  await fn(...args);
}

function boardActions(store: BoardActionStore): Array<AssistantAction<any>> {
  const actions = [
    defineAction<AddWidgetArgs>({
      spec: {
        name: "board.add_widget",
        description: "Add an existing widget definition to the current board.",
        parameters: addWidgetSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        const widget = await store.addWidgetInstance(args.definitionId, {
          mobileMode: args.mobileMode,
          ...(context.operationId ? { operationId: context.operationId } : {})
        });
        const definition = store.getWidgetDefinitions().find((item) => item.id === args.definitionId);
        return success("已添加小工具", {
          definitionId: args.definitionId,
          widgetId: widget?.id,
          widgetType: definition?.type
        });
      }
    }),
    defineAction<WidgetIdArgs>({
      spec: {
        name: "widget.focus",
        description: "Focus an existing widget on the current board.",
        parameters: widgetIdSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        const target = findWidget(store, args.widgetId);
        if (!target) {
          return failed("没有找到这个小工具", "WIDGET_NOT_FOUND");
        }
        await callMaybeWithOptions(store.focusWidget, [args.widgetId], persistOptions(context));
        return success("已聚焦小工具", { widgetId: args.widgetId, widgetType: target.definition?.type });
      }
    }),
    defineAction<WidgetIdArgs>({
      spec: {
        name: "widget.fullscreen_focus",
        description: "Enter fullscreen focus for an existing widget when supported.",
        parameters: widgetIdSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        const target = findWidget(store, args.widgetId);
        if (!target) {
          return failed("没有找到这个小工具", "WIDGET_NOT_FOUND");
        }
        if (!store.fullscreenWidget) {
          return failed("当前环境还不能全屏聚焦小工具", "FULLSCREEN_UNAVAILABLE");
        }
        await callMaybeWithOptions(store.fullscreenWidget, [args.widgetId], persistOptions(context));
        return success("已全屏聚焦小工具", { widgetId: args.widgetId, widgetType: target.definition?.type });
      }
    }),
    defineAction<WidgetIdArgs>({
      spec: {
        name: "widget.remove",
        description: "Close a widget window on the current board.",
        parameters: widgetIdSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        await callMaybeWithOptions(store.removeWidgetInstance, [args.widgetId], persistOptions(context));
        return success("已删除小工具", { widgetId: args.widgetId });
      }
    }),
    defineAction<MoveWidgetArgs>({
      spec: {
        name: "widget.move",
        description: "Move a widget to a new board position.",
        parameters: moveWidgetSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        await callMaybeWithOptions(
          store.updateWidgetPosition,
          [args.widgetId, Math.round(args.x), Math.round(args.y)],
          persistOptions(context)
        );
        return success("已移动小工具", { widgetId: args.widgetId, x: Math.round(args.x), y: Math.round(args.y) });
      }
    }),
    defineAction<ResizeWidgetArgs>({
      spec: {
        name: "widget.resize",
        description: "Resize a widget only when its existing panel supports resizing.",
        parameters: resizeWidgetSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        const target = findWidget(store, args.widgetId);
        if (!target) {
          return failed("没有找到这个小工具", "WIDGET_NOT_FOUND");
        }

        const policy = getWidgetSizePolicy(target.definition?.type ?? "");
        if (!policy.resizable) {
          return failed(policy.reason ?? "这个小工具不能调整大小", "WIDGET_SIZE_FIXED");
        }

        const size = policy.clamp ? policy.clamp(args.w, args.h) : { w: Math.round(args.w), h: Math.round(args.h) };
        await callMaybeWithOptions(store.updateWidgetSize, [args.widgetId, size.w, size.h], persistOptions(context));
        return success("已调整小工具大小", { widgetId: args.widgetId, size });
      }
    }),
    defineAction<WidgetIdArgs>({
      spec: {
        name: "widget.bring_to_front",
        description: "Bring a widget to the front if the store supports layer changes.",
        parameters: widgetIdSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        if (!store.bringWidgetToFront) {
          return failed("当前版本还不能调整小工具层级", "BRING_TO_FRONT_UNAVAILABLE");
        }
        await callMaybeWithOptions(store.bringWidgetToFront, [args.widgetId], persistOptions(context));
        return success("已置顶小工具", { widgetId: args.widgetId });
      }
    }),
    defineAction<AutoAlignArgs>({
      spec: {
        name: "board.auto_align",
        description: "Auto-align widgets on the current board.",
        parameters: autoAlignSchema,
        risk: "confirm",
        scope: "desktop"
      },
      async execute(args, context) {
        await store.autoAlignWidgets(args.viewportWidth ?? 0, {
          mobileMode: args.mobileMode,
          ...(context.operationId ? { operationId: context.operationId } : {})
        });
        return success("已整理桌面小工具");
      }
    }),
    defineAction<SwitchBoardArgs>({
      spec: {
        name: "board.switch",
        description: "Switch to another board.",
        parameters: switchBoardSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args) {
        await store.setActiveBoard(args.boardId);
        return success("已切换桌板", { boardId: args.boardId });
      }
    }),
    defineAction<CreateBoardArgs>({
      spec: {
        name: "board.create",
        description: "Create a new board.",
        parameters: createBoardSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        await callMaybeWithOptions(store.addBoard, [args.name], persistOptions(context));
        return success("已新建桌板", { name: args.name });
      }
    }),
    defineAction<RenameBoardArgs>({
      spec: {
        name: "board.rename",
        description: "Rename an existing board.",
        parameters: renameBoardSchema,
        risk: "safe",
        scope: "desktop"
      },
      async execute(args, context) {
        await callMaybeWithOptions(store.renameBoard, [args.boardId, args.name.trim()], persistOptions(context));
        return success("已重命名桌板", { boardId: args.boardId, name: args.name.trim() });
      }
    })
  ];
  return actions as Array<AssistantAction<any>>;
}

export function registerBoardActions(registry: ActionRegistry, store: BoardActionStore): Array<AssistantAction<any>> {
  const actions = boardActions(store);
  actions.forEach((action) => registry.register(action));
  return actions;
}
