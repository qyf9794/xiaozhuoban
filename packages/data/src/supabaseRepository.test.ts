import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "./supabaseRepository";

function createUpdateBuilder(calls: Array<Record<string, unknown>>) {
  const builder = {
    eq: vi.fn((column: string, value: unknown) => {
      calls.push({ op: "eq", column, value });
      return builder;
    }),
    is: vi.fn((column: string, value: unknown) => {
      calls.push({ op: "is", column, value });
      return { error: null };
    })
  };
  return builder;
}

describe("SupabaseRepository.deleteBoard", () => {
  it("uses the soft-delete RPC when it is available", async () => {
    const from = vi.fn();
    const rpc = vi.fn(async () => ({ error: null }));
    const repository = new SupabaseRepository({ rpc, from } as unknown as SupabaseClient, "user_1");

    await repository.deleteBoard("board_1");

    expect(rpc).toHaveBeenCalledWith("soft_delete_board", { p_board_id: "board_1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("falls back to scoped soft updates when the RPC has not been deployed yet", async () => {
    const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
    const predicates: Array<Record<string, unknown>> = [];
    const from = vi.fn((table: string) => ({
      update: vi.fn((payload: Record<string, unknown>) => {
        updates.push({ table, payload });
        return createUpdateBuilder(predicates);
      })
    }));
    const rpc = vi.fn(async () => ({ error: { code: "PGRST202", message: "Could not find function soft_delete_board" } }));
    const repository = new SupabaseRepository({ rpc, from } as unknown as SupabaseClient, "user_1");

    await repository.deleteBoard("board_1");

    expect(from).toHaveBeenCalledWith("widget_instances");
    expect(from).toHaveBeenCalledWith("boards");
    expect(updates.map((item) => item.table)).toEqual(["widget_instances", "boards"]);
    expect(updates.every((item) => typeof item.payload.deleted_at === "string")).toBe(true);
    expect(predicates).toEqual([
      { op: "eq", column: "board_id", value: "board_1" },
      { op: "eq", column: "user_id", value: "user_1" },
      { op: "is", column: "deleted_at", value: null },
      { op: "eq", column: "id", value: "board_1" },
      { op: "eq", column: "user_id", value: "user_1" },
      { op: "is", column: "deleted_at", value: null }
    ]);
  });
});
