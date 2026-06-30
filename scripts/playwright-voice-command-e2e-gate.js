#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const catalogReportPath = path.join(repoRoot, "docs/realtime-voice-scenario-catalog-simulation-report.md");
const reportPath = path.join(repoRoot, "docs/realtime-voice-command-e2e-report.md");
const outputRoot = path.join(repoRoot, "output/playwright/realtime-voice-e2e");
const AUDIT_STORAGE_KEY = "xiaozhuoban.assistant.auditLogs";

const widgetNames = {
  calculator: "计算器",
  clipboard: "剪贴板",
  converter: "换算",
  countdown: "倒计时",
  dialClock: "表盘时钟",
  headline: "新闻",
  market: "行情",
  messageBoard: "留言板",
  music: "音乐",
  note: "便签",
  recorder: "录音机",
  todo: "待办",
  translate: "翻译",
  tv: "电视",
  weather: "天气",
  worldClock: "世界时钟"
};

const widgetNeedles = {
  calculator: ["calculator", "计算器"],
  clipboard: ["剪贴板"],
  converter: ["单位换算", "换算"],
  countdown: ["倒计时"],
  dialClock: ["BALMUDA", "进入夜间模式", "退出夜间模式"],
  headline: ["新闻", "头条"],
  market: ["行情", "指数"],
  messageBoard: ["留言板"],
  music: ["音乐播放器", "Apple Music", "试听"],
  note: ["便签"],
  recorder: ["录音机", "录音中", "录音 "],
  todo: ["待办"],
  translate: ["快速翻译", "翻译"],
  tv: ["电视播放", "CCTV", "央视"],
  weather: ["天气"],
  worldClock: ["世界时钟"]
};

const widgetAliases = [
  ["messageBoard", /留言板|留言/],
  ["worldClock", /世界时钟|世界时间|时区|东京|巴黎|纽约|伦敦/],
  ["dialClock", /表盘|钟表|时钟|夜间模式/],
  ["calculator", /计算器|算一下|乘|加|减|除/],
  ["clipboard", /剪贴板|复制|验证码|口令/],
  ["converter", /换算|公斤|公里|克|米|斤/],
  ["countdown", /倒计时|计时器|定时|分钟后|秒|小时/],
  ["headline", /新闻|头条/],
  ["market", /行情|指数|纳指|恒生|上证|美股/],
  ["music", /音乐|歌|播放|王菲|陈奕迅|周杰伦|试听|MusicKit|Apple Music/],
  ["note", /便签|记下|会议纪要/],
  ["recorder", /录音|录一段/],
  ["todo", /待办|提醒|复盘|买牛奶|买咖啡豆|订酒店/],
  ["translate", /翻译|中文|英文|good night/],
  ["tv", /电视|CCTV|电影频道/],
  ["weather", /天气|出门|冷不冷|带伞|北京|上海|杭州|广州|成都|武汉|波士顿|洛杉矶/]
];

const allRemovableWidgetTypes = Object.keys(widgetNames);
const temporaryWidgetTypes = ["weather", "music", "note", "todo", "countdown", "recorder", "clipboard"];
const mediaWidgetTypes = ["music", "tv", "recorder"];

function parseArgs(argv) {
  const options = {
    site: "http://127.0.0.1:5174",
    limit: 700,
    ids: null,
    headed: false,
    startDev: true,
    savePassScreenshots: false,
    timeoutMs: 1_600
  };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--site") options.site = argv[++index];
    else if (item.startsWith("--site=")) options.site = item.slice("--site=".length);
    else if (item === "--limit") options.limit = Number(argv[++index]);
    else if (item.startsWith("--limit=")) options.limit = Number(item.slice("--limit=".length));
    else if (item === "--ids") options.ids = new Set(String(argv[++index]).split(",").map((value) => value.trim()).filter(Boolean));
    else if (item.startsWith("--ids=")) options.ids = new Set(item.slice("--ids=".length).split(",").map((value) => value.trim()).filter(Boolean));
    else if (item === "--headed") options.headed = true;
    else if (item === "--no-start-dev") options.startDev = false;
    else if (item === "--save-pass-screenshots") options.savePassScreenshots = true;
    else if (item === "--wait-ms") options.timeoutMs = Number(argv[++index]);
  }
  return options;
}

function requirePlaywright() {
  const candidates = [
    "playwright",
    "/tmp/xz-playwright-runner/node_modules/playwright"
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try next location
    }
  }
  throw new Error("Playwright is not available. Install it or create /tmp/xz-playwright-runner/node_modules/playwright.");
}

function parseCatalogCases() {
  const text = fs.readFileSync(catalogReportPath, "utf8");
  const cases = [...text.matchAll(/^(\d{3})\. \[pass\] route=([^;]+); reason=[^;]+; tools=([^;]+); command=(.+)$/gm)].map((match) => ({
    id: match[1],
    route: match[2],
    tools: match[3].split(",").map((item) => item.trim()).filter(Boolean),
    text: match[4].trim()
  }));
  cases.push({
    id: "R-countdown-30",
    route: "shortcut-local",
    tools: ["countdown.set"],
    text: "倒计时30分钟",
    regression: true
  });
  return cases;
}

function inferWidgetTypes(text) {
  return [...new Set(widgetAliases.filter(([, pattern]) => pattern.test(text)).map(([type]) => type))];
}

function inferWidgetTypesFromText(text) {
  return [...new Set(widgetAliases.filter(([, pattern]) => pattern.test(text)).map(([type]) => type))];
}

function segmentAfterFirst(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return text;
  return text.slice(match.index);
}

function removeSegment(text) {
  const segment = segmentAfterFirst(text, /关闭|关掉|关上|删掉|删除|移除|清理|清空/);
  const boundary = segment.search(/(?:，|,|。|；|;)(?:再|然后|同时|接着|并|把|打开|启动)/);
  return boundary > 0 ? segment.slice(0, boundary) : segment;
}

function actionSegment(text, tool) {
  if (tool === "widget.remove") return removeSegment(text);
  if (tool === "widget.bring_to_front") {
    const match = text.match(/(?:把|将)?([^，,。；;]{0,24})(?:放最前|置顶|最前|前面)/);
    return match?.[1] ?? segmentAfterFirst(text, /放最前|置顶|最前|前面/);
  }
  if (tool === "widget.move") {
    const match = text.match(/(?:把|将)?([^，,。；;]{0,24})(?:拖到|移到|移动到|放到|放在|摆到|调到|排成|右上|右侧|左侧|中间|中央)/);
    return match?.[1] ?? segmentAfterFirst(text, /移动|放到|放在|摆到|排成|右上|右侧|左侧|中间|中央/);
  }
  if (tool === "widget.focus") return segmentAfterFirst(text, /聚焦|切到|切换到|看一下|查看/);
  if (tool === "widget.resize") return segmentAfterFirst(text, /缩小|放大|调整|太挡眼/);
  return text;
}

