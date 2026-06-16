import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./tool-call.js";

class MockResponse {
  statusCode = 200;
  body = "";
  headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  end(body: string): void {
    this.body = body;
  }
}

function createRequest(body: unknown, method = "POST") {
  const request = Readable.from([JSON.stringify(body)]) as Readable & { method?: string };
  request.method = method;
  return request;
}

async function callHandler(body: unknown) {
  const request = createRequest(body);
  const response = new MockResponse();
  await handler(request as never, response as never);
  return response;
}

describe("realtime text tool-call API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("runs tool selection before sending scoped context for the selected tool", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "function_call",
                name: "assistant__dot__select_tool",
                call_id: "select_1",
                arguments: JSON.stringify({ name: "widget.remove", targetHint: "音乐", confidence: 0.9 })
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              {
                type: "function_call",
                name: "widget__dot__remove",
                call_id: "call_1",
                arguments: JSON.stringify({ widgetId: "wi_music" })
              }
            ]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callHandler({
      input: "关音乐",
      tools: [
        {
          name: "widget.remove",
          description: "删除小工具",
          scope: "desktop",
          requiresTarget: true,
          risk: "destructive"
        },
        {
          name: "music.pause",
          description: "暂停音乐",
          scope: "widget-detail",
          widgetType: "music",
          requiresTarget: true
        }
      ],
      context: {
        boardId: "board_1",
        boardName: "默认桌板",
        widgetCountsByType: { music: 1, note: 1 },
        widgets: [
          {
            widgetId: "wi_music",
            definitionId: "wd_music",
            type: "music",
            name: "音乐播放器",
            order: 1,
            summary: "正在播放"
          },
          {
            widgetId: "wi_note",
            definitionId: "wd_note",
            type: "note",
            name: "便签",
            order: 2,
            summary: "private note"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).call).toMatchObject({ name: "widget.remove", arguments: { widgetId: "wi_music" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(JSON.stringify(firstBody)).toContain("widget.remove");
    expect(JSON.stringify(firstBody)).not.toContain("wi_music");
    expect(JSON.stringify(firstBody)).not.toContain("private note");
    expect(JSON.stringify(secondBody)).toContain("wi_music");
    expect(JSON.stringify(secondBody)).not.toContain("private note");
    expect(JSON.stringify(secondBody)).not.toContain("music__dot__pause");
  });
});
