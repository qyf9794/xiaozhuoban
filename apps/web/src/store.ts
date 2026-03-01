import { create } from "zustand";
import {
  createId,
  nowIso,
  type Board,
  type LayoutMode,
  type WidgetDefinition,
  type WidgetInstance,
  type Workspace
} from "@xiaozhuoban/domain";
import { DexieRepository, InMemoryRepository, type AppRepository } from "@xiaozhuoban/data";
import { LocalTemplateAIBuilder } from "@xiaozhuoban/ai-builder";

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
  addWidgetInstance: (definitionId: string) => Promise<void>;
  removeWidgetInstance: (widgetId: string) => Promise<void>;
  updateWidgetPosition: (widgetId: string, x: number, y: number) => Promise<void>;
  updateWidgetState: (widgetId: string, state: Record<string, unknown>) => Promise<void>;
  autoAlignWidgets: (viewportWidth: number) => Promise<void>;
  setCommandPaletteOpen: (open: boolean) => void;
  setAiDialogOpen: (open: boolean) => void;
  generateAiWidget: (prompt: string) => Promise<void>;
  createBackupSnapshot: () => Promise<Record<string, unknown>>;
  importBackupSnapshot: (snapshot: unknown, backupName?: string) => Promise<void>;
}

interface BackupSnapshotPayload {
  workspaces: Workspace[];
  boards: Board[];
  widgetDefinitions: WidgetDefinition[];
  widgetsByBoard: Record<string, WidgetInstance[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
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

      let definitions = await repository.listDefinitions();
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
        for (const definition of toInsert) {
          await repository.upsertDefinition(definition);
        }
        definitions = await repository.listDefinitions();
      }