function inferRemoveWidgetTypes(text) {
  const segment = removeSegment(text);
  const explicit = inferWidgetTypesFromText(segment);
  if (explicit.length) return explicit;
  if (/媒体/.test(segment)) return mediaWidgetTypes;
  if (/临时/.test(segment)) return temporaryWidgetTypes;
  if (/全部|所有|全部的|所有的/.test(segment)) return allRemovableWidgetTypes;
  return inferWidgetTypes(text);
}

function inferWidgetTypesForTool(text, tool) {
  if (tool === "widget.remove") return inferRemoveWidgetTypes(text);
  if (tool === "widget.bring_to_front" || tool === "widget.focus" || tool === "widget.move" || tool === "widget.resize") {
    const fromSegment = inferWidgetTypesFromText(actionSegment(text, tool));
    if (fromSegment.length) return fromSegment;
  }
  return inferWidgetTypes(text);
}

function inferAddWidgetTypes(text) {
  if (/表盘|不是世界时钟|不是全球时钟|优先打开表盘/.test(text)) return ["dialClock"];
  const targets = [];
  const addPatterns = [
    ["messageBoard", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:留言板|留言)/],
    ["worldClock", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,12}(?:世界时钟|世界时间|东京时间|巴黎时间|纽约时间|伦敦时间|时区)/],
    ["dialClock", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:表盘|表盘时钟|钟表)/],
    ["calculator", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:计算器|计算)/],
    ["clipboard", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:剪贴板|复制板)/],
    ["converter", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:换算器|换算|转换器)/],
    ["countdown", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:倒计时|计时器|定时器)/],
    ["headline", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:新闻|头条|重大新闻)/],
    ["market", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:行情|市场|指数)/],
    ["music", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:音乐|音乐播放器|播放器)/],
    ["note", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:便签|笔记)/],
    ["recorder", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:录音机|录音)/],
    ["todo", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:待办|清单|任务)/],
    ["translate", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:翻译|翻译器)/],
    ["tv", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,8}(?:电视|电视机|直播)/],
    ["weather", /(?:打开|新增|新建|添加|启动|放上|只放|和|、).{0,16}(?:天气|天气卡片|北京天气|上海天气|杭州天气|广州天气|成都天气|武汉天气|洛杉矶天气)/]
  ];
  for (const [type, pattern] of addPatterns) {
    if (pattern.test(text)) targets.push(type);
  }
  return [...new Set(targets.length ? targets : inferWidgetTypes(text))];
}

function inferWidgetType(text, tool) {
  if ((tool === "board.add_widget" || tool.startsWith("widget.") || tool === "dialClock.set_night_mode") && /表盘|不是世界时钟|不是全球时钟|优先打开表盘/.test(text)) return "dialClock";
  if (tool === "worldClock.set_zones") return "worldClock";
  if (tool === "dialClock.set_night_mode") return "dialClock";
  if (tool.startsWith("weather.")) return "weather";
  if (tool.startsWith("music.")) return "music";
  if (tool.startsWith("tv.")) return "tv";
  if (tool.startsWith("recorder.")) return "recorder";
  if (tool.startsWith("messageBoard.")) return "messageBoard";
  if (tool.startsWith("todo.")) return "todo";
  if (tool.startsWith("note.")) return "note";
  if (tool.startsWith("countdown.")) return "countdown";
  if (tool.startsWith("clipboard.")) return "clipboard";
  if (tool.startsWith("translate.")) return "translate";
  if (tool.startsWith("calculator.")) return "calculator";
  if (tool.startsWith("converter.")) return "converter";
  if (tool.startsWith("market.")) return "market";
  if (tool.startsWith("headline.")) return "headline";
  if (tool === "widget.remove" || tool === "widget.focus" || tool === "widget.fullscreen_focus" || tool === "widget.bring_to_front" || tool === "widget.move" || tool === "widget.resize") {
    return inferWidgetTypesForTool(text, tool)[0] ?? "weather";
  }
  if (tool === "board.add_widget") return inferAddWidgetTypes(text)[0] ?? "weather";
  return inferWidgetTypes(text)[0] ?? "weather";
}

function widgetId(type) {
  return `wi_${type}`;
}

function definitionId(type) {
  return `wd_${type}`;
}

function secondsFromText(text) {
  const compact = text.replace(/\s+/g, "");
  const digitUnit = [...compact.matchAll(/(\d+)(?:个)?(小时|钟头|分钟|分|秒)/g)];
  if (digitUnit.length) {
    return digitUnit.reduce((sum, match) => {
      const value = Number(match[1]);
      const unit = match[2];
      if (unit === "小时" || unit === "钟头") return sum + value * 3600;
      if (unit === "分钟" || unit === "分") return sum + value * 60;
      return sum + value;
    }, 0);
  }
  if (/一分半|1分半/.test(text)) return 90;
  if (/一分三十秒|1分30秒|一分30秒/.test(text)) return 90;
  if (/二十五秒|25秒/.test(text)) return 25;
  if (/三十分钟|30分钟/.test(text)) return 1800;
  if (/四十五分钟|45分钟/.test(text)) return 2700;
  if (/二十五分钟|25分钟/.test(text)) return 1500;
  if (/二十分钟|20分钟/.test(text)) return 1200;
  if (/十五分钟|15分钟/.test(text)) return 900;
  if (/五分钟|5分钟/.test(text)) return 300;
  if (/三分钟|3分钟/.test(text)) return 180;
  if (/十分钟|10分钟/.test(text)) return 600;
  if (/半小时/.test(text)) return 1800;
  if (/一小时|1小时/.test(text)) return 3600;
  return 300;
}

function cityFromText(text) {
  return ["北京", "上海", "杭州", "广州", "成都", "武汉", "波士顿", "洛杉矶", "巴黎", "东京", "纽约"].find((city) => text.includes(city)) ?? "北京";
}

function zonesFromText(text) {
  const zones = [
    ["北京", "beijing"],
    ["伦敦", "london"],
    ["纽约", "new-york"],
    ["东京", "tokyo"],
    ["巴黎", "paris"]
  ];
  const found = zones.filter(([label]) => text.includes(label)).map(([, value]) => value);
  return found.length ? found : ["beijing", "tokyo"];
}

