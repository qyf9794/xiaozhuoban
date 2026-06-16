import { describe, expect, it } from "vitest";
import {
  getVoiceAssistantConnectionMessage,
  getVoiceAssistantDockStateForRealtimeStatus,
  getVoiceAssistantErrorMessage,
  getVoiceAssistantDockStatusText,
  getVoiceAssistantOperationText,
  prependVoiceAssistantHistory,
  resolveVoiceAssistantSubmitText,
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

  it("formats current operation status for the visible bubble", () => {
    expect(getVoiceAssistantOperationText({ phase: "idle" })).toBe("待命");
    expect(getVoiceAssistantOperationText({ phase: "thinking", command: "添加便签" })).toBe("理解中：添加便签");
    expect(getVoiceAssistantOperationText({ phase: "executing", command: "整理桌板" })).toBe("执行中：整理桌板");
    expect(getVoiceAssistantOperationText({ phase: "waiting_confirmation", command: "整理桌板" })).toBe("待确认：整理桌板");
    expect(getVoiceAssistantOperationText({ phase: "success", command: "添加便签", message: "已添加小工具" })).toBe(
      "完成：已添加小工具"
    );
    expect(getVoiceAssistantOperationText({ phase: "error", command: "添加便签", message: "未知工具" })).toBe(
      "失败：未知工具"
    );
  });

  it("falls back to the real input value when submitting commands", () => {
    expect(resolveVoiceAssistantSubmitText(" 添加便签 ", "整理桌板")).toBe("添加便签");
    expect(resolveVoiceAssistantSubmitText("", " 整理桌板 ")).toBe("整理桌板");
    expect(resolveVoiceAssistantSubmitText("   ", undefined)).toBe("");
  });

  it("maps realtime connection status to dock state and short messages", () => {
    expect(getVoiceAssistantDockStateForRealtimeStatus("disconnected")).toBe("disconnected");
    expect(getVoiceAssistantDockStateForRealtimeStatus("connecting")).toBe("connecting");
    expect(getVoiceAssistantDockStateForRealtimeStatus("connected")).toBe("listening");
    expect(getVoiceAssistantDockStateForRealtimeStatus("failed")).toBe("error");
    expect(getVoiceAssistantDockStateForRealtimeStatus("microphone_denied")).toBe("error");

    expect(getVoiceAssistantConnectionMessage("connected")).toBe("语音已连接，可以直接说话。");
    expect(getVoiceAssistantConnectionMessage("microphone_denied")).toBe(
      "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。"
    );
  });

  it("shows actionable messages for realtime connection failures", () => {
    expect(getVoiceAssistantErrorMessage(new Error("OPENAI_API_KEY_MISSING"))).toBe(
      "后端缺少 OPENAI_API_KEY，配置后再连接。"
    );
    expect(getVoiceAssistantErrorMessage(new Error("MICROPHONE_DENIED"))).toBe(
      "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。"
    );
    expect(getVoiceAssistantErrorMessage(new Error("REALTIME_SDP_FAILED"))).toBe("Realtime 语音通道连接失败。");
    expect(getVoiceAssistantErrorMessage(new Error("custom"))).toBe("custom");
  });
});
