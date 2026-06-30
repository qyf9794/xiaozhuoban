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
  tool({ name: "board.add_widget", scope: "desktop", examples: ["打开音乐播放器", "打开天气"] }),
  tool({ name: "widget.focus", scope: "desktop", requiresTarget: true, examples: ["聚焦音乐"] }),
  tool({ name: "widget.remove", scope: "desktop", requiresTarget: true, risk: "safe", examples: ["关闭音乐"] }),
  tool({ name: "music.play", scope: "widget-detail", widgetType: "music", requiresTarget: true, argumentKeys: ["query"], examples: ["播放王菲的红豆"] }),
  tool({ name: "music.search", scope: "widget-detail", widgetType: "music", requiresTarget: true, argumentKeys: ["query"], examples: ["搜一点轻松的音乐"] }),
  tool({ name: "music.pause", scope: "widget-detail", widgetType: "music", requiresTarget: true, examples: ["暂停音乐"] }),
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
});