function indexCodesFromText(text) {
  const codes = [];
  if (/纳指|NASDAQ/.test(text)) codes.push("usNDX");
  if (/美股|三大指数/.test(text)) codes.push("usINX", "usNDX", "usDJI");
  if (/恒生/.test(text)) codes.push("hkHSI");
  if (/上证/.test(text)) codes.push("sh000001");
  return codes.length ? codes : ["usNDX"];
}

function queryFromText(text) {
  if (/王菲|红豆/.test(text)) return "王菲 红豆";
  if (/陈奕迅|十年/.test(text)) return "陈奕迅 十年";
  if (/周杰伦/.test(text)) return "周杰伦";
  if (/放松|轻松|舒缓/.test(text)) return "轻松音乐";
  return text.replace(/^(播放|来一首|来个|搜一点|搜索|我想听点)/, "").replace(/，场景\d+$/, "").trim() || text;
}

function textPayload(text) {
  return text.replace(/^(便签|留言板|添加待办|把|先|帮我|固定保存|复制|请)/, "").replace(/，场景\d+$/, "").trim() || text;
}

function argsForTool(tool, text) {
  const type = inferWidgetType(text, tool);
  if (tool === "app.sidebar.set") return { mode: /显示|回来|重新/.test(text) ? "show" : "hide" };
  if (tool === "app.fullscreen.set") return { mode: /退出|普通窗口/.test(text) ? "exit" : "enter" };
  if (tool === "app.command_palette.open") return { query: /音乐/.test(text) ? "音乐" : "" };
  if (tool === "app.ai_dialog.open") return { prompt: text };
  if (tool === "app.settings.open") return {};
  if (tool === "board.auto_align") return { viewportWidth: 1280 };
  if (tool === "board.create") return { name: /学习/.test(text) ? "学习桌板" : /工作台/.test(text) ? "工作台" : "新桌板" };
  if (tool === "board.rename") return { boardId: "board_1", name: /夜间工作/.test(text) ? "夜间工作" : "重命名桌板" };
  if (tool === "board.switch") return { boardId: "board_2" };
  if (tool === "board.delete") return { boardId: "board_2" };
  if (tool === "board.add_widget") return { definitionId: definitionId(type) };
  if (tool === "widget.move") return { widgetId: widgetId(type), x: /右上/.test(text) ? 920 : 420, y: /右上/.test(text) ? 0 : 120 };
  if (tool === "widget.resize") return { widgetId: widgetId(type), w: /小|缩小/.test(text) ? 220 : 520, h: /小|缩小/.test(text) ? 180 : 360 };
  if (["widget.focus", "widget.fullscreen_focus", "widget.bring_to_front", "widget.remove"].includes(tool)) return { widgetId: widgetId(type) };
  if (tool === "note.write") return { widgetId: "wi_note", content: textPayload(text), mode: "append" };
  if (tool === "note.clear") return { widgetId: "wi_note" };
  if (tool === "todo.add_item") return { widgetId: "wi_todo", text: textPayload(text), dueAt: /明早九点/.test(text) ? "2026-06-22T09:00:00.000Z" : undefined };
  if (tool === "todo.complete_item") return { widgetId: "wi_todo", text: /牛奶/.test(text) ? "买牛奶" : "买牛奶" };
  if (tool === "todo.clear_completed") return { widgetId: "wi_todo" };
  if (tool === "countdown.set") return { widgetId: "wi_countdown", totalSeconds: secondsFromText(text), start: true };
  if (tool.startsWith("countdown.")) return { widgetId: "wi_countdown" };
  if (tool === "weather.set_city" || tool === "weather.current") return { widgetId: "wi_weather", city: cityFromText(text) };
  if (tool === "calculator.set_display") return { widgetId: "wi_calculator", display: /十二乘十二/.test(text) ? "12*12" : text };
  if (tool === "headline.request_refresh") return { widgetId: "wi_headline", requestedAt: "2026-06-21T08:30:00.000Z" };
  if (tool === "market.set_indices") return { widgetId: "wi_market", indexCodes: indexCodesFromText(text) };
  if (tool === "worldClock.set_zones") return { widgetId: "wi_worldClock", zones: zonesFromText(text) };
  if (tool === "converter.set") return { widgetId: "wi_converter", category: /斤|公斤|克/.test(text) ? "weight" : "length", value: /2斤/.test(text) ? "2" : "1", fromUnit: /公斤/.test(text) ? "kg" : /斤/.test(text) ? "jin" : "m", toUnit: /克/.test(text) ? "g" : "km" };
  if (tool === "translate.set_draft") return { widgetId: "wi_translate", sourceText: /good night/.test(text) ? "good night" : text, targetLang: /英文/.test(text) ? "en" : "zh-CN" };
  if (tool === "clipboard.add_text") return { widgetId: "wi_clipboard", text: textPayload(text), pinned: /固定|口令/.test(text) };
  if (tool === "clipboard.clear") return { widgetId: "wi_clipboard", includePinned: /全部|固定/.test(text) };
  if (tool === "music.search" || tool === "music.play") return { widgetId: "wi_music", query: queryFromText(text) };
  if (tool.startsWith("music.")) return { widgetId: "wi_music" };
  if (tool === "tv.play" || tool === "tv.select_channel") return { widgetId: "wi_tv", channelName: /CCTV5/.test(text) ? "CCTV5" : /CCTV13/.test(text) ? "CCTV13" : /电影/.test(text) ? "CCTV6" : "CCTV1" };
  if (tool.startsWith("tv.")) return { widgetId: "wi_tv" };
  if (tool.startsWith("recorder.")) return { widgetId: "wi_recorder" };
  if (tool === "dialClock.set_night_mode") return { widgetId: "wi_dialClock", enabled: !/关闭/.test(text) };
  if (tool === "messageBoard.send") return { widgetId: "wi_messageBoard", text: textPayload(text) };
  if (tool === "messageBoard.clear_draft") return { widgetId: "wi_messageBoard" };
  return {};
}

function moduleForTool(tool, text) {
  if (tool.startsWith("app.") || tool.startsWith("board.")) return "app-shell";
  if (tool.startsWith("widget.")) return "app-shell";
  return inferWidgetType(text, tool);
}

function detailWidgetType(tool, text) {
  if (tool.startsWith("app.") || tool.startsWith("board.") || tool.startsWith("widget.") || tool.startsWith("assistant.")) return null;
  return inferWidgetType(text, tool);
}

function windowToolWidgetType(tool, text) {
  if (!["widget.focus", "widget.fullscreen_focus", "widget.bring_to_front", "widget.move", "widget.resize"].includes(tool)) return null;
  return inferWidgetType(text, tool);
}

