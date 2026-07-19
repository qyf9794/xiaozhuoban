import { create } from "zustand";
import type {
  WorkbenchDirection,
  WorkbenchFile,
  WorkbenchPresentationMode,
  WorkbenchRecord,
  WorkbenchTask,
  WorkbenchTopic
} from "@xiaozhuoban/workbench-core";
import {
  insertWorkbenchDirection,
  insertWorkbenchTopic,
  loadWorkbenchSnapshot,
  markWorkbenchTaskRead,
  subscribeToWorkbenchTasks,
  updateWorkbenchDirectionCompleted,
  uploadWorkbenchFile
} from "./repository";
import { createWorkbenchTask } from "./taskClient";

export type WorkbenchPanel = "topic" | "resources" | "generated" | "records";
export type WorkbenchToolWindow = "whiteboard" | "draft" | "web" | "file";

type WorkbenchState = {
  open: boolean;
  hydratedUserId: string | null;
  loading: boolean;
  error: string;
  activeTopicId: string | null;
  selectedFileId: string | null;
  focusedPanel: WorkbenchPanel;
  fullscreenPanel: WorkbenchPanel | null;
  leftPanePercent: number;
  resourceFraction: number;
  generatedFraction: number;
  toolWindows: WorkbenchToolWindow[];
  topics: WorkbenchTopic[];
  files: WorkbenchFile[];
  directions: WorkbenchDirection[];
  records: WorkbenchRecord[];
  tasks: WorkbenchTask[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  presentationMode: (isMobile: boolean) => WorkbenchPresentationMode;
  hydrate: (userId: string, boardId?: string) => Promise<void>;
  selectTopic: (topicId: string) => void;
  selectFile: (fileId: string | null) => void;
  setFocusedPanel: (panel: WorkbenchPanel) => void;
  setFullscreenPanel: (panel: WorkbenchPanel | null) => void;
  setLeftPanePercent: (value: number) => void;
  setStackFractions: (resource: number, generated: number) => void;
  openToolWindow: (tool: WorkbenchToolWindow) => void;
  closeToolWindow: (tool: WorkbenchToolWindow) => void;
  createTopic: (title: string, userId: string, boardId?: string) => Promise<WorkbenchTopic>;
  addDirection: (text: string, userId: string) => Promise<void>;
  uploadFiles: (role: WorkbenchFile["role"], files: FileList | File[], userId: string) => Promise<void>;
  toggleDirection: (id: string) => Promise<void>;
  delegateTask: (prompt: string) => Promise<WorkbenchTask>;
  upsertTask: (task: WorkbenchTask) => void;
  markTaskRead: (id: string) => Promise<void>;
};

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

let unsubscribeTasks: (() => void) | null = null;

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  open: false,
  hydratedUserId: null,
  loading: false,
  error: "",
  activeTopicId: null,
  selectedFileId: null,
  focusedPanel: "topic",
  fullscreenPanel: null,
  leftPanePercent: 64,
  resourceFraction: 1,
  generatedFraction: 1,
  toolWindows: [],
  topics: [],
  files: [],
  directions: [],
  records: [],
  tasks: [],
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  presentationMode: (isMobile) => (get().open ? (isMobile ? "mobile-push" : "desktop-rail") : "closed"),
  async hydrate(userId, boardId) {
    if (!userId || (get().hydratedUserId === userId && !get().error)) return;
    set({ loading: true, error: "" });
    try {
      let snapshot = await loadWorkbenchSnapshot(userId);
      if (snapshot.topics.length === 0) {
        const now = new Date().toISOString();
        const topic: WorkbenchTopic = {
          id: createId("topic"),
          userId,
          boardId: boardId ?? null,
          title: "新讨论",
          summary: null,
          createdAt: now,
          updatedAt: now
        };
        await insertWorkbenchTopic({ id: topic.id, userId, boardId, title: topic.title });
        snapshot = { ...snapshot, topics: [topic] };
      }
      unsubscribeTasks?.();
      unsubscribeTasks = subscribeToWorkbenchTasks(userId, (task) => get().upsertTask(task));
      set({
        ...snapshot,
        activeTopicId: get().activeTopicId ?? snapshot.topics[0]?.id ?? null,
        hydratedUserId: userId,
        loading: false,
        error: ""
      });
    } catch (error) {
      set({ loading: false, hydratedUserId: userId, error: error instanceof Error ? error.message : "工作台加载失败" });
    }
  },
  selectTopic: (activeTopicId) => set({ activeTopicId, selectedFileId: null }),
  selectFile: (selectedFileId) => set({ selectedFileId }),
  setFocusedPanel: (focusedPanel) => set({ focusedPanel }),
  setFullscreenPanel: (fullscreenPanel) => set({ fullscreenPanel }),
  setLeftPanePercent: (value) => set({ leftPanePercent: Math.min(76, Math.max(42, value)) }),
  setStackFractions: (resource, generated) =>
    set({ resourceFraction: Math.min(2, Math.max(0.55, resource)), generatedFraction: Math.min(2, Math.max(0.55, generated)) }),
  openToolWindow: (tool) => set((state) => ({ toolWindows: state.toolWindows.includes(tool) ? state.toolWindows : [...state.toolWindows, tool] })),
  closeToolWindow: (tool) => set((state) => ({ toolWindows: state.toolWindows.filter((item) => item !== tool) })),
  async createTopic(title, userId, boardId) {
    const now = new Date().toISOString();
    const topic: WorkbenchTopic = {
      id: createId("topic"),
      userId,
      boardId: boardId ?? null,
      title: title.trim() || "新讨论",
      summary: null,
      createdAt: now,
      updatedAt: now
    };
    await insertWorkbenchTopic({ id: topic.id, userId, boardId, title: topic.title });
    set((state) => ({ topics: [topic, ...state.topics], activeTopicId: topic.id }));
    return topic;
  },
  async addDirection(text, userId) {
    const topicId = get().activeTopicId;
    const value = text.trim();
    if (!topicId || !value) return;
    const now = new Date().toISOString();
    const direction: WorkbenchDirection = {
      id: createId("direction"),
      userId,
      topicId,
      text: value,
      completed: false,
      sortOrder: get().directions.filter((item) => item.topicId === topicId).length,
      createdAt: now,
      updatedAt: now
    };
    await insertWorkbenchDirection(direction);
    set((state) => ({ directions: [...state.directions, direction] }));
  },
  async uploadFiles(role, files, userId) {
    const topicId = get().activeTopicId;
    if (!topicId) throw new Error("请先选择讨论主题");
    const uploaded: WorkbenchFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} 超过 25MB`);
      uploaded.push(await uploadWorkbenchFile({ id: createId("file"), userId, topicId, role, file }));
    }
    set((state) => ({ files: [...uploaded, ...state.files], selectedFileId: uploaded[0]?.id ?? state.selectedFileId }));
  },
  async toggleDirection(id) {
    const target = get().directions.find((item) => item.id === id);
    if (!target) return;
    await updateWorkbenchDirectionCompleted(id, !target.completed);
    set((state) => ({ directions: state.directions.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)) }));
  },
  async delegateTask(prompt) {
    const task = await createWorkbenchTask({
      prompt: prompt.trim(),
      topicId: get().activeTopicId,
      selectedFileId: get().selectedFileId
    });
    get().upsertTask(task);
    return task;
  },
  upsertTask(task) {
    set((state) => ({ tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)] }));
  },
  async markTaskRead(id) {
    await markWorkbenchTaskRead(id);
    set((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? { ...task, unread: false } : task)) }));
  }
}));

export function readWorkbenchAssistantState() {
  const state = useWorkbenchStore.getState();
  const activeTopic = state.topics.find((topic) => topic.id === state.activeTopicId);
  const selectedFile = state.files.find((file) => file.id === state.selectedFileId);
  return {
    open: state.open,
    activeTopicId: activeTopic?.id,
    activeTopicTitle: activeTopic?.title,
    selectedFileId: selectedFile?.id,
    selectedFileName: selectedFile?.name,
    focusedPanel: state.focusedPanel,
    openWindows: state.toolWindows,
    pendingTaskCount: state.tasks.filter((task) => ["queued", "running", "response_ready", "executing"].includes(task.status)).length,
    awaitingConfirmationCount: state.tasks.filter((task) => task.status === "awaiting_confirmation").length
  };
}
