import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRepository } from "@xiaozhuoban/data";
import type { Board, WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import {
  enqueueAssistantCloudMutation,
  getAssistantOutboxPendingCount,
  getAssistantOutboxStatus,
  retryAssistantOutbox
} from "./assistantOutbox";

const board: Board = {
  id: "board_1",
  workspaceId: "ws_1",
  name: "测试桌板",
  layoutMode: "free",
  zoom: 1,
  locked: false,
  background: { type: "color", value: "#ffffff" },
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z"
};

const definition: WidgetDefinition = {
  id: "wd_note",
  kind: "system",
  type: "note",
  name: "便签",
  version: 1,
  inputSchema: { fields: [] },
  outputSchema: { fields: [] },
  uiSchema: { layout: "single-column" },
  logicSpec: {},
  storagePolicy: { strategy: "local" },
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z"
};

const instance: WidgetInstance = {
  id: "wi_1",
  boardId: "board_1",
  definitionId: "wd_note",
  state: {},
  bindings: [],
  position: { x: 0, y: 0 },
  size: { w: 240, h: 180 },
  zIndex: 1,
  locked: false,
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z"
};

describe("assistantOutbox", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear()
    });
    vi.stubGlobal("dispatchEvent", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists failed cloud mutations and retries them through the repository", async () => {
    await enqueueAssistantCloudMutation({ type: "widget.upsert", payload: { instance } }, "op_widget");

    expect(await getAssistantOutboxPendingCount()).toBe(1);

    const upsertInstance = vi.fn().mockResolvedValue(undefined);
    const repository = { upsertInstance } as Partial<AppRepository> as AppRepository;
    const remaining = await retryAssistantOutbox(repository);

    expect(upsertInstance).toHaveBeenCalledWith(instance);
    expect(remaining).toEqual([]);
    expect(await getAssistantOutboxPendingCount()).toBe(0);
  });

  it("retries board, definition, and backup import mutations through the repository", async () => {
    await enqueueAssistantCloudMutation({ type: "board.upsert", payload: { board } }, "op_board");
    await enqueueAssistantCloudMutation(
      { type: "widget_definition.upsert", payload: { definition } },
      "op_definition"
    );
    await enqueueAssistantCloudMutation(
      { type: "backup.import", payload: { board, definitions: [definition], instances: [instance] } },
      "op_backup"
    );

    const upsertBoard = vi.fn().mockResolvedValue(undefined);
    const upsertDefinition = vi.fn().mockResolvedValue(undefined);
    const upsertDefinitions = vi.fn().mockResolvedValue(undefined);
    const upsertInstances = vi.fn().mockResolvedValue(undefined);
    const repository = {
      upsertBoard,
      upsertDefinition,
      upsertDefinitions,
      upsertInstances
    } as Partial<AppRepository> as AppRepository;

    await retryAssistantOutbox(repository);

    expect(upsertBoard).toHaveBeenCalledWith(board);
    expect(upsertDefinition).toHaveBeenCalledWith(definition);
    expect(upsertDefinitions).toHaveBeenCalledWith([definition]);
    expect(upsertInstances).toHaveBeenCalledWith([instance]);
    expect(await getAssistantOutboxPendingCount()).toBe(0);
  });

  it("keeps failed retry reasons visible in outbox status", async () => {
    await enqueueAssistantCloudMutation({ type: "board.upsert", payload: { board } }, "op_board");

    const repository = {
      upsertBoard: vi.fn().mockRejectedValue(new Error("network offline"))
    } as Partial<AppRepository> as AppRepository;

    await retryAssistantOutbox(repository);

    expect(await getAssistantOutboxStatus()).toEqual({
      pendingCount: 1,
      lastError: "network offline"
    });
  });
});