      const boardId = boards[0].id;
      const widgetInstances = await repository.listByBoard(boardId);

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
    if (!target) {
      return;
    }
    const nextMode: LayoutMode = target.layoutMode === "grid" ? "free" : "grid";
    const next: Board = {
      ...target,
      layoutMode: nextMode,
      updatedAt: nowIso()
    };
    await repository.upsertBoard(next);
    set({ boards: boards.map((board) => (board.id === target.id ? next : board)) });
  },
  async addBoard(name = "新桌板") {
    const { repository, boards } = get();
    const workspaces = await repository.list();
    const workspaceId = workspaces[0]?.id;
    if (!workspaceId) return;
    const board = makeBoard(workspaceId, name);
    await repository.upsertBoard(board);
    set({ boards: [...boards, board], activeBoardId: board.id, widgetInstances: [] });
  },
  async renameBoard(boardId, name) {
    const { repository, boards } = get();
    const target = boards.find((board) => board.id === boardId);
    if (!target) return;
    const next = { ...target, name, updatedAt: nowIso() };
    await repository.upsertBoard(next);
    set({ boards: boards.map((board) => (board.id === boardId ? next : board)) });
  },
  async deleteBoard(boardId) {
    const { repository, boards, activeBoardId } = get();
    await repository.deleteBoard(boardId);
    const nextBoards = boards.filter((board) => board.id !== boardId);

    if (nextBoards.length === 0) {
      const workspaces = await repository.list();
      const workspaceId = workspaces[0]?.id;
      if (!workspaceId) {
        set({ boards: [], activeBoardId: undefined, widgetInstances: [] });
        return;
      }
      const fallback = makeBoard(workspaceId, "默认桌板");
      await repository.upsertBoard(fallback);
      set({ boards: [fallback], activeBoardId: fallback.id, widgetInstances: [] });
      return;
    }

    const nextActiveBoardId = activeBoardId === boardId ? nextBoards[0].id : activeBoardId;
    const widgetInstances = nextActiveBoardId ? await repository.listByBoard(nextActiveBoardId) : [];
    set({ boards: nextBoards, activeBoardId: nextActiveBoardId, widgetInstances });
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
    const { repository } = get();
    const widgetInstances = await repository.listByBoard(boardId);
    set({ activeBoardId: boardId, widgetInstances });
  },
  async addWidgetInstance(definitionId) {
    const { repository, activeBoardId, widgetInstances } = get();
    if (!activeBoardId) {
      return;
    }
    const now = nowIso();
    const instance: WidgetInstance = {
      id: createId("wi"),
      boardId: activeBoardId,
      definitionId,
      state: {},
      bindings: [],
      position: { x: 20 + widgetInstances.length * 20, y: 20 + widgetInstances.length * 20 },
      size: { w: 240, h: 180 },
      zIndex: widgetInstances.length + 1,
      locked: false,
      createdAt: now,
      updatedAt: now
    };
    await repository.upsertInstance(instance);
    set({ widgetInstances: [...widgetInstances, instance] });
  },
  async removeWidgetInstance(widgetId) {
    const { repository, widgetInstances } = get();
    await repository.deleteInstance(widgetId);
    set({ widgetInstances: widgetInstances.filter((item) => item.id !== widgetId) });
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
  async autoAlignWidgets(_viewportWidth) {
    const { repository, widgetInstances } = get();
    if (widgetInstances.length === 0) return;

    const margin = 20;
    const horizontalGap = 18;
    const verticalGap = horizontalGap / 3;
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
    const safeW = (w: unknown) => {
      const n = toNumber(w);
      return Number.isFinite(n) ? Math.max(120, n) : 240;
    };
    const safeH = (h: unknown) => {
      const n = toNumber(h);
      return Number.isFinite(n) ? Math.max(90, n) : 180;
    };

    const measuredHeights =
      typeof document === "undefined"
        ? new Map<string, number>()
        : new Map(
            widgetInstances.map((item) => {
              const element = document.querySelector<HTMLElement>(`.widget-box[data-widget-id="${item.id}"]`);
              const card = element?.querySelector<HTMLElement>("section");
              const boxRectHeight = element?.getBoundingClientRect().height ?? 0;
              const cardRectHeight = card?.getBoundingClientRect().height ?? 0;
              const measured =
                cardRectHeight > 0 ? cardRectHeight : boxRectHeight;
              return [item.id, measured];
            })
          );

    const normalized = widgetInstances.map((item) => ({
      ...item,
      size: {
        w: safeW(item.size.w),
        h: (() => {
          const measured = measuredHeights.get(item.id) ?? 0;
          return measured > 0 ? Math.max(90, measured) : safeH(item.size.h);
        })()
      }
    }));

    const measuredHeightOf = (id: string, fallback: number) => {
      const measured = measuredHeights.get(id) ?? 0;
      return measured > 0 ? Math.max(90, measured) : fallback;
    };

    const normalizedById = new Map(normalized.map((item) => [item.id, item]));
    const normalizedInstances = widgetInstances.map((item) => normalizedById.get(item.id) ?? item);

    const sortedByX = [...normalizedInstances].sort((a, b) => a.position.x - b.position.x);

    type Column = { center: number; width: number; items: WidgetInstance[] };
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
      column.center = xCursor + column.width / 2;
      xCursor += column.width + horizontalGap;
    });

    const nextById = new Map<string, WidgetInstance>();
    columns.forEach((column) => {
      const inColumn = [...column.items].sort((a, b) => a.position.y - b.position.y);
      if (!inColumn.length) return;
      let previousBottom = margin;

      inColumn.forEach((item, rowIndex) => {
        const w = safeW(item.size.w);
        const h = measuredHeightOf(item.id, safeH(item.size.h));
        const alignedY = Math.round(rowIndex === 0 ? margin : previousBottom + verticalGap);
        const targetX = Math.round(column.center - w / 2);

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

    await Promise.all(nextInstances.map((item) => repository.upsertInstance(item)));
    const byId = new Map(nextInstances.map((item) => [item.id, item]));
    set({
      widgetInstances: widgetInstances.map((item) => byId.get(item.id) ?? item)
    });
  },
  setCommandPaletteOpen(open) {
    set({ commandPaletteOpen: open });
  },
  setAiDialogOpen(open) {
    set({ aiDialogOpen: open });
  },
  async generateAiWidget(prompt) {
    const { aiBuilder, repository, widgetDefinitions } = get();
    const draft = aiBuilder.generate(prompt);
    await repository.upsertDefinition(draft.definition);
    set({
      widgetDefinitions: [...widgetDefinitions, draft.definition],
      aiDialogOpen: false
    });
    await get().addWidgetInstance(draft.definition.id);
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