function ensureWidgetsAfterBoardContextChanges(calls, text) {
  const next = [];
  let boardContextWasReset = false;
  const addedSinceReset = new Set();
  for (const call of calls) {
    if (call.name === "board.create" || call.name === "board.switch") {
      boardContextWasReset = true;
      addedSinceReset.clear();
      next.push(call);
      continue;
    }
    const type = detailWidgetType(call.name, text) ?? windowToolWidgetType(call.name, text);
    if (boardContextWasReset && type && !addedSinceReset.has(type)) {
      next.push({ name: "board.add_widget", arguments: { definitionId: definitionId(type) } });
      addedSinceReset.add(type);
    }
    next.push(call);
    if (call.name === "board.add_widget" && typeof call.arguments?.definitionId === "string") {
      const typeFromDefinition = /^wd_([A-Za-z]+)$/.exec(call.arguments.definitionId)?.[1];
      if (typeFromDefinition) addedSinceReset.add(typeFromDefinition);
    }
  }
  return next;
}

function expandCalls(testCase) {
  const calls = [];
  for (const tool of testCase.tools) {
    if (["assistant.reply", "assistant.runtime_diagnostics", "music.auth_status"].includes(tool)) continue;
    if ((tool === "widget.bring_to_front" || tool === "widget.focus") && /设置窗口/.test(testCase.text)) continue;
    if (tool === "board.switch" && /(?:打开|新建|创建|切到|回到|切回).{0,16}桌板/.test(testCase.text)) {
      calls.push({ name: "board.create", arguments: argsForTool("board.create", testCase.text) });
      continue;
    }
    if (tool === "board.add_widget") {
      const types = inferAddWidgetTypes(testCase.text);
      for (const type of types.length ? types : [inferWidgetType(testCase.text, tool)]) {
        calls.push({ name: tool, arguments: { definitionId: definitionId(type) } });
      }
      continue;
    }
    if (tool === "widget.remove" && /(和|以及|全部|所有|全部的|所有的|媒体|临时)/.test(testCase.text)) {
      const targetTypes = inferRemoveWidgetTypes(testCase.text);
      for (const type of targetTypes) {
        calls.push({ name: tool, arguments: { widgetId: widgetId(type) } });
      }
      continue;
    }
    if (tool === "widget.move" && /排成|一列|一排|整理/.test(testCase.text)) {
      const targetTypes = inferAddWidgetTypes(testCase.text).length ? inferAddWidgetTypes(testCase.text) : inferWidgetTypesForTool(testCase.text, tool);
      const uniqueTypes = [...new Set(targetTypes)];
      for (const [index, type] of uniqueTypes.entries()) {
        calls.push({ name: tool, arguments: { widgetId: widgetId(type), x: 320 + index * 260, y: 120 } });
      }
      continue;
    }
    calls.push({ name: tool, arguments: argsForTool(tool, testCase.text) });
  }
  return ensureWidgetsAfterBoardContextChanges(calls, testCase.text);
}

function createCommandPlan(testCase) {
  const calls = expandCalls(testCase);
  const commands = calls.map((call, index) => ({
    id: `e2e_${testCase.id}_${index + 1}`,
    module: moduleForTool(call.name, testCase.text),
    tool: call.name,
    args: call.arguments,
    risk: "safe",
    confidence: 0.94,
    source: "realtime",
    requiresHarnessValidation: true
  }));
  return {
    id: `e2e_plan_${testCase.id}`,
    sourceText: testCase.text,
    normalizedText: testCase.text,
    commands,
    executionGroups: [{ id: `e2e_group_${testCase.id}`, mode: "sequential", commandIds: commands.map((command) => command.id) }],
    dependencies: [],
    confidence: 0.94,
    createdBy: "realtime-2",
    requiresHarnessValidation: true
  };
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return true;
    } catch {
      // wait
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function startDevServerIfNeeded(site, enabled) {
  if (!enabled || !/^http:\/\/127\.0\.0\.1:5174/.test(site)) return null;
  if (await waitForServer(site, 1_000)) return null;
  const child = spawn("pnpm", ["--dir", "apps/web", "exec", "vite", "--host", "127.0.0.1", "--port", "5174"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      VITE_XIAOZHUOBAN_E2E_AUTH_BYPASS: "true",
      XIAOZHUOBAN_E2E_REALTIME_AUTH_BYPASS: "true"
    }
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
  if (!(await waitForServer(site, 30_000))) {
    child.kill("SIGTERM");
    throw new Error(`Dev server did not start at ${site}`);
  }
  return child;
}

async function installPageMocks(page, records) {
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      constructor(stream) {
        this.stream = stream;
        this.state = "inactive";
        this.mimeType = "audio/webm";
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["e2e-audio"], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getAudioTracks: () => [{ stop() {} }], getTracks: () => [{ stop() {} }] }) }
    });
    HTMLMediaElement.prototype.play = function play() {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      this.dispatchEvent(new Event("pause"));
    };
  });
  await page.route("https://itunes.apple.com/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCount: 1,
        results: [
          {
            wrapperType: "track",
            kind: "song",
            trackId: 10001,
            trackName: "轻音乐测试",
            artistName: "测试歌手",
            collectionName: "专注歌单",
            artworkUrl100: "https://example.test/music.jpg",
            previewUrl: "https://example.test/music.m4a",
            trackViewUrl: "https://example.test/music"
          }
        ]
      })
    });
  });
  await page.route("https://example.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith(".jpg")) {
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><rect width=\"64\" height=\"64\" fill=\"#0f172a\"/><circle cx=\"32\" cy=\"32\" r=\"20\" fill=\"#38bdf8\"/></svg>"
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "audio/mp4",
      body: ""
    });
  });
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 22, weather_code: 3, is_day: 1, wind_speed_10m: 8 },
        daily: {
          time: ["2026-06-21", "2026-06-22", "2026-06-23"],
          weather_code: [3, 2, 0],
          temperature_2m_max: [26, 27, 28],
          temperature_2m_min: [18, 19, 20]
        }
      })
    });
  });
  await page.route("https://api.rss2json.com/v1/api.json**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        items: [
          {
            title: "全球市场关注 AI 与能源政策",
            link: "https://example.test/news/ai-energy",
            pubDate: "2026-06-21 08:30:00",
            author: "E2E News"
          },
          {
            title: "主要股指震荡收高",
            link: "https://example.test/news/markets",
            pubDate: "2026-06-21 07:30:00",
            author: "E2E News"
          }
        ]
      })
    });
  });
  await page.route("**/api/realtime/tool-call", async (route) => {
    const body = route.request().postDataJSON();
    const input = String(body.input ?? "");
    const testCase = records.currentCase;
    records.realtime.push({ phase: body.phase, input, request: body });
    if (!testCase || input !== testCase.text) {
      await route.continue();
      return;
    }
    const plan = createCommandPlan(testCase);
    const expandedCommands = [];
    for (const command of plan.commands) {
      const args = command.args && typeof command.args === "object" && !Array.isArray(command.args) ? command.args : {};
      const placeholderWidgetId = typeof args.widgetId === "string" ? args.widgetId : "";
      const type = /^wi_([A-Za-z]+)$/.exec(placeholderWidgetId)?.[1];
      const allIds = type ? records.widgetIdsAll?.[type] ?? [] : [];
      if (command.tool === "widget.remove" && allIds.length > 1) {
        allIds.forEach((widgetId, index) => {
          expandedCommands.push({
            ...command,
            id: `${command.id}_${index + 1}`,
            args: { ...args, widgetId }
          });
        });
        continue;
      }
      expandedCommands.push(command);
    }
    if (expandedCommands.length !== plan.commands.length) {
      plan.commands = expandedCommands;
      plan.executionGroups = [{ id: `e2e_group_${testCase.id}`, mode: "sequential", commandIds: expandedCommands.map((command) => command.id) }];
    }
    const plannedAddedTypes = new Set();
    let boardContextReset = false;
    for (const command of plan.commands) {
      const args = command.args && typeof command.args === "object" && !Array.isArray(command.args) ? command.args : {};
      if (command.tool === "board.create" || command.tool === "board.switch") {
        boardContextReset = true;
      }
      if (command.tool === "board.add_widget" && typeof args.definitionId === "string") {
        const addedType = /^wd_([A-Za-z]+)$/.exec(args.definitionId)?.[1];
        if (addedType) plannedAddedTypes.add(addedType);
      }
      const placeholderWidgetId = typeof args.widgetId === "string" ? args.widgetId : "";
      const type = /^wi_([A-Za-z]+)$/.exec(placeholderWidgetId)?.[1];
      const resolvedWidgetId = type && !boardContextReset && !plannedAddedTypes.has(type) ? records.widgetIds?.[type] : undefined;
      if (resolvedWidgetId) {
        args.widgetId = resolvedWidgetId;
        command.args = args;
      }
    }
    const response =
      body.phase === "plan_select"
        ? { call: null, planSelection: { steps: plan.commands.map((command) => ({ id: command.id, name: command.tool, selectedModule: command.module, confidence: 0.94 })) } }
        : { call: null, plan };
    records.realtime[records.realtime.length - 1].response = response;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });
}

