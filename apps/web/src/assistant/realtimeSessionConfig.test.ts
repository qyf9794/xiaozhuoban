import { describe, expect, it } from "vitest";
import { createPassthroughSchema } from "@xiaozhuoban/assistant-core";
import {
  XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
  XIAOZHUOBAN_REALTIME_MODEL,
  clampRealtimeClientSecretTtl,
  createInitialRegisteredRealtimeTools,
  createInitialRealtimeToolSpecs,
  createInitialRealtimeTools,
  createRealtimeContextInstructions,
  createRealtimeClientSecretPayload,
  createRealtimeTurnDetection,
  decodeRealtimeToolName,
  encodeRealtimeToolName,
  serializeAssistantToolForRealtime
} from "./realtimeSessionConfig";

describe("realtime session config", () => {
  it("clamps client secret TTL to a bounded short-lived range", () => {
    expect(clampRealtimeClientSecretTtl(undefined)).toBe(600);
    expect(clampRealtimeClientSecretTtl(2)).toBe(10);
    expect(clampRealtimeClientSecretTtl(999_999)).toBe(7200);
    expect(clampRealtimeClientSecretTtl(30.8)).toBe(30);
  });

  it("creates only desktop-level initial tool specs", () => {
    const specs = createInitialRealtimeToolSpecs();
    const names = specs.map((tool) => tool.name);

    expect(names).toContain("board.add_widget");
    expect(names).toContain("widget.focus");
    expect(names).toContain("widget.fullscreen_focus");
    expect(names).toContain("board.auto_align");
    expect(names).not.toContain("assistant.out_of_scope");
    expect(names).not.toContain("gomoku.play");
    expect(names.some((name) => name.includes("note.") || name.includes("weather.") || name.includes("tv."))).toBe(false);
    expect(specs.every((tool) => tool.scope === "desktop")).toBe(true);
  });

  it("serializes registered Realtime tools as function tool schemas", () => {
    const tools = createInitialRegisteredRealtimeTools();
    const addWidget = tools.find((tool) => decodeRealtimeToolName(tool.name) === "board.add_widget");

    expect(tools.every((tool) => tool.type === "function")).toBe(true);
    expect(tools.every((tool) => /^[a-zA-Z0-9_-]+$/.test(tool.name))).toBe(true);
    expect(tools.map((tool) => tool.name)).toContain("board__dot__add_widget");
    expect(addWidget?.parameters).toMatchObject({
      type: "object",
      required: ["definitionId"],
      additionalProperties: false
    });
  });

  it("infers target parameters for scoped Realtime tool updates", () => {
    const removeWidget = serializeAssistantToolForRealtime({
      name: "widget.remove",
      description: "关闭小工具",
      parameters: createPassthroughSchema<Record<string, unknown>>(),
      scope: "desktop",
      requiresTarget: true
    });

    expect(removeWidget.parameters).toMatchObject({
      type: "object",
      properties: { widgetId: { type: "string" } },
      required: ["widgetId"],
      additionalProperties: false
    });
  });

  it("starts Realtime sessions with only the tool-selection function", () => {
    const tools = createInitialRealtimeTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("assistant__dot__select_tool");
    expect(JSON.stringify(tools[0]?.parameters)).toContain("board.add_widget");
    expect(JSON.stringify(tools[0]?.parameters)).not.toContain("widgetId");
  });

  it("builds an official-doc-aligned Realtime client secret payload", () => {
    const payload = createRealtimeClientSecretPayload({ ttlSeconds: 120, reasoningEffort: "minimal" });

    expect(payload.expires_after).toEqual({ anchor: "created_at", seconds: 120 });
    expect(payload.session.model).toBe(XIAOZHUOBAN_REALTIME_MODEL);
    expect(payload.session.type).toBe("realtime");
    expect(payload.session.reasoning.effort).toBe("minimal");
    expect(payload.session.output_modalities).toEqual(["audio"]);
    expect(payload.session.audio.output.voice).toBe("marin");
    expect(payload.session.audio.input.turn_detection).toEqual({
      type: "semantic_vad",
      eagerness: "low",
      create_response: true,
      interrupt_response: true
    });
    expect(payload.session.tool_choice).toBe("auto");
    expect(payload.session.parallel_tool_calls).toBe(true);
    expect(payload.session.tools.map((tool) => tool.name)).toEqual(["assistant__dot__select_tool"]);
  });

  it("allows semantic VAD eagerness to be tuned for cutoff testing", () => {
    expect(createRealtimeTurnDetection()).toMatchObject({ type: "semantic_vad", eagerness: "low" });
    expect(createRealtimeTurnDetection({ turnDetectionEagerness: "medium" })).toMatchObject({
      type: "semantic_vad",
      eagerness: "medium"
    });
  });

  it("round trips internal tool names through Realtime-safe names", () => {
    expect(encodeRealtimeToolName("weather.set_city")).toBe("weather__dot__set_city");
    expect(decodeRealtimeToolName("weather__dot__set_city")).toBe("weather.set_city");
  });

  it("keeps instructions short-response and xiaozhuoban-only", () => {
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("控制小桌板");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("已注册工具");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("widget.remove，不需要请求确认");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("删除用户数据");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("回复要短");
  });

  it("appends compact board context for Realtime session updates", () => {
    const instructions = createRealtimeContextInstructions({
      boardId: "board_1",
      boardName: "我的桌板",
      availableDefinitions: [{ definitionId: "wd_music", type: "music", name: "音乐" }],
      widgetCountsByType: { tv: 1 },
      widgets: [
        {
          widgetId: "wi_tv",
          definitionId: "wd_tv",
          type: "tv",
          name: "电视",
          order: 1,
          summary: "CCTV1",
          focused: true
        }
      ],
      focusedWidget: {
        widgetId: "wi_tv",
        definitionId: "wd_tv",
        type: "tv",
        name: "电视",
        order: 1,
        summary: "CCTV1",
        focused: true
      }
    });

    expect(instructions).toContain("Current Xiaozhuoban Context");
    expect(instructions).toContain("board: 我的桌板");
    expect(instructions).toContain("电视(tv) widgetId=wi_tv");
    expect(instructions).toContain("音乐(music) definitionId=wd_music");
  });
});
