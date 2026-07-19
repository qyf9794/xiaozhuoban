import { describe, expect, it } from "vitest";
import {
  WORKBENCH_BACKGROUND_MODEL,
  WorkbenchAgentResultSchema,
  partitionWorkbenchCommands,
  validateWorkbenchCommand
} from "./index";

describe("workbench model configuration", () => {
  it("uses GPT-5.6 Luna for delegated background tasks", () => {
    expect(WORKBENCH_BACKGROUND_MODEL).toBe("gpt-5.6-luna");
  });
});

describe("workbench command policy", () => {
  it("fails closed for unknown commands", () => {
    expect(validateWorkbenchCommand({ type: "workbench.shell.exec", version: 1, args: {}, idempotencyKey: "unknown-123" })).toEqual({
      ok: false,
      error: "UNKNOWN_COMMAND"
    });
  });

  it("separates safe and confirmation commands", () => {
    const result = partitionWorkbenchCommands([
      { type: "workbench.note.create", version: 1, args: { text: "hello" }, idempotencyKey: "note-12345" },
      { type: "workbench.file.delete", version: 1, args: { fileId: "file-1" }, idempotencyKey: "file-12345" }
    ]);
    expect(result.safe).toHaveLength(1);
    expect(result.confirmation).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("validates structured agent results", () => {
    expect(
      WorkbenchAgentResultSchema.parse({
        reply: "已整理完成",
        commands: [],
        artifacts: [],
        needsConfirmation: false
      }).reply
    ).toBe("已整理完成");
  });
});
