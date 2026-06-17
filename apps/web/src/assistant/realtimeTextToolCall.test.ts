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

const context: CompactAssistantContext = {
  boardId: "board_1",
  boardName: "默认桌板",
  availableBoards: [{ boardId: "board_1", name: "默认桌板", active: true }],
  availableDefinitions: [
    { definitionId: "wd_music", type: "music", name: "音乐" },
    { definitionId: "wd_note", type: "note", name: "便签" }
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
    const body = JSON.parse(createRealtimeToolSelectionRequestBody("关闭音乐", tools));
    const serialized = JSON.stringify(body);

    expect(body).toMatchObject({ input: "关闭音乐", phase: "select" });
    expect(serialized).toContain("widget.remove");
    expect(serialized).not.toContain("context");
    expect(serialized).not.toContain("wi_music");
    expect(serialized).not.toContain("private note");
  });

  it("creates realtime selection instructions and a selector tool without board widget context", () => {
    const instructions = createRealtimeToolSelectionInstructions(tools);
    const selector = createRealtimeToolSelectionTool(tools);
    const serialized = JSON.stringify({ instructions, selector });

    expect(serialized).toContain("widget.remove");
    expect(serialized).toContain("music.pause");
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
        { name: "widget.remove", targetHint: "音乐" }
      )
    );
    const serialized = JSON.stringify(body);

    expect(body).toMatchObject({ input: "关闭音乐", phase: "execute", selection: { name: "widget.remove" } });
    expect(serialized).toContain("wi_music");
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
    expect(serialized).toContain("widget__dot__remove");
    expect(serialized).not.toContain("music__dot__pause");
    expect(serialized).toContain("wi_music");
    expect(serialized).not.toContain("private note");
  });
});
