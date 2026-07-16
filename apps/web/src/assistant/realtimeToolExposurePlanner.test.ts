import { describe, expect, it } from "vitest";
import { createPassthroughSchema, type AssistantToolSpec, type CompactAssistantContext } from "@xiaozhuoban/assistant-core";
import { buildRealtimeToolExposurePlan } from "./realtimeToolExposurePlanner";

const schema = createPassthroughSchema<Record<string, unknown>>();

function tool(partial: Omit<AssistantToolSpec, "description" | "parameters"> & Partial<Pick<AssistantToolSpec, "description" | "parameters">>): AssistantToolSpec {
  return {
    description: partial.description ?? partial.name,
    parameters: partial.parameters ?? schema,
    ...partial
  };
}

const tools: AssistantToolSpec[] = [
  tool({ name: "app.sidebar.set", scope: "desktop", examples: ["隐藏侧边栏"] }),
  tool({ name: "app.wallpaper.pick", scope: "desktop", examples: ["更换壁纸"] }),
  tool({ name: "assistant.get_desktop_state", scope: "desktop", examples: ["桌面上有多少个工具"] }),
  tool({ name: "board.add_widget", scope: "desktop", examples: ["打开音乐播放器", "打开天气"] }),
  tool({ name: "widget.focus", scope: "desktop", requiresTarget: true, examples: ["聚焦音乐"] }),
  tool({ name: "widget.remove", scope: "desktop", requiresTarget: true, risk: "safe", examples: ["关闭音乐"] }),
  tool({ name: "music.play", scope: "widget-detail", widgetType: "music", requiresTarget: true, argumentKeys: ["query"], examples: ["播放王菲的红豆"] }),
  tool({ name: "music.search", scope: "widget-detail", widgetType: "music", requiresTarget: true, argumentKeys: ["query"], examples: ["搜一点轻松的音乐"] }),
  tool({ name: "music.pause", scope: "widget-detail", widgetType: "music", requiresTarget: true, examples: ["暂停音乐"] }),
  tool({ name: "music.resume", scope: "widget-detail", widgetType: "music", requiresTarget: true, examples: ["继续刚才的音乐"] }),
  tool({ name: "music.next", scope: "widget-detail", widgetType: "music", requiresTarget: true, examples: ["下一首"] }),
  tool({ name: "music.previous", scope: "widget-detail", widgetType: "music", requiresTarget: true, examples: ["上一首"] }),
  tool({ name: "countdown.set", scope: "widget-detail", widgetType: "countdown", requiresTarget: true, argumentKeys: ["totalSeconds"], examples: ["倒计时 5 分钟"] }),
  tool({ name: "tv.play", scope: "widget-detail", widgetType: "tv", requiresTarget: true, argumentKeys: ["channelName"], examples: ["我想看 BBC"] }),
  tool({ name: "tv.select_channel", scope: "widget-detail", widgetType: "tv", requiresTarget: true, argumentKeys: ["channelName"], examples: ["切到 BBC"] }),
  tool({ name: "market.set_indices", scope: "widget-detail", widgetType: "market", requiresTarget: true, argumentKeys: ["indexCodes"], examples: ["打开纳斯达克"] }),
  tool({ name: "weather.set_city", scope: "widget-detail", widgetType: "weather", requiresTarget: true, argumentKeys: ["city"], examples: ["上海天气"] }),
  tool({ name: "note.write", scope: "widget-detail", widgetType: "note", requiresTarget: true, argumentKeys: ["content"], examples: ["帮我记一下"] }),
  tool({ name: "clipboard.clear", scope: "widget-detail", widgetType: "clipboard", requiresTarget: true, risk: "destructive", examples: ["清空剪贴板"] }),
  tool({ name: "gomoku.play", scope: "deferred", examples: ["下棋"] })
];