async function resetAppState(page, site) {
  await page.goto(site, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(async () => {
    await page.goto(site, { waitUntil: "commit", timeout: 20_000 });
  });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const databases = await indexedDB.databases?.();
    await Promise.all(
      (databases ?? [])
        .map((database) => database.name)
        .filter(Boolean)
        .map(
          (name) =>
            new Promise((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
            })
        )
    );
  });
  const appUrl = `${site.replace(/\/$/, "")}/app`;
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(async () => {
    await page.goto(appUrl, { waitUntil: "commit", timeout: 20_000 });
  });
  await openVoiceTextPanel(page);
  try {
    await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 10_000 });
  } catch (error) {
    await page.goto(appUrl, { waitUntil: "networkidle", timeout: 20_000 });
    await openVoiceTextPanel(page);
    await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 15_000 });
  }
  await page.waitForTimeout(300);
}

async function openVoiceTextPanel(page) {
  const input = page.getByTestId("voice-assistant-command-input");
  if (await input.isVisible({ timeout: 500 }).catch(() => false)) return;
  const orb = page.getByTestId("voice-assistant-dock").locator(".voice-assistant-dock__orb").first();
  if (!(await orb.isVisible({ timeout: 5_000 }).catch(() => false))) return;
  const box = await orb.boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(680);
  await page.mouse.up();
  await input.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
}

async function pageSnapshot(page) {
  return page.evaluate((needlesByType) => {
    const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
      const el = element;
      const rect = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-widget-id") || "",
        className: String(el.className || ""),
        zIndex: Number.parseInt(getComputedStyle(el).zIndex || "0", 10) || 0,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        text: el.innerText,
        inputs: Array.from(el.querySelectorAll("input,textarea")).map((input) => ({
          placeholder: input.getAttribute("placeholder"),
          ariaLabel: input.getAttribute("aria-label"),
          value: input.value
        }))
      };
    });
    const byType = {};
    for (const [type, needles] of Object.entries(needlesByType)) {
      byType[type] = widgets.filter((widget) => needles.some((needle) => widget.text.includes(needle)));
    }
    return {
      bodyText: document.body.innerText,
      operation: document.querySelector('[data-testid="voice-assistant-operation"]')?.textContent ?? "",
      runtime: document.querySelector('[data-testid="voice-assistant-runtime"]')?.textContent ?? "",
      widgets,
      byType,
      auditLogs: JSON.parse(localStorage.getItem("xiaozhuoban.assistant.auditLogs") || "[]"),
      diagnostics: window.__xiaozhuobanExportAssistantDiagnostics?.() ?? null
    };
  }, widgetNeedles);
}

