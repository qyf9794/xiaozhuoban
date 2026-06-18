import { describe, expect, it } from "vitest";
import { createPassthroughSchema, type AssistantToolSpec } from "@xiaozhuoban/assistant-core";
import { createRealtimeCapabilityCatalog } from "./capabilityCatalog";

const schema = createPassthroughSchema<Record<string, unknown>>();

const tools: AssistantToolSpec[] = [
  {
    name: "app.sidebar.set",
    description: "Show, hide, or toggle sidebar.",
    parameters: schema,
    scope: "desktop",
    concurrencyKey: "app.shell",
    examples: ["隐藏侧栏"]
  },
  {
    name: "board.auto_align",
    description: "Auto align widgets.",
    parameters: schema,
    scope: "desktop",
    risk: "confirm",
    concurrencyKey: "board.layout"
  },
  {
    name: "music.play",
    description: "Play music.",
    parameters: schema,
    scope: "widget-detail",
    widgetType: "music",
    requiresTarget: true,
    concurrencyKey: "media.music"
  },
  {
    name: "gomoku.play",
    description: "Play game.",
    parameters: schema,
    scope: "deferred"
  }
];

describe("Realtime capability catalog", () => {
  it("groups app, board, and widget detail tools for staged loading", () => {
    const catalog = createRealtimeCapabilityCatalog(tools, [
      {
        type: "music",
        displayName: "音乐",
        aliases: ["歌曲"],
        capabilities: ["播放歌曲"],
        shortcutExamples: ["播放王菲的红豆"],
        riskSummary: []
      }
    ]);

    const app = catalog.find((item) => item.type === "app");
    const board = catalog.find((item) => item.type === "board");
    const music = catalog.find((item) => item.type === "music");

	    expect(app).toMatchObject({
	      catalogVersion: expect.stringMatching(/^cat_/),
	      displayName: "小桌板窗口",
	      toolNames: ["app.sidebar.set"],
	      concurrencyKeys: ["app.shell"],
      loadLevel: "catalog"
    });
    expect(app?.aliases).toContain("侧栏");
    expect(board?.toolNames).toEqual(["board.auto_align"]);
    expect(board?.riskSummary).toEqual(["board.auto_align:confirm"]);
    expect(music?.toolNames).toEqual(["music.play"]);
	    expect(music?.aliases).toContain("歌曲");
	    expect(music?.catalogVersion).toBe(app?.catalogVersion);
	    expect(music?.shortcutExamples).toContain("播放王菲的红豆");
    expect(catalog.some((item) => item.toolNames.includes("gomoku.play"))).toBe(false);
  });
});
