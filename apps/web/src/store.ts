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
    type: "quicklink",
    name: "远程执行",
    version: 1,
    description: "添加远程链接，点击即可触发执行",
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
  setCommandPaletteOpen: (open: boolean) => void;
  setAiDialogOpen: (open: boolean) => void;
  generateAiWidget: (prompt: string) => Promise<void>;
  createBackupSnapshot: () => Promise<Record<string, unknown>>;
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
    layoutMode: "grid",
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
  async initialize() {
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
    await repository.upsertInstance(next);
    set({ widgetInstances: widgetInstances.map((item) => (item.id === widgetId ? next : item)) });
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
    await repository.upsertInstance(next);
    set({ widgetInstances: widgetInstances.map((item) => (item.id === widgetId ? next : item)) });
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
  }
}));
