import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAssistantCommandLog,
  createLocalAssistantAuditAdapter,
  createSupabaseAssistantAuditAdapter,
  sanitizeAssistantAuditValue
} from "./assistantAudit";

const baseEvent = {
  route: "shortcut" as const,
  call: {
    id: "call_1",
    name: "note.write",
    arguments: {
      content: "hello",
      audioBlob: "raw-audio",
      nested: {
        apiKey: "secret",
        longText: "x".repeat(220)
      }
    },
    source: "shortcut" as const,
    transcript: "在便签写 hello"
  },
  result: {
    status: "success" as const,
    message: "已写入便签"
  },
  durationMs: 12.4
};

describe("assistant audit", () => {
  it("redacts sensitive values and truncates long strings", () => {
    const sanitized = sanitizeAssistantAuditValue(baseEvent.call.arguments) as Record<string, unknown>;

    expect(sanitized.audioBlob).toBe("[redacted]");
    expect((sanitized.nested as Record<string, unknown>).apiKey).toBe("[redacted]");
    expect(String((sanitized.nested as Record<string, unknown>).longText).length).toBeLessThan(170);
  });

  it("creates a sanitized command log without raw audio", () => {
    const log = createAssistantCommandLog(baseEvent, {
      getUserId: () => "user_1",
      getBoardId: () => "board_1",
      now: () => "2026-06-16T00:00:00.000Z"
    });

    expect(log).toMatchObject({
      userId: "user_1",
      boardId: "board_1",
      route: "shortcut",
      sourceMode: "shortcut",
      toolName: "note.write",
      resultStatus: "success",
      durationMs: 12
    });
    expect(JSON.stringify(log)).not.toContain("raw-audio");
  });

  it("writes local fallback logs to localStorage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        clear: () => storage.clear()
      }
    });
    const adapter = createLocalAssistantAuditAdapter({
      storageKey: "assistant.audit.test",
      now: () => "2026-06-16T00:00:00.000Z"
    });

    adapter.write(baseEvent);

    const raw = storage.get("assistant.audit.test");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw ?? "[]")).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("inserts sanitized logs into Supabase when a user id is available", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));
    const client = { from } as unknown as SupabaseClient;
    const adapter = createSupabaseAssistantAuditAdapter(client, {
      getUserId: () => "user_1",
      getBoardId: () => "board_1",
      now: () => "2026-06-16T00:00:00.000Z"
    });

    await adapter.write(baseEvent);

    expect(from).toHaveBeenCalledWith("assistant_command_logs");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user_1",
        board_id: "board_1",
        tool_name: "note.write",
        result_status: "success"
      })
    );
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("raw-audio");
  });
});
