import { describe, expect, it } from "vitest";
import { getVoiceAssistantDockStatusText, type VoiceAssistantDockState } from "./VoiceAssistantDock";

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
});
