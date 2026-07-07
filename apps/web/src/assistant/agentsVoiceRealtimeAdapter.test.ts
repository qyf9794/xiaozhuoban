import { describe, expect, it, vi } from "vitest";
import { createAgentsCommandExecutionTool } from "./agentsVoiceRealtimeAdapter";
import { encodeRealtimeToolName, REALTIME_COMMAND_EXECUTION_TOOL_NAME } from "./realtimeSessionConfig";

describe("AgentsVoiceRealtimeAdapter", () => {
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
});