function context(overrides: Partial<CompactAssistantContext> = {}): CompactAssistantContext {
  return {
    boardId: "board_1",
    boardName: "默认桌板",
    widgets: [
      {
        widgetId: "wi_music",
        definitionId: "wd_music",
        type: "music",
        name: "音乐",
        order: 1,
        summary: "idle",
        focused: true
      },
      {
        widgetId: "wi_weather",
        definitionId: "wd_weather",
        type: "weather",
        name: "天气",
        order: 2,
        summary: "北京"
      }
    ],
    focusedWidget: {
      widgetId: "wi_music",
      definitionId: "wd_music",
      type: "music",
      name: "音乐",
      order: 1,
      summary: "idle",
      focused: true
    },
    availableDefinitions: [
      { definitionId: "wd_music", type: "music", name: "音乐" },
      { definitionId: "wd_countdown", type: "countdown", name: "倒计时" },
      { definitionId: "wd_tv", type: "tv", name: "电视" },
      { definitionId: "wd_market", type: "market", name: "全球指数" },
      { definitionId: "wd_weather", type: "weather", name: "天气" },
      { definitionId: "wd_note", type: "note", name: "便签" },
      { definitionId: "wd_clipboard", type: "clipboard", name: "剪贴板" }
    ],
    widgetCountsByType: { music: 1, weather: 1 },
    ...overrides
  };
}

