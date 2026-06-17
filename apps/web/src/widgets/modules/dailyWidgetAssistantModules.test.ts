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
import { createClipboardAssistantModule, clipboardMigrationReport, clipboardShortcutConflictReport } from "./clipboard/assistant";
import { createCountdownAssistantModule, countdownMigrationReport, countdownShortcutConflictReport } from "./countdown/assistant";
import { createHeadlineAssistantModule, headlineMigrationReport, headlineShortcutConflictReport } from "./headline/assistant";
import { createMusicAssistantModule, musicMigrationReport, musicShortcutConflictReport } from "./music/assistant";
import { createTodoAssistantModule, todoMigrationReport, todoShortcutConflictReport } from "./todo/assistant";
import { createWeatherAssistantModule, weatherMigrationReport, weatherShortcutConflictReport } from "./weather/assistant";
import { createWorldClockAssistantModule, worldClockMigrationReport, worldClockShortcutConflictReport } from "./worldClock/assistant";

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
  action("countdown.resume", "countdown"),
  action("countdown.reset", "countdown"),
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
  registry.register(createWeatherAssistantModule(dailyDefinitions, moduleActions));
  registry.register(createClipboardAssistantModule(dailyDefinitions, moduleActions));
  registry.register(createTodoAssistantModule(dailyDefinitions, moduleActions));
  registry.register(createCountdownAssistantModule(dailyDefinitions, moduleActions));
  registry.register(createWorldClockAssistantModule(dailyDefinitions, moduleActions));
  registry.register(createHeadlineAssistantModule(dailyDefinitions, moduleActions));
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

  it("keeps migrated modules outside the central daily module factory", () => {
    const centralModules = createDailyWidgetAssistantModules(dailyDefinitions, moduleActions);
    const centralTypes = centralModules.map((module) => module.type);

    for (const migratedType of ["music", "weather", "clipboard", "todo", "countdown", "worldClock", "headline"]) {
      expect(centralTypes).not.toContain(migratedType);
    }
    expect(musicMigrationReport).toMatchObject({
      module: "music",
      legacyBridge: true
    });
    expect(weatherMigrationReport).toMatchObject({
      module: "weather",
      legacyBridge: true
    });
    expect(clipboardMigrationReport).toMatchObject({
      module: "clipboard",
      legacyBridge: true
    });
    expect(todoMigrationReport).toMatchObject({
      module: "todo",
      legacyBridge: true
    });
    expect(countdownMigrationReport).toMatchObject({
      module: "countdown",
      legacyBridge: true
    });
    expect(worldClockMigrationReport).toMatchObject({
      module: "worldClock",
      legacyBridge: true
    });
    expect(headlineMigrationReport).toMatchObject({
      module: "headline",
      legacyBridge: true
    });
    expect(musicShortcutConflictReport.resolution).toBe("none");
    expect(weatherShortcutConflictReport.resolution).toBe("none");
    expect(clipboardShortcutConflictReport.resolution).toBe("none");
    expect(todoShortcutConflictReport.resolution).toBe("none");
    expect(countdownShortcutConflictReport.resolution).toBe("none");
    expect(worldClockShortcutConflictReport.resolution).toBe("none");
    expect(headlineShortcutConflictReport.resolution).toBe("none");
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

    const weatherPlan = createCommandPlanFromToolCalls("北京天气", [
      {
        id: "call_weather",
        name: "weather.set_city",
        arguments: { widgetId: "weather_1", city: "北京", privateLocationHistory: "should not pass" },
        source: "realtime"
      }
    ]);
    weatherPlan.commands[0]!.module = "weather";
    const weatherResult = validator.validate(weatherPlan);
    expect(weatherResult.ok).toBe(false);
    expect(weatherResult.errors[0]).toMatchObject({ code: "EXTRA_ARGUMENTS" });

    const countdownPlan = createCommandPlanFromToolCalls("定时十分钟", [
      {
        id: "call_countdown",
        name: "countdown.set",
        arguments: { widgetId: "countdown_1", minutes: 10, articleText: "should not pass" },
        source: "realtime"
      }
    ]);
    countdownPlan.commands[0]!.module = "countdown";
    const countdownResult = validator.validate(countdownPlan);
    expect(countdownResult.ok).toBe(false);
    expect(countdownResult.errors[0]).toMatchObject({ code: "EXTRA_ARGUMENTS" });

    const worldClockPlan = createCommandPlanFromToolCalls("NYC and Tokyo time", [
      {
        id: "call_world_clock",
        name: "worldClock.set_zones",
        arguments: { widgetId: "clock_1", zones: ["America/New_York", "Asia/Tokyo"], locationHistory: ["private"] },
        source: "realtime"
      }
    ]);
    worldClockPlan.commands[0]!.module = "worldClock";
    const worldClockResult = validator.validate(worldClockPlan);
    expect(worldClockResult.ok).toBe(false);
    expect(worldClockResult.errors[0]).toMatchObject({ code: "EXTRA_ARGUMENTS" });

    const headlinePlan = createCommandPlanFromToolCalls("最新头条", [
      {
        id: "call_headline",
        name: "headline.request_refresh",
        arguments: { widgetId: "headline_1", requestedAt: "2026-06-17T00:00:00.000Z", fullArticlePayload: "should not pass" },
        source: "realtime"
      }
    ]);
    headlinePlan.commands[0]!.module = "headline";
    const headlineResult = validator.validate(headlinePlan);
    expect(headlineResult.ok).toBe(false);
    expect(headlineResult.errors[0]).toMatchObject({ code: "EXTRA_ARGUMENTS" });
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

  it("redacts content-heavy module scoped contexts", () => {
    const registry = new WidgetAssistantRegistry();
    registerFirstBatchModules(registry);

    const clipboardContext = registry.getScopedContextForModule("clipboard", {
      userText: "清一下剪贴板",
      compactContext: {
        widgetCountsByType: { clipboard: 1, todo: 1 },
        widgets: [
          {
            widgetId: "clip_1",
            definitionId: "wd_clipboard",
            type: "clipboard",
            name: "剪贴板",
            order: 1,
            summary: "secret-token-123 pinned record count 3"
          },
          {
            widgetId: "todo_1",
            definitionId: "wd_todo",
            type: "todo",
            name: "待办",
            order: 2,
            summary: "买牛奶，带身份证，私人任务全文"
          }
        ]
      }
    });

    const todoContext = registry.getScopedContextForModule("todo", {
      userText: "把买牛奶勾掉",
      compactContext: {
        widgetCountsByType: { clipboard: 1, todo: 1 },
        widgets: [
          {
            widgetId: "clip_1",
            definitionId: "wd_clipboard",
            type: "clipboard",
            name: "剪贴板",
            order: 1,
            summary: "secret-token-123 pinned record count 3"
          },
          {
            widgetId: "todo_1",
            definitionId: "wd_todo",
            type: "todo",
            name: "待办",
            order: 2,
            summary: "买牛奶，带身份证，私人任务全文"
          }
        ]
      }
    });

    expect(JSON.stringify(clipboardContext)).toContain("clipboard-content-redacted");
    expect(JSON.stringify(clipboardContext)).not.toContain("secret-token-123");
    expect(JSON.stringify(clipboardContext)).not.toContain("买牛奶");
    expect(JSON.stringify(todoContext)).toContain("todo-summary-only");
    expect(JSON.stringify(todoContext)).not.toContain("私人任务全文");
    expect(JSON.stringify(todoContext)).not.toContain("secret-token-123");
  });

  it("redacts time and news module scoped contexts", () => {
    const registry = new WidgetAssistantRegistry();
    registerFirstBatchModules(registry);

    const compactContext = {
      widgetCountsByType: { countdown: 1, worldClock: 1, headline: 1 },
      widgets: [
        {
          widgetId: "countdown_1",
          definitionId: "wd_countdown",
          type: "countdown",
          name: "倒计时",
          order: 1,
          summary: "倒计时剩余 10 分钟，私人备注：给妈妈打电话"
        },
        {
          widgetId: "world_clock_1",
          definitionId: "wd_worldClock",
          type: "worldClock",
          name: "世界时钟",
          order: 2,
          summary: "Tokyo, Paris, Sydney; private location history should not be sent"
        },
        {
          widgetId: "headline_1",
          definitionId: "wd_headline",
          type: "headline",
          name: "新闻",
          order: 3,
          summary: "Breaking article full body with private political reading history count 12"
        }
      ]
    };

    const countdownContext = registry.getScopedContextForModule("countdown", {
      userText: "定时十分钟",
      compactContext
    });
    const worldClockContext = registry.getScopedContextForModule("worldClock", {
      userText: "NYC and Tokyo time",
      compactContext
    });
    const headlineContext = registry.getScopedContextForModule("headline", {
      userText: "最新头条",
      compactContext
    });

    expect(JSON.stringify(countdownContext)).toContain("countdown-state-summary");
    expect(JSON.stringify(countdownContext)).not.toContain("给妈妈打电话");
    expect(JSON.stringify(worldClockContext)).toContain("selectedZonesOnly");
    expect(JSON.stringify(worldClockContext)).not.toContain("private location history should not be sent");
    expect(JSON.stringify(headlineContext)).toContain("headline-metadata-only");
    expect(JSON.stringify(headlineContext)).not.toContain("full body");
    expect(JSON.stringify(headlineContext)).not.toContain("private political reading history");
  });
});
