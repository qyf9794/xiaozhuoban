import { describe, expect, it, vi } from "vitest";
import { AgentsVoiceRealtimeAdapter, createAgentsCommandExecutionTool, createAgentsToolSelectionTool } from "./agentsVoiceRealtimeAdapter";
import { encodeRealtimeToolName, REALTIME_COMMAND_EXECUTION_TOOL_NAME } from "./realtimeSessionConfig";

describe("AgentsVoiceRealtimeAdapter", () => {
  const musicPlayTool = {
    name: "music.play",
    description: "Play music from a query.",
    scope: "widget-detail",
    widgetType: "music",
    requiresTarget: false,
    risk: "safe",
    parameters: {}
  } as never;

  it("keeps SDK function calls routed through the existing command harness callback", async () => {
    const onCommand = vi.fn(async () => ({ status: "success" as const, message: "已打开音乐" }));
    const fakeSdk = {
      tool: (options: { name: string; execute: (input: unknown, context?: unknown, details?: unknown) => unknown }) => ({
        name: options.name,
        invoke: (_context: unknown, input: string, details?: unknown) => options.execute(input, undefined, details)
      })
    } as never;

    const sdkTool = createAgentsCommandExecutionTool(fakeSdk, { onCommand });
    const output = await sdkTool.invoke(
      {} as never,
      JSON.stringify({ command: "我想听王菲的歌" }),
      { toolCall: { type: "function_call", name: "assistant__dot__execute_command", arguments: "{}", callId: "sdk_call_1" } }
    );

    expect(sdkTool.name).toBe(encodeRealtimeToolName(REALTIME_COMMAND_EXECUTION_TOOL_NAME));
    expect(onCommand).toHaveBeenCalledWith("我想听王菲的歌", {
      callId: "sdk_call_1",
      commandTraceId: expect.stringMatching(/^sdk_voice_/)
    });
    expect(JSON.parse(String(output))).toEqual({ status: "success", message: "已打开音乐" });
  });

  it("routes SDK select_tool through scoped Realtime session.update", async () => {
    const sendEvent = vi.fn();
    const fakeSdk = {
      tool: (options: { name: string; execute: (input: unknown, context?: unknown, details?: unknown) => unknown }) => ({
        name: options.name,
        invoke: (_context: unknown, input: string, details?: unknown) => options.execute(input, undefined, details)
      })
    } as never;
    const sdkTool = createAgentsToolSelectionTool(fakeSdk, {
      getTools: () => [musicPlayTool],
      getContext: () => ({
        contextVersion: "ctx_1",
        toolCatalogVersion: "tools_1",
        boardId: "board_1",
        boardName: "默认桌板",
        viewport: { width: 1280, height: 720 },
        widgets: [],
        widgetCountsByType: {}
      }) as never,
      getModuleRegistry: () => ({
        getRealtimeCatalog: () => [],
        findModuleForTool: () => ({ type: "music" }),
        getScopedContextForModule: () => ({
          moduleType: "music",
          instances: [],
          stateSummary: {},
          shortcutExamples: [],
          executionPolicy: [],
          riskPolicy: []
        })
      }) as never,
      sendEvent,
      setActiveSelection: vi.fn()
    });

    const output = await sdkTool.invoke(
      {} as never,
      JSON.stringify({
        candidateTools: ["music.play"],
        selectedModule: "music",
        targetHint: "王菲",
        userCommand: "播放王菲"
      }),
      {
        toolCall: {
          type: "function_call",
          callId: "select_call_1",
          name: "assistant__dot__select_tool",
          arguments: "{}"
        }
      }
    );

    expect(JSON.parse(String(output))).toMatchObject({ status: "success" });
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session.update",
        session: expect.objectContaining({
          tool_choice: "required",
          tools: [expect.objectContaining({ name: "music__dot__play" })]
        })
      }),
      expect.stringMatching(/^sdk_select_/)
    );
  });

  it("forwards raw scoped Realtime function calls from SDK transport to the Harness callback", () => {
    const onFunctionCall = vi.fn();
    const adapter = new AgentsVoiceRealtimeAdapter({ onFunctionCall });
    adapter.updateTools([musicPlayTool]);
    (adapter as unknown as { activeCommandTraceId: string }).activeCommandTraceId = "trace_1";
    (adapter as unknown as { activeScopedToolSelection: { userCommand: string } }).activeScopedToolSelection = {
      userCommand: "播放王菲"
    };

    (adapter as unknown as { handleTransportFunctionCall: (event: unknown) => void }).handleTransportFunctionCall({
      type: "response.function_call_arguments.done",
      name: "music__dot__play",
      call_id: "call_1",
      arguments: JSON.stringify({ query: "王菲" })
    });

    expect(onFunctionCall).toHaveBeenCalledWith({
      id: "call_1",
      name: "music.play",
      arguments: { query: "王菲" },
      source: "realtime",
      transcript: "播放王菲"
    });
  });
});