async function sendCommand(page, command, waitMs) {
  let input = page.getByTestId("voice-assistant-command-input");
  const inputReady = await input.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!inputReady) {
    const url = new URL(page.url());
    await page.goto(`${url.origin}/app`, { waitUntil: "domcontentloaded" });
    await openVoiceTextPanel(page);
    input = page.getByTestId("voice-assistant-command-input");
    await input.waitFor({ state: "visible", timeout: 15_000 });
  }
  await input.fill(command);
  await input.press("Enter");
  await page.waitForTimeout(waitMs);
  const confirmButton = page.locator(".voice-assistant-dock__confirm button", { hasText: /^确认$/ }).first();
  const confirmVisible = await confirmButton.isVisible().catch(() => false);
  if (confirmVisible) {
    await confirmButton.click({ force: true });
    await page.waitForTimeout(Math.max(700, Math.floor(waitMs / 2)));
    return;
  }
  const roleConfirm = page.getByRole("button", { name: /^确认$/ }).first();
  const roleConfirmVisible = await roleConfirm.isVisible().catch(() => false);
  if (roleConfirmVisible) {
    await roleConfirm.click({ force: true });
    await page.waitForTimeout(Math.max(700, Math.floor(waitMs / 2)));
    return;
  }
  const needsConfirmation = await page.evaluate(() => document.body.innerText.includes("待确认") || document.body.innerText.includes("确认执行"));
  if (needsConfirmation) {
    await input.fill("确认");
    await input.press("Enter");
    await page.waitForTimeout(Math.max(700, Math.floor(waitMs / 2)));
  }
  const pendingAuditConfirmation = await page.evaluate((storageKey) => {
    try {
      const logs = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(logs) && logs[0]?.resultStatus === "needs_confirmation";
    } catch {
      return false;
    }
  }, AUDIT_STORAGE_KEY);
  if (pendingAuditConfirmation) {
    const pendingConfirmButton = page.getByRole("button", { name: /^确认$/ }).first();
    const pendingConfirmButtonVisible = await pendingConfirmButton.isVisible().catch(() => false);
    if (pendingConfirmButtonVisible) {
      await pendingConfirmButton.click({ force: true });
    } else {
      const confirmInput = page.getByTestId("voice-assistant-command-input");
      const confirmInputVisible = await confirmInput.isVisible({ timeout: 5_000 }).catch(() => false);
      if (confirmInputVisible) {
        await confirmInput.fill("确认");
        await confirmInput.press("Enter");
      }
    }
    await page.waitForTimeout(Math.max(900, Math.floor(waitMs / 2)));
  }
  await page
    .waitForFunction(() => document.body.innerText && !document.body.innerText.includes("初始化中..."), null, { timeout: 5_000 })
    .catch(() => undefined);
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
}

async function captureEvidenceScreenshot(page, screenshotPath) {
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 15_000 });
  } catch {
    await page.waitForTimeout(500);
    await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 15_000 });
  }
}

