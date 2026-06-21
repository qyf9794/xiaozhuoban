import { describe, expect, it } from "vitest";
import { createPassthroughSchema, type AssistantToolSpec, type CompactAssistantContext } from "@xiaozhuoban/assistant-core";
import {
  createRealtimeToolSelectionInstructions,
  createRealtimeToolSelectionRequestBody,
  createRealtimeToolSelectionTool,
  createRealtimeScopedToolCallRequestBody,
  createScopedRealtimeContext,
  createScopedRealtimeToolUpdate,
  createScopedToolCallPayload,
  createToolSelectionPayload,
  extractToolSelectionFromResponsesPayload,
  parseRealtimeTextToolSelectionResponse
} from "./realtimeTextToolCall";

const tools: AssistantToolSpec[] = [
  {
    name: "widget.remove",
    description: "Remove a widget from the current board.",
    parameters: createPassthroughSchema<Record<string, unknown>>(),
    scope: "desktop",
    risk: "safe",
    requiresTarget: true
  },
  {
    name: "music.pause",
    description: "Pause music playback.",
    parameters: createPassthroughSchema<Record<string, unknown>>(),
    scope: "widget-detail",
    widgetType: "music",
    requiresTarget: true
  }
];

const addWidgetTool: AssistantToolSpec = {
  name: "board.add_widget",
  description: "Add a widget to the current board.",
  parameters: createPassthroughSchema<Record<string, unknown>>(),
  scope: "desktop",
  risk: "safe"
};

const musicPlayTool: AssistantToolSpec = {
  name: "music.play",
  description: "Play music.",
  parameters: createPassthroughSchema<Record<string, unknown>>(),
  scope: "widget-detail",
  widgetType: "music",
  requiresTarget: true
};

const context: CompactAssistantContext = {
  contextVersion: "ctx_test",
  toolCatalogVersion: "cat_from_context",
  boardId: "board_1",
  boardName: "默认桌板",
  availableBoards: [{ boardId: "board_1", name: "默认桌板", active: true }],
  availableDefinitions: [
    { definitionId: "wd_music", type: "music", name: "音乐" },
    { definitionId: "wd_note", type: "note", name: "便签" },
    { definitionId: "wd_dialClock", type: "dialClock", name: "时钟" },
    { definitionId: "wd_worldClock", type: "worldClock", name: "世界时钟" }
  ],
  focusedWidget: {
    widgetId: "wi_note",
    definitionId: "wd_note",
    type: "note",
    name: "便签",
    order: 1,
    summary: "private note",
    focused: true
  },
  widgetCountsByType: { music: 1, note: 1 },
  widgets: [
    {
      widgetId: "wi_music",
      definitionId: "wd_music",
      type: "music",
      name: "音乐播放器",
      order: 2,
      summary: "正在播放"
    },
    {
      widgetId: "wi_note",
      definitionId: "wd_note",
      type: "note",
      name: "便签",
      order: 1,
      summary: "private note",
      focused: true
    }
  ]
};

const moduleCatalog = [
  {
    catalogVersion: "cat_test",
    type: "music",
    displayName: "音乐",
    aliases: ["音乐"],
    capabilities: ["播放", "暂停"],
    shortcutExamples: ["暂停音乐"],
    riskSummary: []
  },
  {
    catalogVersion: "cat_test",
    type: "weather",
    displayName: "天气",
    aliases: ["天气"],
    capabilities: ["查询城市天气"],
    shortcutExamples: ["北京天气"],
    riskSummary: []
  }
];

const moduleContext = {
  moduleType: "weather",
  tools: [tools[0]!],
  toolSchemas: {},
  instances: [
    {
      widgetId: "wi_weather",
      definitionId: "wd_weather",
      type: "weather",
      name: "天气",
      order: 3,
      summary: "北京"
    }
  ],
  stateSummary: { instanceCount: 1 },
  shortcutExamples: ["北京天气"],
  executionPolicy: { defaultMode: "latest-wins" as const },
  riskPolicy: { safe: ["weather.set_city"], confirm: [], destructive: [] }
};

