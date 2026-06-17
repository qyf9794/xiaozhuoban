import { describe, expect, it } from "vitest";
import {
  PlanValidator,
  createCommandPlanFromToolCalls,
  createPassthroughSchema,
  runWidgetModuleStaticChecks,
  WidgetAssistantRegistry,
  type AssistantAction
} from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { createDailyWidgetAssistantModules } from "./dailyWidgetAssistantModules";
import { createMusicAssistantModule, musicMigrationReport, musicShortcutConflictReport } from "./music/assistant";

function definition(type: string, name: string): WidgetDefinition {
  return {
    id: `wd_${type}`,
    kind: "system",
    type,
    name,
    version: 1,
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" },
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z"
  };
}

const actions: AssistantAction[] = [
  {
    spec: {
      name: "note.set_text",
      description: "Set note text",
      parameters: createPassthroughSchema<Record<string, unknown>>(),
      scope: "widget-detail",
      widgetType: "note",
      requiresTarget: true
    },
    execute: () => ({ status: "success", message: "ok" })
  },
  {
    spec: {
      name: "widget.remove",
      description: "Close widget",
      parameters: createPassthroughSchema<Record<string, unknown>>(),
      scope: "desktop",
      requiresTarget: true
    },
    execute: () => ({ status: "success", message: "ok" })
  }
];

