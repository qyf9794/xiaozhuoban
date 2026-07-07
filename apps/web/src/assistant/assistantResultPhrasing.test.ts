import { describe, expect, it } from "vitest";
import { formatAssistantResultMessage } from "./assistantResultPhrasing";

describe("assistant result phrasing", () => {
  it("formats successful execution as concise natural variants", () => {
    const first = formatAssistantResultMessage({
      status: "success",
      message: "已添加小工具",
      toolName: "board.add_widget",
      data: { widgetType: "music" },
      seed: "trace_1"
    });
    const second = formatAssistantResultMessage({
      status: "success",
      message: "已添加小工具",
      toolName: "board.add_widget",
      data: { widgetType: "music" },
      seed: "trace_1"
    });

    expect(first).toBe(second);
    expect(first).toMatch(/音乐播放器/);
    expect(first).toMatch(/[。]$/);
  });

  it("keeps confirmation and failure messages precise", () => {
    expect(formatAssistantResultMessage({ status: "needs_confirmation", message: "确认执行 board.auto_align 吗？" })).toBe(
      "确认执行 board.auto_align 吗？"
    );
    expect(formatAssistantResultMessage({ status: "failed", message: "没有找到这个小工具" })).toBe("没有找到这个小工具");
  });
});
