import { describe, expect, it } from "vitest";
import {
  getVoiceAssistantConnectionMessage,
  getVoiceAssistantDockStateForRealtimeStatus,
  getVoiceAssistantErrorMessage,
  getVoiceAssistantDockStatusText,
  getVisibleVoiceAssistantOperation,
  getVoiceAssistantRuntimeText,
  getVoiceAssistantPreviewLines,
  getVoiceAssistantOperationText,
  prependVoiceAssistantHistory,
  resolveVoiceAssistantSubmitText,
  shouldDisableVoiceAssistantSend,
  shouldSubmitVoiceAssistantOnKeyDown,
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

  it("submits only plain Enter from the command input", () => {
    expect(shouldSubmitVoiceAssistantOnKeyDown({ key: "Enter" })).toBe(true);
    expect(shouldSubmitVoiceAssistantOnKeyDown({ key: "Enter", shiftKey: true })).toBe(false);
    expect(shouldSubmitVoiceAssistantOnKeyDown({ key: "Enter", ctrlKey: true })).toBe(false);
    expect(shouldSubmitVoiceAssistantOnKeyDown({ key: "Enter", metaKey: true })).toBe(false);
    expect(shouldSubmitVoiceAssistantOnKeyDown({ key: "Enter", isComposing: true })).toBe(false);
    expect(shouldSubmitVoiceAssistantOnKeyDown({ key: "Escape" })).toBe(false);
  });

  it("keeps send available for DOM-backed command fallback", () => {
    expect(shouldDisableVoiceAssistantSend(false)).toBe(false);
    expect(shouldDisableVoiceAssistantSend(true)).toBe(true);
  });

  it("uses external tool operation only while the dock is idle", () => {
    const external = { phase: "executing" as const, command: "board.add_widget" };

    expect(getVisibleVoiceAssistantOperation({ phase: "idle" }, external)).toBe(external);
    expect(getVisibleVoiceAssistantOperation({ phase: "thinking", command: "连接语音" }, external)).toEqual({
      phase: "thinking",
      command: "连接语音"
    });
  });

  it("formats runtime mode with visible outbox count", () => {
    expect(getVoiceAssistantRuntimeText("local_standby · Realtime 0s · $0.0000", 0)).toBe(
      "local_standby · Realtime 0s · $0.0000"
    );
    expect(getVoiceAssistantRuntimeText("saving_mode · Realtime 30s · $0.8000", 2)).toBe(
      "saving_mode · Realtime 30s · $0.8000 · 待同步 2"
    );
  });

  it("formats confirmation preview lines for the visible preview gate", () => {
    const lines = getVoiceAssistantPreviewLines({
      id: "confirm_1",
      actionName: "clipboard.clear",
      arguments: { widgetId: "clip_1" },
      message: "确认执行 clipboard.clear 吗？",
      createdAt: "2026-06-17T00:00:00.000Z",
      preview: {
        commands: [
          {
            module: "clipboard",
            tool: "clipboard.clear",
            impact: "将清空剪贴板摘要",
            reversible: false
          }
        ],
        recovery: "取消后不会执行相关依赖链"
      }
    });

    expect(lines).toEqual([
      "clipboard / clipboard.clear · 将清空剪贴板摘要 · 不可撤销",
      "恢复策略：取消后不会执行相关依赖链"
    ]);
  });

  it("maps realtime connection status to dock state and short messages", () => {
    expect(getVoiceAssistantDockStateForRealtimeStatus("disconnected")).toBe("disconnected");
    expect(getVoiceAssistantDockStateForRealtimeStatus("connecting")).toBe("connecting");
    expect(getVoiceAssistantDockStateForRealtimeStatus("configuring")).toBe("connecting");
    expect(getVoiceAssistantDockStateForRealtimeStatus("connected")).toBe("listening");
    expect(getVoiceAssistantDockStateForRealtimeStatus("failed")).toBe("error");
    expect(getVoiceAssistantDockStateForRealtimeStatus("session_failed")).toBe("error");
    expect(getVoiceAssistantDockStateForRealtimeStatus("microphone_denied")).toBe("error");
    expect(getVoiceAssistantDockStateForRealtimeStatus("microphone_unavailable")).toBe("error");

    expect(getVoiceAssistantConnectionMessage("configuring")).toBe("正在应用语音会话配置。");
    expect(getVoiceAssistantConnectionMessage("connected")).toBe("语音已连接，可以直接说话。");
    expect(getVoiceAssistantConnectionMessage("session_failed")).toBe("Realtime 会话配置未生效，请重试。");
    expect(getVoiceAssistantConnectionMessage("microphone_denied")).toBe(
      "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。"
    );
    expect(getVoiceAssistantConnectionMessage("microphone_unavailable")).toBe(
      "没有检测到可用麦克风，或当前浏览器不支持录音。"
    );
  });

  it("shows actionable messages for realtime connection failures", () => {
    expect(getVoiceAssistantErrorMessage(new Error("OPENAI_API_KEY_MISSING"))).toBe(
      "后端缺少 OPENAI_API_KEY，配置后再连接。"
    );
    expect(getVoiceAssistantErrorMessage(new Error("MICROPHONE_DENIED"))).toBe(
      "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。"
    );
    expect(getVoiceAssistantErrorMessage(new Error("MICROPHONE_UNAVAILABLE"))).toBe(
      "没有检测到可用麦克风，或当前浏览器不支持录音。"
    );
    expect(getVoiceAssistantErrorMessage(new Error("REALTIME_SDP_FAILED"))).toBe("Realtime 语音通道连接失败。");
    expect(getVoiceAssistantErrorMessage(new Error("custom"))).toBe("custom");
  });
});