describe("Realtime text tool call fallback", () => {
  it("creates a first-pass tool selection payload without board widget context", () => {
    const payload = createToolSelectionPayload({ input: "关闭音乐", context, tools });
    const serialized = JSON.stringify(payload);

    expect(serialized).toContain("widget.remove");
    expect(serialized).toContain("music.pause");
    expect(serialized).not.toContain("wi_music");
    expect(serialized).not.toContain("private note");
  });

  it("creates a selector request body without desktop context", () => {
    const body = JSON.parse(createRealtimeToolSelectionRequestBody("关闭音乐", tools, moduleCatalog));
    const serialized = JSON.stringify(body);

	    expect(body).toMatchObject({ input: "关闭音乐", phase: "select" });
	    expect(body.toolCatalogVersion).toBe("cat_test");
	    expect(serialized).toContain("moduleCatalog");
    expect(serialized).toContain("weather");
    expect(serialized).toContain("widget.remove");
    expect(serialized).not.toContain("context");
    expect(serialized).not.toContain("wi_music");
    expect(serialized).not.toContain("private note");
  });

  it("creates realtime selection instructions and a selector tool without board widget context", () => {
    const instructions = createRealtimeToolSelectionInstructions(tools, moduleCatalog);
    const selector = createRealtimeToolSelectionTool(tools);
    const serialized = JSON.stringify({ instructions, selector });

    expect(serialized).toContain("widget.remove");
    expect(serialized).toContain("music.pause");
	    expect(serialized).toContain("模块目录");
	    expect(serialized).toContain("toolCatalogVersion=cat_test");
	    expect(serialized).toContain("weather");
    expect(serialized).toContain("确认是否在线");
    expect(serialized).toContain("很短的中文自然回复");
    expect(serialized).toContain("关闭留言板禁止使用 messageBoard.send");
    expect(serialized).toContain("dialClock");
    expect(serialized).toContain("music.play");
    expect(serialized).toContain("music.auth_status");
    expect(serialized).toContain("assistant.runtime_diagnostics");
    expect(serialized).toContain("assistant__dot__select_tool");
    expect(serialized).not.toContain("wi_music");
    expect(serialized).not.toContain("private note");
  });

  it("extracts allowed tool selections", () => {
    const selection = extractToolSelectionFromResponsesPayload(
      {
        output: [
          {
            type: "function_call",
            name: "assistant__dot__select_tool",
            call_id: "call_1",
            arguments: JSON.stringify({ name: "widget.remove", targetHint: "音乐", confidence: 0.9 })
          }
        ]
      },
      new Set(tools.map((tool) => tool.name))
    );

    expect(selection).toEqual({ name: "widget.remove", targetHint: "音乐", confidence: 0.9 });
  });

  it("parses selection responses from the backend", () => {
    expect(
      parseRealtimeTextToolSelectionResponse({
        call: null,
        selection: { name: "widget.remove", targetHint: "音乐", confidence: 0.9 }
      })
    ).toEqual({ name: "widget.remove", targetHint: "音乐", confidence: 0.9 });
    expect(parseRealtimeTextToolSelectionResponse({ call: null, selection: null })).toBeNull();
  });

  it("scopes second-pass context to the selected target family", () => {
    const scoped = createScopedRealtimeContext(context, tools[0]!, { name: "widget.remove", targetHint: "音乐" }, "关闭音乐");

    expect(scoped.widgets.map((widget) => widget.widgetId)).toEqual(["wi_music"]);
    expect(scoped.availableDefinitions).toBeUndefined();
  });

  it("keeps add-widget definitions available when the spoken target is ambiguous", () => {
    const scoped = createScopedRealtimeContext(context, addWidgetTool, { name: "board.add_widget", targetHint: "播放器" }, "打开播放器");

    expect(scoped.availableDefinitions?.map((definition) => definition.definitionId)).toEqual([
      "wd_music",
      "wd_note",
      "wd_dialClock",
      "wd_worldClock"
    ]);
  });

  it("allows opening a missing music widget with a follow-up play command", () => {
    const contextWithoutMusic: CompactAssistantContext = {
      ...context,
      widgetCountsByType: { note: 1 },
      widgets: context.widgets.filter((widget) => widget.type !== "music")
    };
    const update = createScopedRealtimeToolUpdate(
      { input: "播放陈奕迅的十年", context: contextWithoutMusic, tools: [addWidgetTool, musicPlayTool] },
      { name: "music.play", selectedModule: "music", targetHint: "陈奕迅 十年" }
    );
    const serialized = JSON.stringify(update);

    expect(serialized).toContain("board__dot__add_widget");
    expect(serialized).toContain("music__dot__play");
    expect(serialized).toContain("followUp");
    expect(serialized).toContain("wd_music");
  });

  it("creates a second-pass payload with only the selected tool", () => {
    const payload = createScopedToolCallPayload(
      { input: "关闭音乐", context, tools },
      { name: "widget.remove", targetHint: "音乐" }
    );
    const serialized = JSON.stringify(payload);

    expect(serialized).toContain("widget__dot__remove");
    expect(serialized).not.toContain("music__dot__pause");
    expect(serialized).toContain("wi_music");
    expect(serialized).not.toContain("wd_note");
  });

  it("creates an execute request body with scoped context only", () => {
    const scopedContext = createScopedRealtimeContext(context, tools[0]!, { name: "widget.remove", targetHint: "音乐" }, "关闭音乐");
    const body = JSON.parse(
      createRealtimeScopedToolCallRequestBody(
        "关闭音乐",
        scopedContext,
        tools,
        { name: "widget.remove", selectedModule: "weather", targetHint: "音乐" },
        moduleContext
      )
    );
    const serialized = JSON.stringify(body);

	    expect(body).toMatchObject({
	      input: "关闭音乐",
	      phase: "execute",
	      contextVersion: "ctx_test",
	      toolCatalogVersion: "cat_from_context",
	      selection: { name: "widget.remove" }
	    });
    expect(serialized).toContain("wi_music");
    expect(serialized).toContain("moduleContext");
    expect(serialized).toContain("wi_weather");
    expect(serialized).not.toContain("wi_note");
    expect(serialized).not.toContain("private note");
  });

  it("creates a scoped realtime session update after tool selection", () => {
    const update = createScopedRealtimeToolUpdate(
      { input: "关闭音乐", context, tools },
      { name: "widget.remove", targetHint: "音乐" }
    );
    const serialized = JSON.stringify(update);

    expect(update?.type).toBe("session.update");
    expect(update?.session.type).toBe("realtime");
    expect(update?.session.tool_choice).toBe("required");
    expect(update?.session.audio?.input?.turn_detection).toMatchObject({ type: "semantic_vad", create_response: true });
    expect(update?.session.audio?.input?.transcription).toEqual({ model: "gpt-4o-mini-transcribe" });
    expect(serialized).toContain("widget__dot__remove");
    expect(serialized).not.toContain("music__dot__pause");
    expect(serialized).toContain("wi_music");
    expect(serialized).not.toContain("private note");
  });

  it("instructs realtime to open widgets by choosing a definitionId", () => {
    const update = createScopedRealtimeToolUpdate(
      { input: "打开音乐", context, tools: [addWidgetTool] },
      { name: "board.add_widget", targetHint: "音乐" }
    );
    const serialized = JSON.stringify(update);

    expect(update?.type).toBe("session.update");
    expect(serialized).toContain("definitionId");
    expect(serialized).toContain("wd_music");
    expect(serialized).toContain("不要回答缺少打开小工具的方式");
    expect(serialized).toContain("默认打开 dialClock");
  });
});
