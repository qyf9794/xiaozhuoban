import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRepository } from "@xiaozhuoban/data";
import type { WidgetInstance } from "@xiaozhuoban/domain";
import {
  enqueueAssistantCloudMutation,
  getAssistantOutboxPendingCount,
  retryAssistantOutbox
} from "./assistantOutbox";

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
});
