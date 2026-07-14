import { describe, expect, it } from "vitest";
import {
  clearAssistantTerminalOperation,
  getAssistantOperationStatus,
  updateAssistantOperationSnapshot,
  type AssistantOperationSnapshot
} from "./assistantOperationStatus";

describe("assistantOperationStatus", () => {
  it("tracks a single active operation", () => {
    const snapshot = updateAssistantOperationSnapshot({ active: [] }, {
      id: "call_1",
      phase: "running",
      route: "function_call",
      toolName: "board.add_widget"
    });

    expect(getAssistantOperationStatus(snapshot)).toEqual({
      phase: "executing",
      command: "board.add_widget",
      message: undefined
    });
  });

  it("summarizes concurrent active operations", () => {
    let snapshot: AssistantOperationSnapshot = { active: [] };
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "call_1",
      phase: "running",
      route: "function_call",
      toolName: "board.add_widget"
    });
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "call_2",
      phase: "running",
      route: "function_call",
      toolName: "note.write"
    });

    expect(getAssistantOperationStatus(snapshot)).toEqual({
      phase: "executing",
      command: "2 项工具：board.add_widget、note.write"
    });
  });

  it("lets waiting confirmation dominate concurrent operation state", () => {
    let snapshot: AssistantOperationSnapshot = { active: [] };
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "call_1",
      phase: "running",
      route: "function_call",
      toolName: "note.write"
    });
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "call_2",
      phase: "waiting_confirmation",
      route: "function_call",
      toolName: "board.auto_align",
      message: "确认执行 board.auto_align 吗？"
    });

    expect(getAssistantOperationStatus(snapshot)).toEqual({
      phase: "waiting_confirmation",
      command: "2 项工具：note.write、board.auto_align"
    });
  });

  it("clears the original waiting operation after confirmation settles", () => {
    let snapshot: AssistantOperationSnapshot = { active: [] };
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "cmd_align",
      phase: "waiting_confirmation",
      route: "model",
      toolName: "board.auto_align",
      message: "确认执行 board.auto_align 吗？"
    });
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "cmd_confirm",
      phase: "success",
      route: "shortcut",
      toolName: "assistant.confirm",
      message: "已整理桌面小工具"
    });

    expect(snapshot.active).toEqual([]);
    expect(getAssistantOperationStatus(snapshot)).toEqual({
      phase: "success",
      command: "assistant.confirm",
      message: "已整理桌面小工具"
    });
  });

  it("removes finished operations while keeping remaining active operations visible", () => {
    let snapshot: AssistantOperationSnapshot = { active: [] };
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "call_1",
      phase: "running",
      route: "function_call",
      toolName: "board.add_widget"
    });
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "call_2",
      phase: "running",
      route: "function_call",
      toolName: "note.write"
    });
    snapshot = updateAssistantOperationSnapshot(snapshot, {
      id: "call_1",
      phase: "success",
      route: "function_call",
      toolName: "board.add_widget",
      message: "board.add_widget done"
    });

    expect(getAssistantOperationStatus(snapshot)).toEqual({
      phase: "executing",
      command: "note.write",
      message: undefined
    });
  });

  it("shows the latest terminal operation when no active operations remain", () => {
    const snapshot = updateAssistantOperationSnapshot({ active: [] }, {
      id: "call_1",
      phase: "failed",
      route: "function_call",
      toolName: "widget.focus",
      message: "没有找到这个小工具"
    });

    expect(getAssistantOperationStatus(snapshot)).toEqual({
      phase: "error",
      command: "widget.focus",
      message: "没有找到这个小工具"
    });
  });

  it("clears a stale terminal operation without clearing active work", () => {
    const terminal = updateAssistantOperationSnapshot({ active: [] }, {
      id: "call_1",
      phase: "failed",
      route: "function_call",
      toolName: "music.play",
      message: "没有可播放的音乐"
    });

    expect(clearAssistantTerminalOperation(terminal, "call_1")).toEqual({ active: [] });

    const active = updateAssistantOperationSnapshot(terminal, {
      id: "call_2",
      phase: "running",
      route: "shortcut",
      toolName: "board.add_widget"
    });
    expect(clearAssistantTerminalOperation(active, "call_1")).toBe(active);
  });
});