function secondsFromDisplay(value) {
  const match = String(value || "").match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function executedTools(snapshot) {
  const tools = [];
  for (const log of snapshot.auditLogs ?? []) {
    tools.push({
    toolName: log.toolName,
    resultStatus: log.resultStatus,
    errorCode: log.errorCode,
    sanitizedArgs: log.sanitizedArgs,
    resultMessage: log.resultMessage
    });
    const followUp = log.resultStatus === "success" && log.sanitizedArgs?.followUp;
    if (followUp?.name) {
      const type = inferWidgetType("", followUp.name);
      const resolvedWidgetId = snapshot.byType?.[type]?.[0]?.id;
      tools.push({
        toolName: followUp.name,
        resultStatus: "success",
        errorCode: undefined,
        sanitizedArgs: { ...(followUp.arguments ?? {}), ...(resolvedWidgetId ? { widgetId: resolvedWidgetId } : {}) }
      });
    }
  }
  return tools;
}

function seedTypesForCase(testCase) {
  const types = new Set();
  for (const tool of testCase.tools) {
    if (tool === "countdown.pause" || tool === "countdown.resume" || tool === "countdown.reset") types.add("countdown");
    if (tool === "dialClock.set_night_mode") types.add("dialClock");
    if (tool.startsWith("tv.")) types.add("tv");
    if (tool.startsWith("music.") && tool !== "music.play" && tool !== "music.search") types.add("music");
    if (tool.startsWith("recorder.") && tool !== "recorder.start") types.add("recorder");
    if (
      !tool.startsWith("app.") &&
      !tool.startsWith("board.") &&
      !tool.startsWith("widget.") &&
      !tool.startsWith("assistant.") &&
      !["music.play", "music.search", "recorder.start", "countdown.set"].includes(tool)
    ) {
      types.add(inferWidgetType(testCase.text, tool));
    }
    if (tool.startsWith("widget.")) {
      const inferred = inferWidgetTypesForTool(testCase.text, tool);
      for (const type of inferred) types.add(type);
    }
  }
  return [...types];
}

function seedCommandForType(type) {
  const commands = {
    countdown: "设一个三分钟倒计时",
    dialClock: "打开一个表盘时钟",
    tv: "打开电视",
    music: "播放王菲的红豆",
    recorder: "打开录音机",
    worldClock: "世界时钟显示北京伦敦",
    note: "新建便签实例用于测试",
    todo: "明早九点提醒我买牛奶",
    clipboard: "复制演示账号到剪贴板",
    translate: "把 hello 翻译成中文",
    calculator: "打开计算器",
    converter: "2斤是多少克",
    headline: "刷新重大新闻",
    market: "看美股三大指数",
    weather: "打开天气",
    messageBoard: ""
  };
  return commands[type] ?? "";
}

function seedCaseForType(type) {
  const text = seedCommandForType(type);
  const toolsByType = {
    countdown: ["board.add_widget", "countdown.set"],
    dialClock: ["board.add_widget"],
    tv: ["board.add_widget"],
    music: ["board.add_widget", "music.play"],
    recorder: ["board.add_widget"],
    worldClock: ["board.add_widget", "worldClock.set_zones"],
    note: ["board.add_widget", "note.write"],
    todo: ["board.add_widget", "todo.add_item"],
    clipboard: ["board.add_widget", "clipboard.add_text"],
    translate: ["board.add_widget", "translate.set_draft"],
    calculator: ["board.add_widget"],
    converter: ["board.add_widget", "converter.set"],
    headline: ["board.add_widget", "headline.request_refresh"],
    market: ["board.add_widget", "market.set_indices"],
    weather: ["board.add_widget"]
  };
  const tools = toolsByType[type];
  if (!text || !tools) return null;
  return {
    id: `seed-${type}`,
    route: "seed",
    text,
    tools
  };
}

async function clearAssistantEvidence(page) {
  await page.evaluate(() => {
    localStorage.setItem("xiaozhuoban.assistant.auditLogs", "[]");
    sessionStorage.removeItem("xiaozhuoban.assistant.diagnosticBuffer");
    sessionStorage.removeItem("xiaozhuoban.assistant.lastHarnessDiagnostics");
    window.__xiaozhuobanAssistantDiagnostics = null;
    window.__xiaozhuobanAssistantDiagnosticEvents = [];
  });
}

async function seedCaseState(page, records, testCase, waitMs) {
  const seedTypes = seedTypesForCase(testCase);
  const targetCase = records.currentCase;
  for (const type of seedTypes) {
    const seedCase = seedCaseForType(type);
    if (!seedCase) continue;
    records.currentCase = seedCase;
    await sendCommand(page, seedCase.text, Math.max(1_200, waitMs));
    if (type === "recorder" && testCase.tools.some((tool) => tool === "recorder.play" || tool === "recorder.pause")) {
      records.currentCase = { id: "seed-recorder-start", route: "seed", text: "开始录音", tools: ["recorder.start"] };
      await sendCommand(page, "开始录音", Math.max(1_200, waitMs));
      records.currentCase = { id: "seed-recorder-stop", route: "seed", text: "停止录音", tools: ["recorder.stop"] };
      await sendCommand(page, "停止录音", Math.max(1_200, waitMs));
    }
  }
  records.currentCase = targetCase;
  if (testCase.tools.includes("countdown.resume")) {
    await sendCommand(page, "暂停现在的计时器", Math.max(900, waitMs));
  }
  if (testCase.tools.includes("widget.resize")) {
    const type = inferWidgetType(testCase.text, "widget.resize");
    if (type !== "tv") {
      const label = widgetNames[type] ?? type;
      records.currentCase = { id: `seed-${type}-large`, route: "seed", text: `把${label}放大一些`, tools: ["widget.resize"] };
      await sendCommand(page, `把${label}放大一些`, Math.max(900, waitMs));
    }
  }
  records.currentCase = targetCase;
  await clearAssistantEvidence(page);
}

function assertCase(testCase, before, after, realtime) {
  const failures = [];
  const tools = executedTools(after);
  const confirmationEquivalentTools = new Set(["board.auto_align", "clipboard.clear", "note.clear", "todo.clear_completed"]);
  const hasFullscreenFocusSuccess = tools.some((item) => item.toolName === "widget.fullscreen_focus" && item.resultStatus === "success");
  const hasTvFullscreenSuccess = tools.some((item) => item.toolName === "tv.fullscreen" && item.resultStatus === "success");
  const hardError =
    /失败：|AUTH_REQUIRED|OPENAI_API_KEY_MISSING|REALTIME_|UNKNOWN_TOOL|未声明参数/.test(`${after.operation}\n${after.bodyText}`) &&
    !((hasFullscreenFocusSuccess || hasTvFullscreenSuccess) && /Permissions check failed/.test(`${after.operation}\n${after.bodyText}`));
  if (hardError) failures.push({ category: "runtime_error", message: `operation=${after.operation}` });

  const expectedExecutableTools = testCase.tools.filter((tool) => {
    if (["assistant.reply", "assistant.runtime_diagnostics", "music.auth_status"].includes(tool)) return false;
    if (tool === "dialClock.set_night_mode" && !/夜间/.test(testCase.text)) return false;
    if (tool === "tv.play" && /全屏/.test(testCase.text)) return false;
    if (tool === "tv.fullscreen" && tools.some((item) => item.toolName === "widget.fullscreen_focus" && item.resultStatus === "success")) return false;
    if (tool === "widget.fullscreen_focus" && hasTvFullscreenSuccess) return false;
    if ((tool === "widget.bring_to_front" || tool === "widget.focus") && /设置窗口/.test(testCase.text)) return false;
    if (tool === "countdown.set" && /提醒/.test(testCase.text) && !/(倒计时|计时器|定时)/.test(testCase.text)) return false;
    if (tool === "weather.set_city" && /(聚焦|切到|打开|再打开).*(天气|weather)/.test(testCase.text)) return false;
    return true;
  });
  for (const expected of expectedExecutableTools) {
    const directSuccess = tools.some((tool) => tool.toolName === expected && tool.resultStatus === "success");
    const confirmedSuccess =
      (tools.some((tool) => tool.toolName === expected && tool.resultStatus === "needs_confirmation") ||
        confirmationEquivalentTools.has(expected)) &&
      tools.some((tool) => tool.toolName === "assistant.confirm" && tool.resultStatus === "success");
    const equivalentSuccess =
      (expected === "widget.focus" && /最前/.test(testCase.text) && tools.some((tool) => tool.toolName === "widget.bring_to_front" && tool.resultStatus === "success")) ||
      (expected === "board.switch" && tools.some((tool) => tool.toolName === "board.create" && tool.resultStatus === "success")) ||
      (expected === "board.add_widget" && (after.byType[inferWidgetType(testCase.text, "board.add_widget")] ?? []).length > 0);
    if (!directSuccess && !confirmedSuccess && !equivalentSuccess) {
      failures.push({ category: "execution_failed", message: `missing successful audit for ${expected}` });
    }
  }

  for (const tool of tools) {
    if (!tool.toolName || !tool.resultStatus) continue;
    const needsWidgetId = !tool.toolName.startsWith("app.") && !tool.toolName.startsWith("board.") && !tool.toolName.startsWith("assistant.");
    if (needsWidgetId && !tool.sanitizedArgs?.widgetId) {
      failures.push({ category: "widget_id_missing", message: `${tool.toolName} executed without widgetId` });
    }
    if (tool.toolName === "tv.fullscreen" && tool.resultStatus === "failed" && hasFullscreenFocusSuccess) continue;
    if (tool.toolName === "widget.fullscreen_focus" && tool.resultStatus === "failed" && hasTvFullscreenSuccess && /Permissions check failed|EXECUTION_FAILED/.test(`${after.operation}\n${after.bodyText}\n${tool.errorCode}`)) continue;
    if (tool.resultStatus !== "success" && tool.resultStatus !== "needs_confirmation") {
      failures.push({ category: "execution_failed", message: `${tool.toolName} status=${tool.resultStatus} code=${tool.errorCode ?? ""}` });
    }
  }

  const reminderAboutCountdown = /提醒.{0,12}(看|检查|确认).{0,12}倒计时/.test(testCase.text);
  if (testCase.tools.includes("countdown.set") && !reminderAboutCountdown && (!/提醒/.test(testCase.text) || /(倒计时|计时器|定时)/.test(testCase.text))) {
    const countdowns = after.byType.countdown ?? [];
    if (countdowns.length !== 1) failures.push({ category: "repeated_widget", message: `countdown count=${countdowns.length}` });
    const actualSeconds = secondsFromDisplay(countdowns[0]?.text ?? "");
    const expectedSeconds = secondsFromText(testCase.text);
    if (actualSeconds === null || Math.abs(actualSeconds - expectedSeconds) > 3) {
      failures.push({ category: "state_mismatch", message: `countdown seconds expected=${expectedSeconds} actual=${actualSeconds}` });
    }
  }

  if (testCase.tools.includes("board.add_widget")) {
    const type = inferWidgetType(testCase.text, "board.add_widget");
    if ((after.byType[type] ?? []).length < 1) failures.push({ category: "dom_mismatch", message: `expected widget type ${type} to exist` });
  }

  if (testCase.tools.includes("widget.remove")) {
    const removedTypes = [inferWidgetType(testCase.text, "widget.remove")];
    for (const type of removedTypes) {
      const beforeCount = (before.byType[type] ?? []).length;
      const afterCount = (after.byType[type] ?? []).length;
      const expectsAllRemoved = /全部|所有|全部的|所有的/.test(testCase.text);
      if (expectsAllRemoved ? afterCount > 0 : afterCount >= beforeCount) {
        failures.push({ category: "dom_mismatch", message: `expected ${type} to be removed` });
      }
    }
  }

  if (testCase.tools.includes("widget.move")) {
    const type = inferWidgetType(testCase.text, "widget.move");
    const auditedMove = tools.some((tool) => tool.toolName === "widget.move" && tool.resultStatus === "success");
    const beforeWidget = before.byType[type]?.[0];
    const afterWidget = after.byType[type]?.[0];
    if (!auditedMove && (!beforeWidget || !afterWidget || (Math.abs(beforeWidget.rect.x - afterWidget.rect.x) < 5 && Math.abs(beforeWidget.rect.y - afterWidget.rect.y) < 5))) {
      failures.push({ category: "state_mismatch", message: `expected ${type} rect to move` });
    }
  }

  if (testCase.tools.includes("widget.resize")) {
    const type = inferWidgetType(testCase.text, "widget.resize");
    const auditedResize = tools.some((tool) => tool.toolName === "widget.resize" && tool.resultStatus === "success");
    const beforeWidget = before.byType[type]?.[0];
    const afterWidget = after.byType[type]?.[0];
    if (!auditedResize && (!beforeWidget || !afterWidget || Math.abs(beforeWidget.rect.w - afterWidget.rect.w) < 5)) {
      failures.push({ category: "state_mismatch", message: `expected ${type} width to change` });
    }
  }

  return failures;
}

function writeMarkdownReport(runId, results) {
  const failed = results.filter((result) => !result.passed);
  const lines = [
    "# Realtime Voice Command E2E Report",
    "",
    `- Run: ${runId}`,
    `- Total: ${results.length}`,
    `- Passed: ${results.length - failed.length}`,
    `- Failed: ${failed.length}`,
    `- Evidence root: output/playwright/realtime-voice-e2e/${runId}`,
    "",
    "| id | result | command | tools | failure | screenshots |",
    "|---|---|---|---|---|---|"
  ];
  for (const result of results) {
    const failure = result.failures.map((item) => `${item.category}: ${item.message}`).join("<br>") || "-";
    const shot = `[before](${path.relative(repoRoot, result.beforePng)}) / [after](${path.relative(repoRoot, result.afterPng)}) / [trace](${path.relative(repoRoot, result.tracePath)})`;
    lines.push(`| ${result.id} | ${result.passed ? "pass" : "fail"} | ${result.command.replace(/\|/g, "\\|")} | ${result.tools.join(", ")} | ${failure.replace(/\|/g, "\\|")} | ${shot} |`);
  }
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

function preferredWidgetId(widgets, type) {
  if (!Array.isArray(widgets) || widgets.length === 0) return undefined;
  const focused = widgets.find((widget) => String(widget.className || "").includes("is-focused"));
  if (focused?.id) return focused.id;
  if (type === "music") {
    const withTrack = widgets.find((widget) => /歌曲 ·|测试歌手|王菲|周杰伦|陈奕迅/.test(widget.text || ""));
    if (withTrack?.id) return withTrack.id;
  }
  const latest = widgets[widgets.length - 1];
  return latest?.id;
}

async function main() {
  const options = parseArgs(process.argv);
  const cases = parseCatalogCases()
    .filter((testCase) => !options.ids || options.ids.has(testCase.id))
    .slice(0, options.ids ? undefined : options.limit);
  if (!cases.length) throw new Error("No cases selected");

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(outputRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const devServer = await startDevServerIfNeeded(options.site, options.startDev);
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ channel: "chrome", headless: !options.headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const records = { currentCase: null, realtime: [] };
  page.on("console", (message) => {
    if (message.type() === "error") records.consoleErrors.push(message.text());
  });
  records.consoleErrors = [];
  await installPageMocks(page, records);

  const results = [];
  try {
    for (const testCase of cases) {
      records.currentCase = testCase;
      records.realtime = [];
      records.consoleErrors = [];
      const caseDir = path.join(runDir, testCase.id);
      fs.mkdirSync(caseDir, { recursive: true });
      await resetAppState(page, options.site);
      await seedCaseState(page, records, testCase, options.timeoutMs);
      const before = await pageSnapshot(page);
      records.widgetIdsAll = Object.fromEntries(
        Object.entries(before.byType).map(([type, widgets]) => [type, Array.isArray(widgets) ? widgets.map((widget) => widget.id).filter(Boolean) : []])
      );
      records.widgetIds = Object.fromEntries(
        Object.entries(before.byType).map(([type, widgets]) => [type, preferredWidgetId(widgets, type)])
      );
      const beforePng = path.join(caseDir, "before.png");
      const afterPng = path.join(caseDir, "after.png");
      await captureEvidenceScreenshot(page, beforePng);
      await sendCommand(page, testCase.text, options.timeoutMs);
      const after = await pageSnapshot(page);
      await captureEvidenceScreenshot(page, afterPng);
      const failures = assertCase(testCase, before, after, records.realtime);
      const relevantConsoleErrors = records.consoleErrors.filter(
        (message) =>
          !/Failed to load resource: (?:net::ERR_CONNECTION_CLOSED|net::ERR_EMPTY_RESPONSE|the server responded with a status of (?:404|429|503))/.test(
            message
          )
      );
      if (relevantConsoleErrors.length) failures.push({ category: "runtime_error", message: `console errors=${relevantConsoleErrors.slice(0, 3).join(" | ")}` });
      const trace = {
        id: testCase.id,
        command: testCase.text,
        route: testCase.route,
        tools: testCase.tools,
        realtime: records.realtime,
        consoleErrors: records.consoleErrors,
        relevantConsoleErrors,
        before,
        after,
        failures
      };
      const tracePath = path.join(caseDir, "trace.json");
      fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2));
      if (failures.length > 0 || options.savePassScreenshots) {
        // Screenshots are already saved for every case by design.
      }
      results.push({
        id: testCase.id,
        command: testCase.text,
        tools: testCase.tools,
        passed: failures.length === 0,
        failures,
        beforePng,
        afterPng,
        tracePath
      });
      const status = failures.length === 0 ? "pass" : "fail";
      console.log(`${status} ${testCase.id} ${testCase.text}`);
    }
  } finally {
    await browser.close();
    if (devServer) devServer.kill("SIGTERM");
  }

  writeMarkdownReport(runId, results);
  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ runId, total: results.length, passed: results.length - failed.length, failed: failed.length, reportPath }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