function action(name: string, widgetType?: string, risk?: AssistantAction["spec"]["risk"]): AssistantAction {
  return {
    spec: {
      name,
      description: name,
      parameters: createPassthroughSchema<Record<string, unknown>>((value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object" && !Array.isArray(value)
      ),
      scope: widgetType ? "widget-detail" : "desktop",
      widgetType,
      requiresTarget: Boolean(widgetType),
      risk
    },
    execute: () => ({ status: "success", message: "ok" })
  };
}

const moduleActions: AssistantAction[] = [
  action("board.add_widget"),
  action("widget.focus"),
  action("widget.fullscreen_focus"),
  action("widget.remove"),
  action("music.search", "music"),
  action("music.play", "music"),
  action("music.pause", "music"),
  action("music.resume", "music"),
  action("weather.set_city", "weather"),
  action("clipboard.add_text", "clipboard"),
  action("clipboard.clear", "clipboard", "destructive"),
  action("todo.add_item", "todo"),
  action("todo.complete_item", "todo"),
  action("translate.set_draft", "translate"),
  action("calculator.set_display", "calculator"),
  action("countdown.set", "countdown"),
  action("countdown.pause", "countdown"),
  action("worldClock.set_zones", "worldClock"),
  action("market.set_indices", "market"),
  action("headline.request_refresh", "headline"),
  action("recorder.start", "recorder"),
  action("tv.select_channel", "tv")
];

const dailyDefinitions = [
  definition("music", "音乐"),
  definition("weather", "天气"),
  definition("clipboard", "剪贴板"),
  definition("todo", "待办"),
  definition("translate", "翻译"),
  definition("calculator", "计算器"),
  definition("countdown", "倒计时"),
  definition("worldClock", "世界时钟"),
  definition("market", "行情"),
  definition("headline", "新闻"),
  definition("recorder", "录音机"),
  definition("tv", "电视")
];

function registerFirstBatchModules(registry: WidgetAssistantRegistry) {
  registry.register(createMusicAssistantModule(dailyDefinitions, moduleActions));
  createDailyWidgetAssistantModules(dailyDefinitions, moduleActions).forEach((module) => registry.register(module));
}

describe("daily widget assistant modules", () => {
  it("keeps per-widget module boundaries while reusing existing actions", () => {
    const registry = new WidgetAssistantRegistry();
    createDailyWidgetAssistantModules([definition("note", "便签")], actions).forEach((module) => registry.register(module));

    const note = registry.get("note");
    expect(note?.aliases).toContain("便签");
    expect(note?.tools.map((action) => action.spec.name)).toContain("note.set_text");
    expect(note?.tools.map((action) => action.spec.name)).toContain("widget.remove");
    expect(registry.getRealtimeCatalog().find((item) => item.type === "note")).toMatchObject({
      displayName: "便签"
    });
  });

  it("generates scoped module context without full private widget state", () => {
    const registry = new WidgetAssistantRegistry();
    createDailyWidgetAssistantModules([definition("note", "便签")], actions).forEach((module) => registry.register(module));

    const context = registry.getScopedContextForModule("note", {
      userText: "清一下便签",
      selectedToolHint: "note.set_text",
      compactContext: {
        boardId: "board_1",
        boardName: "默认桌板",
        widgetCountsByType: { note: 1 },
        widgets: [
          {
            widgetId: "wi_note",
            definitionId: "wd_note",
            type: "note",
            name: "便签",
            order: 1,
            summary: "这是一段很长很长的私人便签内容，默认不应该完整发送给 Realtime，因为它可能包含隐私内容"
          }
        ]
      },
      tools: actions.map((action) => action.spec)
    });

    expect(context?.instances[0]?.summary).toContain("...");
    expect(JSON.stringify(context)).not.toContain("因为它可能包含隐私内容");
  });

  it("registers all first-batch daily modules with strict schemas and scoped contexts", () => {
    const registry = new WidgetAssistantRegistry();
    registerFirstBatchModules(registry);

    const expectedTypes = [
      "music",
      "weather",
      "clipboard",
      "todo",
      "translate",
      "calculator",
      "countdown",
      "worldClock",
      "market",
      "headline",
      "recorder",
      "tv"
    ];
    expect(registry.list().map((module) => module.type)).toEqual(expect.arrayContaining(expectedTypes));
    expect(registry.getRealtimeCatalog().map((item) => item.type)).toEqual(expect.arrayContaining(expectedTypes));

    for (const module of registry.list()) {
      const report = runWidgetModuleStaticChecks(registry, module);
      expect(report.ok, `${module.type}: ${report.issues.join(", ")}`).toBe(true);
      expect(report.scopedContextFields).toEqual([
        "executionPolicy",
        "instances",
        "moduleType",
        "riskPolicy",
        "shortcutExamples",
        "stateSummary",
        "toolSchemas",
        "tools"
      ]);
    }
  });

  it("keeps music outside the central daily module factory after migration", () => {
    const centralModules = createDailyWidgetAssistantModules(dailyDefinitions, moduleActions);

    expect(centralModules.map((module) => module.type)).not.toContain("music");
    expect(musicMigrationReport).toMatchObject({
      module: "music",
      legacyBridge: true
    });
    expect(musicShortcutConflictReport.resolution).toBe("none");
  });

  it("uses selected-module strict schemas to reject extra model arguments", () => {
    const registry = new WidgetAssistantRegistry();
    registerFirstBatchModules(registry);
    const validator = new PlanValidator({ tools: moduleActions.map((item) => item.spec), moduleRegistry: registry });
    const plan = createCommandPlanFromToolCalls("暂停音乐", [
      {
        id: "call_music_pause",
        name: "music.pause",
        arguments: { widgetId: "music_1", query: "should not pass" },
        source: "realtime"
      }
    ]);
    plan.commands[0]!.module = "music";

    const result = validator.validate(plan);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: "EXTRA_ARGUMENTS" });
  });

  it("keeps Realtime first stage catalog free of widget ids and private summaries", () => {
    const registry = new WidgetAssistantRegistry();
    registerFirstBatchModules(registry);

    const catalogPayload = JSON.stringify(registry.getRealtimeCatalog());
    const musicContext = registry.getScopedContextForModule("music", {
      userText: "播放周杰伦",
      compactContext: {
        widgetCountsByType: { music: 1, clipboard: 1 },
        widgets: [
          {
            widgetId: "music_widget_1",
            definitionId: "wd_music",
            type: "music",
            name: "音乐",
            order: 1,
            summary: "private-play-history should not appear in catalog"
          },
          {
            widgetId: "clip_1",
            definitionId: "wd_clipboard",
            type: "clipboard",
            name: "剪贴板",
            order: 2,
            summary: "secret clipboard payload"
          }
        ]
      }
    });

    expect(catalogPayload).not.toContain("music_widget_1");
    expect(catalogPayload).not.toContain("secret clipboard payload");
    expect(JSON.stringify(musicContext)).toContain("music_widget_1");
    expect(JSON.stringify(musicContext)).not.toContain("secret clipboard payload");
  });
});
