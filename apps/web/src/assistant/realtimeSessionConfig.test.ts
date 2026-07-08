import { describe, expect, it } from "vitest";
import { createPassthroughSchema } from "@xiaozhuoban/assistant-core";
import {
  XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
  XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL,
  XIAOZHUOBAN_REALTIME_MINI_MODEL,
  XIAOZHUOBAN_REALTIME_MODEL,
  XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL,
  clampRealtimeClientSecretTtl,
  createInitialRegisteredRealtimeTools,
  createInitialRealtimeToolSpecs,
  createInitialRealtimeTools,
  createRealtimeInputTranscription,
  createRealtimeContextInstructions,
  createRealtimeClientSecretPayload,
  createRealtimeSessionAudioConfig,
  createRealtimeTurnDetection,
  decodeRealtimeToolName,
  encodeRealtimeToolName,
  resolveXiaozhuobanRealtimeModel,
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
    const focusSpec = specs.find((tool) => tool.name === "widget.focus");
    const sidebarSpec = specs.find((tool) => tool.name === "app.sidebar.set");

    expect(names).toContain("board.add_widget");
    expect(names).toContain("app.sidebar.set");
    expect(names).toContain("app.settings.open");
    expect(names).toContain("app.wallpaper.pick");
    expect(names).toContain("widget.focus");
    expect(names).toContain("widget.fullscreen_focus");
    expect(names).toContain("board.auto_align");
    expect(names).not.toContain("assistant.out_of_scope");
    expect(names).not.toContain("gomoku.play");
    expect(names.some((name) => name.includes("note.") || name.includes("weather.") || name.includes("tv."))).toBe(false);
    expect(specs.every((tool) => tool.scope === "desktop")).toBe(true);
    expect(focusSpec?.argumentKeys).toEqual(["widgetId"]);
    expect((focusSpec?.parameters as { jsonSchema?: unknown }).jsonSchema).toMatchObject({
      type: "object",
      properties: { widgetId: { type: "string" } },
      required: ["widgetId"],
      additionalProperties: false
    });
    expect(focusSpec?.parameters.safeParse({ widgetId: "wi_1" }).success).toBe(true);
    expect(focusSpec?.parameters.safeParse({ widgetId: "wi_1", extra: true }).success).toBe(false);
    expect(sidebarSpec?.argumentKeys).toEqual(["open", "mode"]);
  });

  it("serializes registered Realtime tools as function tool schemas", () => {
    const tools = createInitialRegisteredRealtimeTools();
    const addWidget = tools.find((tool) => decodeRealtimeToolName(tool.name) === "board.add_widget");

    expect(tools.every((tool) => tool.type === "function")).toBe(true);
    expect(tools.every((tool) => /^[a-zA-Z0-9_-]+$/.test(tool.name))).toBe(true);
    expect(tools.map((tool) => tool.name)).toContain("board__dot__add_widget");
    expect(tools.map((tool) => tool.name)).toContain("app__dot__sidebar__dot__set");
    expect(tools.map((tool) => tool.name)).toContain("app__dot__wallpaper__dot__pick");
    expect(addWidget?.parameters).toMatchObject({
      type: "object",
      required: ["definitionId"],
      additionalProperties: false
    });
    expect(tools.find((tool) => decodeRealtimeToolName(tool.name) === "widget.focus")?.parameters).toMatchObject({
      type: "object",
      required: ["widgetId"],
      additionalProperties: false
    });
    expect(tools.find((tool) => "strict" in tool)).toBeUndefined();
    expect(tools.find((tool) => decodeRealtimeToolName(tool.name) === "board.add_widget")?.strict).toBeUndefined();
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
    expect(removeWidget.strict).toBeUndefined();
  });

  it("keeps optional-field schemas constrained without sending top-level strict", () => {
    const sidebar = serializeAssistantToolForRealtime({
      name: "app.sidebar.set",
      description: "切换侧边栏",
      parameters: createPassthroughSchema<Record<string, unknown>>(),
      scope: "desktop"
    });

    expect(sidebar.parameters).toMatchObject({
      type: "object",
      properties: {
        open: { type: "boolean" },
        mode: { type: "string", enum: ["show", "hide", "toggle"] }
      },
      additionalProperties: false
    });
    expect(sidebar.strict).toBeUndefined();
  });

  it("starts Realtime sessions with tool selection and a command fallback", () => {
    const tools = createInitialRealtimeTools();

    expect(tools.map((tool) => tool.name)).toEqual(["assistant__dot__select_tool", "assistant__dot__execute_command"]);
    expect(JSON.stringify(tools[0]?.parameters)).toContain("name");
    expect(JSON.stringify(tools[0]?.parameters)).toContain("selectedModule");
    expect(JSON.stringify(tools[0]?.parameters)).toContain("board");
    expect(JSON.stringify(tools[0]?.parameters)).toContain("board.add_widget");
    expect(JSON.stringify(tools[0]?.parameters)).not.toContain("widgetId");
    expect(JSON.stringify(tools[1]?.parameters)).toContain("command");
  });

  it("builds an official-doc-aligned Realtime client secret payload", () => {
    const payload = createRealtimeClientSecretPayload({ ttlSeconds: 120, reasoningEffort: "minimal" });

    expect(payload.expires_after).toEqual({ anchor: "created_at", seconds: 120 });
    expect(payload.session.model).toBe(XIAOZHUOBAN_REALTIME_MODEL);
    expect(payload.session.type).toBe("realtime");
    expect(payload.session.reasoning.effort).toBe("minimal");
    expect(payload.session.max_output_tokens).toBe(480);
    expect("output_modalities" in payload.session).toBe(false);
    expect(payload.session.audio.output.voice).toBe("marin");
    expect(payload.session.audio.input.turn_detection).toEqual({
      type: "semantic_vad",
      eagerness: "low",
      create_response: true,
      interrupt_response: true
    });
    expect(payload.session.audio.input.transcription).toEqual({ model: "gpt-4o-mini-transcribe" });
    expect(payload.session.tool_choice).toBe("auto");
    expect(payload.session.parallel_tool_calls).toBe(true);
    expect(payload.session.tools.map((tool) => tool.name)).toEqual(["assistant__dot__select_tool", "assistant__dot__execute_command"]);
  });

  it("uses mini as the default Realtime model and switches high-accuracy mode to gpt-realtime-2.1", () => {
    expect(XIAOZHUOBAN_REALTIME_MODEL).toBe(XIAOZHUOBAN_REALTIME_MINI_MODEL);
    expect(resolveXiaozhuobanRealtimeModel()).toBe("gpt-realtime-2.1-mini");
    expect(resolveXiaozhuobanRealtimeModel({ highAccuracy: true })).toBe(XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL);
    expect(createRealtimeClientSecretPayload({ highAccuracy: true }).session.model).toBe("gpt-realtime-2.1");
  });

  it("keeps text fallback model separate from the realtime model", () => {
    expect(XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL).toBeTruthy();
    expect(XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL).not.toBe(XIAOZHUOBAN_REALTIME_MODEL);
  });

  it("allows semantic VAD eagerness to be tuned for cutoff testing", () => {
    expect(createRealtimeTurnDetection()).toMatchObject({ type: "semantic_vad", eagerness: "low" });
    expect(createRealtimeTurnDetection({ turnDetectionEagerness: "medium" })).toMatchObject({
      type: "semantic_vad",
      eagerness: "medium"
    });
  });

  it("enables low-cost input audio transcription for user speech diagnostics", () => {
    expect(createRealtimeInputTranscription()).toEqual({ model: "gpt-4o-mini-transcribe" });
  });

  it("reuses audio config for session updates without dropping voice turn detection", () => {
    expect(createRealtimeSessionAudioConfig()).toEqual({
      input: {
        turn_detection: {
          type: "semantic_vad",
          eagerness: "low",
          create_response: true,
          interrupt_response: true
        },
        transcription: { model: "gpt-4o-mini-transcribe" }
      },
      output: { voice: "marin" }
    });
  });

  it("round trips internal tool names through Realtime-safe names", () => {
    expect(encodeRealtimeToolName("weather.set_city")).toBe("weather__dot__set_city");
    expect(decodeRealtimeToolName("weather__dot__set_city")).toBe("weather.set_city");
  });

  it("keeps instructions short-response and xiaozhuoban-only", () => {
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("控制小桌板");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("已注册工具");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("优先调用 assistant.select_tool");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("才调用 assistant.execute_command");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("scoped session.update 失败");
    expect(XIAOZHUOBAN_REALTIME_INSTRUCTIONS).toContain("优先选择最接近的已注册工具");
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
