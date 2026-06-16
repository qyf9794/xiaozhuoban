import { describe, expect, it } from "vitest";
import {
  getVoiceAssistantConnectionMessage,
  getVoiceAssistantDockStateForRealtimeStatus,
  getVoiceAssistantDockStatusText,
  prependVoiceAssistantHistory,
  type VoiceAssistantDockState
} from "./VoiceAssistantDock";

describe("VoiceAssistantDock", () => {
  it("maps runtime states to short status labels", () => {
    const cases: Array<[VoiceAssistantDockState, string]> = [
      ["disconnected", "未连接"],
      ["connecting", "连接中"],
      ["listening", "聆听中"],
      ["thinking", "理解中"],
      ["executing", "执行中"],
      ["waiting_confirmation", "待确认"],
      ["error", "有错误"],
      ["muted", "已静音"]
    ];

    cases.forEach(([state, label]) => {
      expect(getVoiceAssistantDockStatusText(state)).toBe(label);
    });
  });

  it("keeps newest text command history bounded", () => {
    const history = [
      { id: "1", text: "打开天气", result: "好了", route: "shortcut" },
      { id: "2", text: "整理桌面", result: "请确认", route: "shortcut" }
    ];

    const next = prependVoiceAssistantHistory(history, {
      id: "3",
      text: "取消",
      result: "已取消",
      route: "shortcut"
    }, 2);

    expect(next).toEqual([
      { id: "3", text: "取消", result: "已取消", route: "shortcut" },
      { id: "1", text: "打开天气", result: "好了", route: "shortcut" }
    ]);
  });

  it("maps realtime connection status to dock state and short messages", () => {
    expect(getVoiceAssistantDockStateForRealtimeStatus("disconnected")).toBe("disconnected");
    expect(getVoiceAssistantDockStateForRealtimeStatus("connecting")).toBe("connecting");
    expect(getVoiceAssistantDockStateForRealtimeStatus("connected")).toBe("listening");
    expect(getVoiceAssistantDockStateForRealtimeStatus("failed")).toBe("error");
    expect(getVoiceAssistantDockStateForRealtimeStatus("microphone_denied")).toBe("error");

    expect(getVoiceAssistantConnectionMessage("connected")).toBe("语音已连接，可以直接说话。");
    expect(getVoiceAssistantConnectionMessage("microphone_denied")).toBe("麦克风权限被拒绝。");
  });
});
