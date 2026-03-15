import { create } from "zustand";
import {
  createId,
  nowIso,
  type Board,
  type WidgetDefinition,
  type WidgetInstance,
  type Workspace
} from "@xiaozhuoban/domain";
import { DexieRepository, InMemoryRepository, type AppRepository } from "@xiaozhuoban/data";
import { LocalTemplateAIBuilder } from "@xiaozhuoban/ai-builder";
import { DEFAULT_TV_PLAYLIST_URL, clampTvWidgetSize } from "./widgets/tvShared";
import { DEFAULT_WORLD_CLOCK_ZONES } from "./widgets/worldClockShared";

const defaultWorkspaceName = "默认工作空间";
const defaultBoardName = "我的桌板";
let initializingPromise: Promise<void> | null = null;

const baseWidgets: Array<Omit<WidgetDefinition, "id" | "createdAt" | "updatedAt">> = [
  {
    kind: "system",
    type: "note",
    name: "便签",
    version: 1,
    description: "Markdown/富文本便签",
    inputSchema: { fields: [{ key: "content", label: "内容", type: "textarea" }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "todo",
    name: "待办",
    version: 1,
    description: "支持子任务的待办清单",
    inputSchema: { fields: [{ key: "text", label: "任务", type: "text", validation: { required: true } }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "calculator",
    name: "计算器",
    version: 1,
    inputSchema: {
      fields: [
        { key: "a", label: "A", type: "number" },
        { key: "b", label: "B", type: "number" }
      ]
    },
    outputSchema: { fields: [{ key: "sum", label: "和", type: "number" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {
      derived: [{ target: "sum", expression: "count_filled" }]
    },
    storagePolicy: { strategy: "ephemeral" }
  },
  {
    kind: "system",
    type: "countdown",
    name: "倒计时",
    version: 1,
    inputSchema: { fields: [{ key: "target", label: "目标时间", type: "date" }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "weather",
    name: "天气",
    version: 1,
    inputSchema: { fields: [{ key: "city", label: "城市", type: "text", defaultValue: "Shanghai" }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "headline",
    name: "重大新闻",
    version: 1,
    description: "实时热点新闻",
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ key: "items", label: "新闻", type: "text" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "market",
    name: "全球指数",
    version: 1,
    description: "实时全球指数与走势",
    inputSchema: { fields: [{ key: "indexCode", label: "指数", type: "select" }] },
    outputSchema: { fields: [{ key: "series", label: "走势", type: "text" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "music",
    name: "音乐播放器",
    version: 1,
    inputSchema: { fields: [{ key: "playlistUrl", label: "播放列表链接", type: "text" }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "tv",
    name: "电视播放",
    version: 1,
    description: "订阅 m3u 直播源并按频道播放",
    inputSchema: {
      fields: [{ key: "playlistUrl", label: "直播订阅链接", type: "text", defaultValue: DEFAULT_TV_PLAYLIST_URL }]
    },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "worldClock",
    name: "世界时钟",
    version: 1,
    description: "显示中国与世界主要城市的数字时钟",
    inputSchema: {
      fields: [{ key: "zones", label: "时区列表", type: "text", defaultValue: DEFAULT_WORLD_CLOCK_ZONES.join(",") }]
    },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "translate",
    name: "快速翻译",
    version: 1,
    description: "中英快速互译",
    inputSchema: {
      fields: [
        { key: "sourceText", label: "原文", type: "textarea" },
        { key: "sourceLang", label: "源语言", type: "select", options: ["自动", "中文", "英文"] },
        { key: "targetLang", label: "目标语言", type: "select", options: ["中文", "英文"] }
      ]
    },
    outputSchema: { fields: [{ key: "translatedText", label: "译文", type: "textarea" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "clipboard",
    name: "剪贴板历史",
    version: 1,
    description: "记录最近复制文本",
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ key: "items", label: "历史", type: "textarea" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "converter",
    name: "单位换算",
    version: 1,
    description: "长度/重量/温度换算",
    inputSchema: {
      fields: [
        { key: "category", label: "类别", type: "select", options: ["长度", "重量", "温度"] },
        { key: "value", label: "数值", type: "number" }
      ]
    },
    outputSchema: { fields: [{ key: "result", label: "结果", type: "text" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "recorder",
    name: "录音机",
    version: 1,
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "messageBoard",
    name: "留言板",
    version: 1,
    description: "在线用户可实时同步留言",
    inputSchema: { fields: [{ key: "message", label: "留言内容", type: "textarea" }] },
    outputSchema: { fields: [{ key: "messages", label: "留言列表", type: "textarea" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "gomoku",
    name: "五子棋",
    version: 1,
    description: "轻量五子棋，支持人机与在线对战",
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  }
];

interface AppState {
  ready: boolean;
  repository: AppRepository;
  aiBuilder: LocalTemplateAIBuilder;
  boards: Board[];
  widgetDefinitions: WidgetDefinition[];
  widgetInstances: WidgetInstance[];
  activeBoardId?: string;
  commandPaletteOpen: boolean;
  aiDialogOpen: boolean;
  setRepository: (repository: AppRepository) => void;
  initialize: () => Promise<void>;
  toggleLayoutMode: () => Promise<void>;
  addBoard: (name?: string) => Promise<void>;
  renameBoard: (boardId: string, name: string) => Promise<void>;
  deleteBoard: (boardId: string) => Promise<void>;
  setBoardWallpaper: (imageDataUrl: string) => Promise<void>;
  setActiveBoard: (boardId: string) => Promise<void>;
  addWidgetInstance: (definitionId: string, options?: { mobileMode?: boolean }) => Promise<void>;
  removeWidgetInstance: (widgetId: string) => Promise<void>;
  updateWidgetPosition: (widgetId: string, x: number, y: number) => Promise<void>;
  updateWidgetSize: (widgetId: string, w: number, h: number) => Promise<void>;
  updateWidgetState: (widgetId: string, state: Record<string, unknown>) => Promise<void>;
  autoAlignWidgets: (viewportWidth: number, options?: { mobileMode?: boolean }) => Promise<void>;
  setCommandPaletteOpen: (open: boolean) => void;
  setAiDialogOpen: (open: boolean) => void;
  generateAiWidget: (prompt: string, options?: { mobileMode?: boolean }) => Promise<void>;
  createBackupSnapshot: () => Promise<Record<string, unknown>>;
  importBackupSnapshot: (snapshot: unknown, backupName?: string) => Promise<void>;
}

interface BackupSnapshotPayload {
  workspaces: Workspace[];
  boards: Board[];
  widgetDefinitions: WidgetDefinition[];
  widgetsByBoard: Record<string, WidgetInstance[]>;
}

const MOBILE_STACK_MARGIN = 20;
const MOBILE_STACK_GAP = 16;
const DEFAULT_BOARD_WIDGET_OFFSET = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function persistInBackground(task: Promise<void>, label: string) {
  void task.catch((error) => {
    console.error(`[store] ${label} failed`, error);
  });
}

function parseBackupSnapshot(value: unknown): BackupSnapshotPayload | null {
  if (!isRecord(value)) return null;
  const workspaces = Array.isArray(value.workspaces) ? (value.workspaces as Workspace[]) : null;
  const boards = Array.isArray(value.boards) ? (value.boards as Board[]) : null;
  const widgetDefinitions = Array.isArray(value.widgetDefinitions)
    ? (value.widgetDefinitions as WidgetDefinition[])
    : null;
  const widgetsByBoard = isRecord(value.widgetsByBoard)
    ? (value.widgetsByBoard as Record<string, WidgetInstance[]>)
    : null;
  if (!workspaces || !boards || !widgetDefinitions || !widgetsByBoard) {
    return null;
  }
  if (workspaces.length === 0 || boards.length === 0) {
    return null;
  }
  return {
    workspaces,
    boards,
    widgetDefinitions,
    widgetsByBoard
  };
}

function createRepository(): AppRepository {
  try {
    if (typeof window !== "undefined" && "indexedDB" in window) {
      return new DexieRepository();
    }
    return new InMemoryRepository();
  } catch {
    return new InMemoryRepository();
  }
}

function makeWorkspace(name = defaultWorkspaceName): Workspace {
  const now = nowIso();
  return {
    id: createId("ws"),
    name,
    theme: "light",
    permissions: {
      editable: true,
      shareable: false
    },
    createdAt: now,
    updatedAt: now
  };
}

function makeBoard(workspaceId: string, name = defaultBoardName): Board {
  const now = nowIso();
  return {
    id: createId("board"),
    workspaceId,
    name,
    layoutMode: "free",
    zoom: 1,
    locked: false,
    background: {
      type: "color",
      value: "#e8ebf0"
    },
    createdAt: now,
    updatedAt: now
  };
}

function getDefaultWidgetSize(type?: string): { w: number; h: number } {
  if (type === "tv") {
    return { w: 240, h: 480 };
  }
  if (type === "gomoku") {
    return { w: 498, h: 640 };
  }
  if (type === "worldClock") {
    return { w: 240, h: 240 };
  }
  if (type === "headline") {
    return { w: 240, h: 320 };
  }
  if (type === "messageBoard") {
    return { w: 240, h: 500 };
  }
  return { w: 240, h: 180 };
}

function buildDefinitionTypeMap(definitions: WidgetDefinition[]) {
  return new Map(definitions.map((item) => [item.id, item.type]));
}

function safeWidgetWidth(widget: WidgetInstance, definitionType?: string) {
  const normalized = Math.max(120, Number(widget.size.w) || 240);
  return definitionType === "tv" ? clampTvWidgetSize(normalized, 480).w : normalized;
}

function safeWidgetHeight(widget: WidgetInstance, definitionType?: string) {
  if (definitionType === "tv") {
    return 480;
  }
  if (definitionType === "messageBoard") {
    return 500;
  }
  if (definitionType === "gomoku") {
    return Math.max(560, Number(widget.size.h) || 640);
  }
  return Math.max(90, Number(widget.size.h) || 180);
}

function normalizeWidgetInstanceSize(widget: WidgetInstance, definitionType?: string): WidgetInstance {
  if (definitionType !== "messageBoard") {
    return widget;
  }
  const nextWidth = safeWidgetWidth(widget, definitionType);
  const nextHeight = safeWidgetHeight(widget, definitionType);
  if (widget.size.w === nextWidth && widget.size.h === nextHeight) {
    return widget;
  }
  return {
    ...widget,
    size: {
      w: nextWidth,
      h: nextHeight
    },
    updatedAt: nowIso()
  };
}

function normalizeWidgetInstances(
  widgets: WidgetInstance[],
  definitionTypeById: Map<string, string>
): { items: WidgetInstance[]; changed: WidgetInstance[] } {
  const items = widgets.map((widget) => normalizeWidgetInstanceSize(widget, definitionTypeById.get(widget.definitionId)));
  const changed = items.filter((item, index) => item !== widgets[index]);
  return { items, changed };
}

export function toCanvasContentPosition(
  rect: { top: number; left: number },
  canvas: { top: number; left: number; scrollTop: number; scrollLeft: number; paddingTop: number; paddingLeft: number }
) {
  return {
    top: rect.top - canvas.top + canvas.scrollTop - canvas.paddingTop,
    left: rect.left - canvas.left + canvas.scrollLeft - canvas.paddingLeft
  };
}

function measureWidgetLayout(
  widgets: WidgetInstance[],
  definitionTypeById: Map<string, string>
): Map<string, { top: number; left: number; height: number }> {
  if (typeof document === "undefined") {
    return new Map();
  }

  return new Map(
    widgets.map((item) => {
      const element = document.querySelector<HTMLElement>(`.widget-box[data-widget-id="${item.id}"]`);
      const canvas = element?.closest<HTMLElement>(".board-canvas");
      const rect = element?.getBoundingClientRect();
      const card = element?.querySelector<HTMLElement>("section");
      const cardRect = card?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      const canvasStyles = canvas ? window.getComputedStyle(canvas) : null;
      const canvasPaddingTop = canvasStyles ? Number.parseFloat(canvasStyles.paddingTop) || 0 : 0;
      const canvasPaddingLeft = canvasStyles ? Number.parseFloat(canvasStyles.paddingLeft) || 0 : 0;
      const canvasPosition =
        rect && canvasRect && canvas
          ? toCanvasContentPosition(
              { top: rect.top, left: rect.left },
              {
                top: canvasRect.top,
                left: canvasRect.left,
                scrollTop: canvas.scrollTop,
                scrollLeft: canvas.scrollLeft,
                paddingTop: canvasPaddingTop,
                paddingLeft: canvasPaddingLeft
              }
            )
          : null;
      const top =
        canvasPosition?.top ?? item.position.y;
      const left =
        canvasPosition?.left ?? item.position.x;
      const renderedHeight = Math.max(rect?.height ?? 0, cardRect?.height ?? 0);
      const height = renderedHeight > 0 ? renderedHeight : safeWidgetHeight(item, definitionTypeById.get(item.definitionId));
      return [item.id, { top, left, height }];
    })
  );
}

function getNextMobileWidgetPosition(
  widgets: WidgetInstance[],
  definitionTypeById: Map<string, string>
): { x: number; y: number } {
  if (widgets.length === 0) {
    return { x: MOBILE_STACK_MARGIN, y: MOBILE_STACK_MARGIN };
  }

  const measured = measureWidgetLayout(widgets, definitionTypeById);
  const maxBottom = widgets.reduce((currentMax, item) => {
    const layout = measured.get(item.id);
    const height = layout?.height ?? safeWidgetHeight(item, definitionTypeById.get(item.definitionId));
    const top = layout?.top ?? item.position.y;
    return Math.max(currentMax, top + height);
  }, MOBILE_STACK_MARGIN - MOBILE_STACK_GAP);

  return {
    x: MOBILE_STACK_MARGIN,
    y: Math.round(maxBottom + MOBILE_STACK_GAP)
  };
}

function createDefaultMessageBoardInstance(
  boardId: string,
  definitionId: string,
  zIndex = 1
): WidgetInstance {
  const now = nowIso();
  return {
    id: createId("wi"),
    boardId,
    definitionId,
    state: {},
    bindings: [],
    position: { x: DEFAULT_BOARD_WIDGET_OFFSET, y: DEFAULT_BOARD_WIDGET_OFFSET },
    size: { w: 240, h: 500 },
    zIndex,
    locked: false,
    createdAt: now,
    updatedAt: now
  };
}

export function createDefaultBoardWidgets(boardId: string, definitions: WidgetDefinition[]): WidgetInstance[] {
  const messageBoardDef = definitions.find((item) => item.kind === "system" && item.type === "messageBoard");
  if (!messageBoardDef) {
    return [];
  }
  return [createDefaultMessageBoardInstance(boardId, messageBoardDef.id)];
}

async function ensureBoardDefaultWidgets(
  repository: AppRepository,
  boardId: string,
  definitions: WidgetDefinition[],
  widgetInstances: WidgetInstance[]
): Promise<WidgetInstance[]> {
  if (widgetInstances.length > 0) {
    return widgetInstances;
  }
  const defaultWidgets = createDefaultBoardWidgets(boardId, definitions);
  if (defaultWidgets.length === 0) {
    return widgetInstances;
  }
  await repository.upsertInstances(defaultWidgets);
  return defaultWidgets;
}

async function persistBoardWithWidgets(
  repository: AppRepository,
  board: Board,
  widgetInstances: WidgetInstance[]
): Promise<void> {
  await repository.upsertBoard(board);
  if (widgetInstances.length > 0) {
    await repository.upsertInstances(widgetInstances);
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  repository: createRepository(),
  aiBuilder: new LocalTemplateAIBuilder(),
  boards: [],
  widgetDefinitions: [],
  widgetInstances: [],
  commandPaletteOpen: false,
  aiDialogOpen: false,
  setRepository(repository) {
    initializingPromise = null;
    set({
      repository,
      ready: false,
      boards: [],
      widgetDefinitions: [],
      widgetInstances: [],
      activeBoardId: undefined,
      commandPaletteOpen: false,
      aiDialogOpen: false
    });
  },
  async initialize() {
    if (initializingPromise) {
      await initializingPromise;
      return;
    }

    initializingPromise = (async () => {
      const { repository } = get();
      let workspaces = await repository.list();

      if (workspaces.length === 0) {
        const workspace = makeWorkspace();
        await repository.upsertWorkspace(workspace);
        workspaces = [workspace];
      }

      const workspaceId = workspaces[0].id;
      let boards = await repository.listByWorkspace(workspaceId);

      if (boards.length === 0) {
        const board = makeBoard(workspaceId);
        await repository.upsertBoard(board);
        boards = [board];
      }

      const boardId = boards[0].id;
      let [definitions, widgetInstances] = await Promise.all([
        repository.listDefinitions(),
        repository.listByBoard(boardId)
      ]);
      const now = nowIso();
      const systemTypes = new Set(definitions.filter((d) => d.kind === "system").map((d) => d.type));
      const missingBase = baseWidgets.filter((widget) => !systemTypes.has(widget.type));
      if (definitions.length === 0 || missingBase.length > 0) {
        const toInsert = (definitions.length === 0 ? baseWidgets : missingBase).map((item) => ({
          ...item,
          id: createId(`wd_${item.type}`),
          createdAt: now,
          updatedAt: now
        }));
        await Promise.all(toInsert.map((definition) => repository.upsertDefinition(definition)));
        definitions = await repository.listDefinitions();
      }
      if (widgetInstances.length === 0) {
        widgetInstances = await ensureBoardDefaultWidgets(repository, boardId, definitions, widgetInstances);
      }
      const definitionTypeById = buildDefinitionTypeMap(definitions);
      const normalizedWidgets = normalizeWidgetInstances(widgetInstances, definitionTypeById);
      widgetInstances = normalizedWidgets.items;
      if (normalizedWidgets.changed.length > 0) {
        await repository.upsertInstances(normalizedWidgets.changed);
      }

      set({
        ready: true,
        boards,
        widgetDefinitions: definitions,
        widgetInstances,
        activeBoardId: boardId
      });
    })();

    try {
      await initializingPromise;
    } finally {
      initializingPromise = null;
    }
  },
  async toggleLayoutMode() {
    const { boards, activeBoardId, repository } = get();
    const target = boards.find((board) => board.id === activeBoardId);
    if (!target || target.layoutMode === "free") {
      return;
    }
    const next: Board = {
      ...target,
      layoutMode: "free",
      updatedAt: nowIso()
    };
    await repository.upsertBoard(next);
    set({ boards: boards.map((board) => (board.id === target.id ? next : board)) });
  },
  async addBoard(name = "新桌板") {
    const { repository, boards, widgetDefinitions } = get();
    const workspaceId = boards[0]?.workspaceId ?? (await repository.list())[0]?.id;
    if (!workspaceId) return;
    const board = makeBoard(workspaceId, name);
    const defaultWidgets = createDefaultBoardWidgets(board.id, widgetDefinitions);
    set({ boards: [...boards, board], activeBoardId: board.id, widgetInstances: defaultWidgets });
    persistInBackground(persistBoardWithWidgets(repository, board, defaultWidgets), "add board");
  },
  async renameBoard(boardId, name) {
    const { repository, boards } = get();
    const target = boards.find((board) => board.id === boardId);
    if (!target) return;
    const next = { ...target, name, updatedAt: nowIso() };
    const optimisticBoards = boards.map((board) => (board.id === boardId ? next : board));
    set({ boards: optimisticBoards });
    try {
      await repository.upsertBoard(next);
    } catch (error) {
      // Keep local UX responsive, but roll back if cloud persistence fails.
      set({ boards });
      throw error;
    }
  },
  async deleteBoard(boardId) {
    const { repository, boards, activeBoardId, widgetInstances, widgetDefinitions } = get();
    const target = boards.find((board) => board.id === boardId);
    if (!target) return;
    const nextBoards = boards.filter((board) => board.id !== boardId);

    if (nextBoards.length === 0) {
      const workspaceId = target.workspaceId;
      if (!workspaceId) {
        set({ boards: [], activeBoardId: undefined, widgetInstances: [] });
        return;
      }
      const fallback = makeBoard(workspaceId, "默认桌板");
      const defaultWidgets = createDefaultBoardWidgets(fallback.id, widgetDefinitions);
      set({ boards: [fallback], activeBoardId: fallback.id, widgetInstances: defaultWidgets });
      persistInBackground(
        (async () => {
          await repository.deleteBoard(boardId);
          await persistBoardWithWidgets(repository, fallback, defaultWidgets);
        })(),
        "delete board with fallback"
      );
      return;
    }

    const nextActiveBoardId = activeBoardId === boardId ? nextBoards[0].id : activeBoardId;
    const deletingActiveBoard = activeBoardId === boardId;
    set({
      boards: nextBoards,
      activeBoardId: nextActiveBoardId,
      widgetInstances: deletingActiveBoard ? [] : widgetInstances
    });
    persistInBackground(
      (async () => {
        await repository.deleteBoard(boardId);
        if (!deletingActiveBoard || !nextActiveBoardId) {
          return;
        }
        const nextInstances = await repository.listByBoard(nextActiveBoardId);
        const resolvedInstances = await ensureBoardDefaultWidgets(
          repository,
          nextActiveBoardId,
          widgetDefinitions,
          nextInstances
        );
        if (get().activeBoardId === nextActiveBoardId) {
          set({ widgetInstances: resolvedInstances });
        }
      })(),
      "delete board"
    );
  },
  async setBoardWallpaper(imageDataUrl) {
    const { repository, boards, activeBoardId } = get();
    const target = boards.find((board) => board.id === activeBoardId);
    if (!target) return;
    const next = {
      ...target,
      background: {
        type: "image" as const,
        value: imageDataUrl
      },
      updatedAt: nowIso()
    };
    await repository.upsertBoard(next);
    set({ boards: boards.map((board) => (board.id === target.id ? next : board)) });
  },
  async setActiveBoard(boardId) {
    const { repository, widgetDefinitions } = get();
    const existingInstances = await repository.listByBoard(boardId);
    const widgetInstances = await ensureBoardDefaultWidgets(repository, boardId, widgetDefinitions, existingInstances);
    const definitionTypeById = buildDefinitionTypeMap(widgetDefinitions);
    const normalizedWidgets = normalizeWidgetInstances(widgetInstances, definitionTypeById);
    if (normalizedWidgets.changed.length > 0) {
      await repository.upsertInstances(normalizedWidgets.changed);
    }
    set({ activeBoardId: boardId, widgetInstances: normalizedWidgets.items });
  },
  async addWidgetInstance(definitionId, options) {
    const { repository, activeBoardId, widgetInstances, widgetDefinitions } = get();
    if (!activeBoardId) {
      return;
    }
    const definition = widgetDefinitions.find((item) => item.id === definitionId);
    const defaultSize = getDefaultWidgetSize(definition?.type);
    const now = nowIso();
    const definitionTypeById = buildDefinitionTypeMap(widgetDefinitions);
    const nextMobilePosition = options?.mobileMode
      ? getNextMobileWidgetPosition(widgetInstances, definitionTypeById)
      : null;
    const instance: WidgetInstance = {
      id: createId("wi"),
      boardId: activeBoardId,
      definitionId,
      state: {},
      bindings: [],
      position:
        nextMobilePosition ?? { x: 20 + widgetInstances.length * 20, y: 20 + widgetInstances.length * 20 },
      size: defaultSize,
      zIndex: widgetInstances.length + 1,
      locked: false,
      createdAt: now,
      updatedAt: now
    };
    set({ widgetInstances: [...widgetInstances, instance] });
    persistInBackground(repository.upsertInstance(instance), "add widget");
  },
  async removeWidgetInstance(widgetId) {
    const { repository, widgetInstances } = get();
    set({ widgetInstances: widgetInstances.filter((item) => item.id !== widgetId) });
    persistInBackground(repository.deleteInstance(widgetId), "remove widget");
  },
  async updateWidgetPosition(widgetId, x, y) {
    const { repository, widgetInstances } = get();
    const target = widgetInstances.find((item) => item.id === widgetId);
    if (!target) {
      return;
    }
    const next = {
      ...target,
      position: { x, y },
      updatedAt: nowIso()
    };
    set({ widgetInstances: widgetInstances.map((item) => (item.id === widgetId ? next : item)) });
    void repository.upsertInstance(next);
  },
  async updateWidgetSize(widgetId, w, h) {
    const { repository, widgetInstances, widgetDefinitions } = get();
    const target = widgetInstances.find((item) => item.id === widgetId);
    if (!target) {
      return;
    }
    const definition = widgetDefinitions.find((item) => item.id === target.definitionId);
    const roundedW = Math.round(w);
    const roundedH = Math.round(h);
    const size =
      definition?.type === "tv"
        ? clampTvWidgetSize(roundedW, roundedH)
        : {
            w: Math.max(120, roundedW),
            h: Math.max(90, roundedH)
          };
    const next = {
      ...target,
      size,
      updatedAt: nowIso()
    };
    set({ widgetInstances: widgetInstances.map((item) => (item.id === widgetId ? next : item)) });
    void repository.upsertInstance(next);
  },
  async updateWidgetState(widgetId, state) {
    const { repository, widgetInstances } = get();
    const target = widgetInstances.find((item) => item.id === widgetId);
    if (!target) {
      return;
    }
    const next = {
      ...target,
      state,
      updatedAt: nowIso()
    };
    set({ widgetInstances: widgetInstances.map((item) => (item.id === widgetId ? next : item)) });
    void repository.upsertInstance(next);
  },
  async autoAlignWidgets(_viewportWidth, options) {
    const { repository, widgetInstances, widgetDefinitions } = get();
    if (widgetInstances.length === 0) return;

    const margin = 20;
    const horizontalGap = 18;
    const verticalGap = MOBILE_STACK_GAP;
    const toNumber = (value: unknown) => {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const trimmed = value.trim();
        const direct = Number(trimmed);
        if (Number.isFinite(direct)) return direct;
        const parsed = Number.parseFloat(trimmed);
        if (Number.isFinite(parsed)) return parsed;
      }
      return Number.NaN;
    };
    const definitionTypeById = buildDefinitionTypeMap(widgetDefinitions);
    const typeOf = (widget: WidgetInstance): string =>
      definitionTypeById.get(widget.definitionId) ?? "";
    const safeW = (widget: WidgetInstance) => {
      const n = toNumber(widget.size.w);
      const normalized = Number.isFinite(n) ? Math.max(120, n) : 240;
      if (typeOf(widget) === "tv") {
        return clampTvWidgetSize(normalized, 480).w;
      }
      return normalized;
    };
    const safeH = (widget: WidgetInstance) => {
      return safeWidgetHeight(widget, typeOf(widget));
    };

    const measuredLayout = measureWidgetLayout(widgetInstances, definitionTypeById);
    const measuredHeights = new Map(
      widgetInstances.map((item) => [item.id, measuredLayout.get(item.id)?.height ?? 0])
    );

    const normalized = widgetInstances.map((item) => ({
      ...item,
      size: {
        w: safeW(item),
        h: (() => {
          if (typeOf(item) === "tv") {
            return 480;
          }
          const measured = measuredHeights.get(item.id) ?? 0;
          return measured > 0 ? Math.max(90, measured) : safeH(item);
        })()
      }
    }));

    const measuredHeightOf = (item: WidgetInstance, fallback: number) => {
      if (typeOf(item) === "tv") {
        return 480;
      }
      const id = item.id;
      const measured = measuredHeights.get(id) ?? 0;
      return measured > 0 ? Math.max(90, measured) : fallback;
    };

    const normalizedById = new Map(normalized.map((item) => [item.id, item]));
    const normalizedInstances = widgetInstances.map((item) => normalizedById.get(item.id) ?? item);

    if (options?.mobileMode) {
      const ordered = [...normalizedInstances].sort((a, b) => {
        const aLayout = measuredLayout.get(a.id);
        const bLayout = measuredLayout.get(b.id);
        const topDelta = (aLayout?.top ?? a.position.y) - (bLayout?.top ?? b.position.y);
        if (topDelta !== 0) return topDelta;
        const leftDelta = (aLayout?.left ?? a.position.x) - (bLayout?.left ?? b.position.x);
        if (leftDelta !== 0) return leftDelta;
        return a.zIndex - b.zIndex;
      });

      let yCursor = MOBILE_STACK_MARGIN;
      const nextInstances = ordered.map((item) => {
        const definitionType = typeOf(item);
        const h = measuredHeightOf(item, safeH(item));
        const next = {
          ...item,
          size: {
            w: safeWidgetWidth(item, definitionType),
            h
          },
          position: {
            x: MOBILE_STACK_MARGIN,
            y: Math.round(yCursor)
          },
          updatedAt: nowIso()
        };
        yCursor += h + MOBILE_STACK_GAP;
        return next;
      });

      const nextById = new Map(nextInstances.map((item) => [item.id, item]));
      set({
        widgetInstances: widgetInstances.map((item) => nextById.get(item.id) ?? item)
      });
      persistInBackground(repository.upsertInstances(nextInstances), "auto align mobile widgets");
      return;
    }

    const sortedByX = [...normalizedInstances].sort((a, b) => a.position.x - b.position.x);

    type Column = { center: number; left: number; width: number; items: WidgetInstance[] };
    const columns: Column[] = [];

    sortedByX.forEach((item) => {
      const itemCenter = item.position.x + item.size.w / 2;
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < columns.length; i += 1) {
        const distance = Math.abs(itemCenter - columns[i].center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      const nearest = nearestIndex >= 0 ? columns[nearestIndex] : null;
      const threshold = nearest ? (nearest.width + item.size.w + horizontalGap) / 4 : 0;
      if (!nearest || nearestDistance > threshold) {
        columns.push({
          center: itemCenter,
          left: item.position.x,
          width: item.size.w,
          items: [item]
        });
      } else {
        nearest.items.push(item);
        nearest.width = Math.max(nearest.width, item.size.w);
      }
    });

    columns.sort((a, b) => a.center - b.center);
    let xCursor = margin;
    columns.forEach((column) => {
      column.left = xCursor;
      column.center = xCursor + column.width / 2;
      xCursor += column.width + horizontalGap;
    });

    const nextById = new Map<string, WidgetInstance>();
    columns.forEach((column) => {
      const inColumn = [...column.items].sort((a, b) => a.position.y - b.position.y);
      if (!inColumn.length) return;
      let previousBottom = margin;

      inColumn.forEach((item, rowIndex) => {
        const w = safeW(item);
        const h = measuredHeightOf(item, safeH(item));
        const alignedY = Math.round(rowIndex === 0 ? margin : previousBottom + verticalGap);
        const targetX = Math.round(column.left);

        nextById.set(item.id, {
          ...item,
          size: { w, h },
          position: {
            x: targetX,
            y: alignedY
          },
          updatedAt: nowIso()
        });
        previousBottom = alignedY + h;
      });
    });

    const nextInstances = widgetInstances.map((item) => nextById.get(item.id) ?? item);

    const byId = new Map(nextInstances.map((item) => [item.id, item]));
    set({
      widgetInstances: widgetInstances.map((item) => byId.get(item.id) ?? item)
    });
    persistInBackground(repository.upsertInstances(nextInstances), "auto align widgets");
  },
  setCommandPaletteOpen(open) {
    set({ commandPaletteOpen: open });
  },
  setAiDialogOpen(open) {
    set({ aiDialogOpen: open });
  },
  async generateAiWidget(prompt, options) {
    const { aiBuilder, repository, widgetDefinitions } = get();
    const draft = aiBuilder.generate(prompt);
    await repository.upsertDefinition(draft.definition);
    set({
      widgetDefinitions: [...widgetDefinitions, draft.definition],
      aiDialogOpen: false
    });
    await get().addWidgetInstance(draft.definition.id, options);
  },
  async createBackupSnapshot() {
    const { repository } = get();
    const workspaces = await repository.list();
    const boards = (
      await Promise.all(workspaces.map((workspace) => repository.listByWorkspace(workspace.id)))
    ).flat();
    const widgetsByBoard: Record<string, WidgetInstance[]> = {};
    for (const board of boards) {
      widgetsByBoard[board.id] = await repository.listByBoard(board.id);
    }
    const widgetDefinitions = await repository.listDefinitions();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaces,
      boards,
      widgetDefinitions,
      widgetsByBoard
    };
  },
  async importBackupSnapshot(snapshot, backupName) {
    const { repository, boards, widgetDefinitions, activeBoardId } = get();
    const parsed = parseBackupSnapshot(snapshot);
    if (!parsed) {
      throw new Error("备份文件格式无效");
    }

    const workspaces = await repository.list();
    const currentBoard = boards.find((item) => item.id === activeBoardId) ?? boards[0];
    const workspaceId = currentBoard?.workspaceId ?? workspaces[0]?.id;
    if (!workspaceId) {
      throw new Error("当前无可用工作空间，无法导入");
    }

    const sourceBoard = parsed.boards[0];
    const boardName = (backupName?.trim() || sourceBoard.name || "导入备份").trim();
    const now = nowIso();
    const newBoard: Board = {
      ...sourceBoard,
      id: createId("board"),
      workspaceId,
      name: boardName,
      createdAt: now,
      updatedAt: now
    };
    await repository.upsertBoard(newBoard);

    const existingSystemByType = new Map(
      widgetDefinitions.filter((item) => item.kind === "system").map((item) => [item.type, item])
    );
    const existingDefById = new Map(widgetDefinitions.map((item) => [item.id, item]));
    const definitionIdMap = new Map<string, string>();
    const importedDefinitions: WidgetDefinition[] = [];

    for (const definition of parsed.widgetDefinitions) {
      if (definition.kind === "system") {
        const matched = existingSystemByType.get(definition.type);
        if (matched) {
          definitionIdMap.set(definition.id, matched.id);
          continue;
        }
      }

      if (existingDefById.has(definition.id)) {
        const newDefinition: WidgetDefinition = {
          ...definition,
          id: createId("wd_import"),
          createdAt: now,
          updatedAt: now
        };
        await repository.upsertDefinition(newDefinition);
        importedDefinitions.push(newDefinition);
        definitionIdMap.set(definition.id, newDefinition.id);
        continue;
      }

      await repository.upsertDefinition(definition);
      importedDefinitions.push(definition);
      definitionIdMap.set(definition.id, definition.id);
    }

    const sourceInstances = Array.isArray(parsed.widgetsByBoard[sourceBoard.id])
      ? parsed.widgetsByBoard[sourceBoard.id]
      : [];
    const importedInstances: WidgetInstance[] = [];
    for (const instance of sourceInstances) {
      const newInstance: WidgetInstance = {
        ...instance,
        id: createId("wi"),
        boardId: newBoard.id,
        definitionId: definitionIdMap.get(instance.definitionId) ?? instance.definitionId,
        createdAt: now,
        updatedAt: now
      };
      await repository.upsertInstance(newInstance);
      importedInstances.push(newInstance);
    }

    const mergedDefinitions = [...widgetDefinitions];
    for (const item of importedDefinitions) {
      if (!mergedDefinitions.some((d) => d.id === item.id)) {
        mergedDefinitions.push(item);
      }
    }

    set({
      boards: [...boards, newBoard],
      widgetDefinitions: mergedDefinitions,
      widgetInstances: importedInstances,
      activeBoardId: newBoard.id
    });
  }
}));