describe("RealtimeToolExposurePlanner", () => {
  it("exposes the focused music tools and related window tools for a music request", () => {
    const plan = buildRealtimeToolExposurePlan("我想听王菲的歌", context(), tools);

    expect(plan.selectedModules).toContain("music");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(
      expect.arrayContaining(["music.play", "music.search", "board.add_widget", "widget.focus"])
    );
    expect(plan.exposedTools.map((item) => item.name)).not.toContain("weather.set_city");
    expect(plan.excludedReasons["weather.set_city"]).toBe("module_mismatch");
    expect(plan.excludedReasons["gomoku.play"]).toBe("deferred_scope");
    expect(plan.reasons["music.play"]).toEqual(expect.arrayContaining(["selected_module", "mounted_widget", "focused_widget"]));
    expect(plan.confidence).toBeGreaterThan(0.5);
  });

  it("exposes widget focus for current-widget switching commands", () => {
    const base = context();
    const plan = buildRealtimeToolExposurePlan(
      "把电视设为当前小工具",
      context({
        widgets: [
          ...base.widgets,
          {
            widgetId: "wi_tv",
            definitionId: "wd_tv",
            type: "tv",
            name: "电视",
            order: 3,
            summary: "CCTV1"
          }
        ],
        widgetCountsByType: { music: 1, weather: 1, tv: 1 }
      }),
      tools
    );

    expect(plan.selectedModules).toContain("tv");
    expect(plan.exposedTools.map((item) => item.name)).toContain("widget.focus");
  });

  it("exposes weather tools without leaking unrelated widget detail tools", () => {
    const plan = buildRealtimeToolExposurePlan("上海天气给我看一下", context(), tools);

    expect(plan.selectedModules).toContain("weather");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["weather.set_city", "board.add_widget"]));
    expect(plan.exposedTools.map((item) => item.name)).not.toContain("note.write");
    expect(plan.exposedTools.map((item) => item.name)).not.toContain("music.play");
    expect(plan.excludedReasons["note.write"]).toBe("module_mismatch");
  });

  it("keeps destructive tools hidden unless destructive intent is explicit", () => {
    const idlePlan = buildRealtimeToolExposurePlan("剪贴板打开一下", context(), tools);
    expect(idlePlan.exposedTools.map((item) => item.name)).not.toContain("clipboard.clear");
    expect(idlePlan.excludedReasons["clipboard.clear"]).toBe("destructive_not_requested");

    const clearPlan = buildRealtimeToolExposurePlan("清空剪贴板", context(), tools);
    expect(clearPlan.selectedModules).toContain("clipboard");
    expect(clearPlan.exposedTools.map((item) => item.name)).toContain("clipboard.clear");
    expect(clearPlan.reasons["clipboard.clear"]).toEqual(expect.arrayContaining(["selected_module"]));
  });

  it("adds board.add_widget when a target widget is absent but definition exists", () => {
    const plan = buildRealtimeToolExposurePlan(
      "打开音乐播放器",
      context({ widgets: [], focusedWidget: undefined, widgetCountsByType: {} }),
      tools
    );

    expect(plan.selectedModules).toContain("music");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["board.add_widget", "music.play", "music.search"]));
    expect(plan.reasons["board.add_widget"]).toEqual(expect.arrayContaining(["definition_available"]));
  });

  it("records either exposure reasons or exclusion reasons for every known tool", () => {
    const plan = buildRealtimeToolExposurePlan("我想听王菲的歌", context(), tools);
    const exposedNames = new Set(plan.exposedTools.map((item) => item.name));

    for (const item of tools) {
      if (exposedNames.has(item.name)) {
        expect(plan.reasons[item.name]?.length, item.name).toBeGreaterThan(0);
      } else {
        expect(plan.excludedReasons[item.name], item.name).toBeTruthy();
      }
    }
  });

  it("exposes countdown tools for spoken duration commands", () => {
    const plan = buildRealtimeToolExposurePlan("倒计时5分钟", context({ widgets: [], focusedWidget: undefined, widgetCountsByType: {} }), tools);

    expect(plan.selectedModules).toContain("countdown");
    expect(plan.exposedTools.map((item) => item.name)).toContain("countdown.set");
    expect(plan.excludedReasons["music.play"]).toBe("module_mismatch");
  });

  it("exposes music tools for artist listening commands", () => {
    const plan = buildRealtimeToolExposurePlan("我想听王菲的歌", context(), tools);

    expect(plan.selectedModules).toContain("music");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["music.play", "music.search"]));
  });

  it("exposes music play for uncommon artist and track playback commands", () => {
    const plan = buildRealtimeToolExposurePlan("播放 Nils Frahm 的 Says", context(), tools);

    expect(plan.selectedModules).toContain("music");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["music.play", "music.search"]));
  });

  it("exposes music play for arbitrary artist and track names instead of relying on a fixed singer list", () => {
    const commands = ["播放 Tinariwen 的 Sastanaqqam", "来一首 Ryuichi Sakamoto 的 Merry Christmas Mr Lawrence", "听点 Anouar Brahem 的 Astrakan Cafe"];

    for (const command of commands) {
      const plan = buildRealtimeToolExposurePlan(command, context(), tools);
      expect(plan.selectedModules, command).toContain("music");
      expect(plan.exposedTools.map((item) => item.name), command).toContain("music.play");
    }
  });

  it("exposes music search for explicit no-play discovery commands", () => {
    const plan = buildRealtimeToolExposurePlan("找一点巴洛克羽管键琴，暂时不播放", context(), tools);

    expect(plan.selectedModules).toContain("music");
    expect(plan.exposedTools.map((item) => item.name)).toContain("music.search");
  });

  it("exposes music search for genre discovery commands without fixed artist names", () => {
    const plan = buildRealtimeToolExposurePlan("找一点北欧爵士，先不要播放", context(), tools);

    expect(plan.selectedModules).toContain("music");
    expect(plan.exposedTools.map((item) => item.name)).toContain("music.search");
    expect(plan.exposedTools.map((item) => item.name)).toContain("music.play");
  });

  it("exposes music resume for continue-current-music commands", () => {
    const plan = buildRealtimeToolExposurePlan("继续刚才的音乐", context(), tools);

    expect(plan.selectedModules).toContain("music");
    expect(plan.exposedTools.map((item) => item.name)).toContain("music.resume");
  });

  it("exposes music transport tools before generic focus for next and previous commands", () => {
    const nextPlan = buildRealtimeToolExposurePlan("音乐切到下一首", context(), tools);
    const previousPlan = buildRealtimeToolExposurePlan("回到上一首音乐", context(), tools);

    expect(nextPlan.selectedModules).toContain("music");
    expect(nextPlan.exposedTools.map((item) => item.name)).toContain("music.next");
    expect(previousPlan.selectedModules).toContain("music");
    expect(previousPlan.exposedTools.map((item) => item.name)).toContain("music.previous");
  });

  it("exposes TV channel tools for BBC viewing commands", () => {
    const plan = buildRealtimeToolExposurePlan("我想看BBC", context({ widgets: [], focusedWidget: undefined, widgetCountsByType: {} }), tools);

    expect(plan.selectedModules).toContain("tv");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["tv.play", "tv.select_channel", "board.add_widget"]));
  });

  it("exposes desktop state for widget count questions", () => {
    const plan = buildRealtimeToolExposurePlan("桌面上有多少个工具", context(), tools);

    expect(plan.exposedTools.map((item) => item.name)).toContain("assistant.get_desktop_state");
    expect(plan.exposedTools.map((item) => item.name)).not.toContain("music.play");
  });

  it("uses the cached TV channel catalog when no TV widget is mounted", () => {
    const plan = buildRealtimeToolExposurePlan(
      "打开电视看 Bloomberg",
      context({
        widgets: [],
        focusedWidget: undefined,
        widgetCountsByType: {},
        moduleStates: {
          tv: {
            assistantChannelNames: ["BBC News", "Bloomberg TV", "NHK World"],
            assistantChannelCount: 3
          }
        }
      }),
      tools
    );

    expect(plan.selectedModules).toContain("tv");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["tv.play", "tv.select_channel", "board.add_widget"]));
  });

  it("prioritizes TV tools for uppercase channel viewing commands even when market is focused", () => {
    const plan = buildRealtimeToolExposurePlan(
      "我想用电视看HBO频道",
      context({
        widgets: [
          {
            widgetId: "wi_tv",
            definitionId: "wd_tv",
            type: "tv",
            name: "电视",
            order: 1,
            summary: "channels",
            assistantState: { channelNames: ["CNA", "HBO", "CNN International"] }
          },
          {
            widgetId: "wi_market",
            definitionId: "wd_market",
            type: "market",
            name: "行情",
            order: 2,
            summary: "NASDAQ",
            focused: true
          }
        ],
        focusedWidget: {
          widgetId: "wi_market",
          definitionId: "wd_market",
          type: "market",
          name: "行情",
          order: 2,
          summary: "NASDAQ",
          focused: true
        },
        widgetCountsByType: { tv: 1, market: 1 }
      }),
      tools
    );

    expect(plan.selectedModules[0]).toBe("tv");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["tv.play", "tv.select_channel"]));
  });

  it("does not route stock ticker search commands to TV", () => {
    const plan = buildRealtimeToolExposurePlan("查 AAPL", context({ widgets: [], focusedWidget: undefined, widgetCountsByType: {} }), tools);

    expect(plan.selectedModules).toContain("market");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["market.set_indices", "board.add_widget"]));
    expect(plan.exposedTools.map((item) => item.name)).not.toContain("tv.play");
  });

  it("exposes the wallpaper picker for background commands", () => {
    const plan = buildRealtimeToolExposurePlan("更换壁纸", context(), tools);

    expect(plan.exposedTools.map((item) => item.name)).toContain("app.wallpaper.pick");
    expect(plan.reasons["app.wallpaper.pick"]).toEqual(expect.arrayContaining(["tool_intent_match"]));
  });

  it("exposes market tools for Nasdaq commands", () => {
    const plan = buildRealtimeToolExposurePlan("打开纳斯达克", context({ widgets: [], focusedWidget: undefined, widgetCountsByType: {} }), tools);

    expect(plan.selectedModules).toContain("market");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["market.set_indices", "board.add_widget"]));
  });

  it("exposes market tools for specific stock commands", () => {
    const plan = buildRealtimeToolExposurePlan("看微软股票", context({ widgets: [], focusedWidget: undefined, widgetCountsByType: {} }), tools);

    expect(plan.selectedModules).toContain("market");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["market.set_indices", "board.add_widget"]));
  });

  it("exposes market tools for ticker lookup commands", () => {
    const plan = buildRealtimeToolExposurePlan("查 AAPL", context({ widgets: [], focusedWidget: undefined, widgetCountsByType: {} }), tools);

    expect(plan.selectedModules).toContain("market");
    expect(plan.exposedTools.map((item) => item.name)).toEqual(expect.arrayContaining(["market.set_indices", "board.add_widget"]));
  });
});
