const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(repoRoot, "output/playwright/realtime-text-command-matrix");
const TV_ASSISTANT_CHANNEL_CATALOG_KEY = "xiaozhuoban.tv.assistantChannelCatalog.v1";
const seededTvAssistantChannelCatalog = {
  channelNames: [
    "Bloomberg TV",
    "NHK World-Japan",
    "凤凰中文",
    "Al Jazeera English",
    "France 24 English",
    "DW English",
    "CNA",
    "BBC News",
    "CCTV-13 新闻"
  ],
  channelCount: 9,
  selectedChannelName: "BBC News",
  updatedAt: "2026-07-14T00:00:00.000Z"
};
const seededTvPlaylistM3u = `#EXTM3U
#EXTINF:-1,Bloomberg TV
https://example.com/bloomberg-tv.m3u8
#EXTINF:-1,NHK World-Japan
https://example.com/nhk-world.m3u8
#EXTINF:-1,凤凰中文
https://example.com/phoenix-chinese.m3u8
#EXTINF:-1,Al Jazeera English
https://example.com/al-jazeera.m3u8
#EXTINF:-1,France 24 English
https://example.com/france24.m3u8
#EXTINF:-1,DW English
https://example.com/dw-english.m3u8
#EXTINF:-1,CNA
https://example.com/cna.m3u8
#EXTINF:-1,BBC News
https://example.com/bbc-news.m3u8
#EXTINF:-1,CCTV-13 新闻
https://example.com/cctv13.m3u8
`;

function requirePlaywright() {
  const candidates = ["playwright", "/tmp/xz-playwright-runner/node_modules/playwright"];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next configured runner location.
    }
  }
  throw new Error("Playwright is not available. Install it or create /tmp/xz-playwright-runner/node_modules/playwright.");
}

function parseArgs(argv) {
  const options = {
    port: Number(process.env.XIAOZHUOBAN_E2E_PORT || 5190),
    limit: 50,
    from: 1,
    to: null,
    headed: false,
    noStartDev: false,
    allowLocalFallback: false,
    connectTimeoutMs: 70_000,
    commandWaitMs: 4_500
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--headed") options.headed = true;
    else if (item === "--no-start-dev") options.noStartDev = true;
    else if (item === "--allow-local-fallback") options.allowLocalFallback = true;
    else if (item.startsWith("--port=")) options.port = Number(item.slice("--port=".length));
    else if (item.startsWith("--limit=")) options.limit = Number(item.slice("--limit=".length));
    else if (item.startsWith("--from=")) options.from = Number(item.slice("--from=".length));
    else if (item.startsWith("--to=")) options.to = Number(item.slice("--to=".length));
    else if (item.startsWith("--wait-ms=")) options.commandWaitMs = Number(item.slice("--wait-ms=".length));
  }
  return options;
}

const commandCases = [
  { id: "001", command: "打开天气小工具", expect: ["board.add_widget", "weather"] },
  { id: "002", command: "查一下上海今天的天气", expect: ["weather"] },
  { id: "003", command: "帮我看洛杉矶现在天气", expect: ["weather"] },
  { id: "004", command: "打开世界时钟", expect: ["board.add_widget", "clock"] },
  { id: "005", command: "现在东京是几点", expect: ["worldClock.set_zones", "worldClock"] },
  { id: "006", command: "打开音乐播放器", expect: ["board.add_widget", "music"] },
  { id: "007", command: "搜一点轻松的音乐", expect: ["music.search", "music"] },
  { id: "008", command: "播放王菲的红豆", expect: ["music.play", "music.search", "music"] },
  { id: "009", command: "暂停音乐", expect: ["music.pause", "music"] },
  { id: "010", command: "继续播放音乐", expect: ["music.play", "music.resume", "music"] },
  { id: "011", command: "打开电视", expect: ["board.add_widget", "tv"] },
  { id: "012", command: "打开电视看BBC", expect: ["tv.play", "tv"] },
  { id: "013", command: "切到CCTV13新闻频道", expect: ["tv.play", "tv"] },
  { id: "014", command: "打开行情小工具", expect: ["board.add_widget", "market"] },
  { id: "015", command: "我要看纳斯达克指数", expect: ["market.open", "market"] },
  {
    id: "016",
    command: "查看苹果股票",
    expect: ["market.set_indices"],
    expectArgs: [{ tool: "market.set_indices", keys: ["query", "symbol", "symbols"], match: "(苹果|AAPL|Apple)" }]
  },
  {
    id: "017",
    command: "打开特斯拉股价和走势图",
    expect: ["market.set_indices"],
    expectArgs: [{ tool: "market.set_indices", keys: ["query", "symbol", "symbols"], match: "(特斯拉|TSLA|Tesla)" }]
  },
  { id: "018", command: "看恒生指数", expect: ["market.open", "market"] },
  { id: "019", command: "打开重大新闻", expect: ["board.add_widget", "news"] },
  { id: "020", command: "刷新重大新闻", expect: ["headline.request_refresh", "headline"] },
  { id: "021", command: "打开倒计时", expect: ["board.add_widget", "countdown"] },
  { id: "022", command: "倒计时5分钟", expect: ["countdown.start", "countdown"] },
  { id: "023", command: "暂停倒计时", expect: ["countdown.pause", "countdown"] },
  { id: "024", command: "继续倒计时", expect: ["countdown.resume", "countdown"] },
  { id: "025", command: "重置倒计时", expect: ["countdown.reset", "countdown"] },
  { id: "026", command: "打开便签", expect: ["board.add_widget", "note"] },
  { id: "027", command: "在便签里写下下午三点给客户回电话", expect: ["note.write", "note"] },
  { id: "028", command: "打开待办清单", expect: ["board.add_widget", "todo"] },
  { id: "029", command: "添加一个待办，明早买咖啡豆", expect: ["todo.add", "todo"] },
  { id: "030", command: "完成买咖啡豆这个待办", expect: ["todo.complete", "todo"] },
  { id: "031", command: "打开翻译", expect: ["board.add_widget", "translate"] },
  { id: "032", command: "把good night翻译成中文", expect: ["translate"] },
  { id: "033", command: "把今天下午开会翻译成英文", expect: ["translate"] },
  { id: "034", command: "打开计算器", expect: ["board.add_widget", "calculator"] },
  { id: "035", command: "算一下12乘以12再加8", expect: ["calculator", "calc"] },
  { id: "036", command: "打开单位换算器", expect: ["board.add_widget", "converter"] },
  { id: "037", command: "2公斤换算成克", expect: ["converter"] },
  { id: "038", command: "打开剪贴板", expect: ["board.add_widget", "clipboard"] },
  { id: "039", command: "把口令alpha 123放到剪贴板", expect: ["clipboard"] },
  { id: "040", command: "打开录音机", expect: ["board.add_widget", "recorder"] },
  { id: "041", command: "开始录音", expect: ["recorder.start", "recorder"] },
  { id: "042", command: "停止录音", expect: ["recorder.stop", "recorder"] },
  { id: "043", command: "把当前小工具切到音乐播放器", expect: ["widget.focus", "board.add_widget", "music"] },
  { id: "044", command: "把当前小工具切到电视", expect: ["widget.focus", "board.add_widget", "tv"] },
  { id: "045", command: "关闭当前窗口", expect: ["widget.remove", "window"] },
  { id: "046", command: "关闭所有窗口", expect: ["widget.remove", "window"] },
  { id: "047", command: "重新打开音乐和天气并排放好", expect: ["board.add_widget", "layout"] },
  { id: "048", command: "整理桌面，不要遮挡小工具", expect: ["board.auto_align", "board.layout", "layout"] },
  { id: "049", command: "打开电视并全屏", expect: ["board.add_widget", "tv.fullscreen", "media"] },
  { id: "050", command: "退出电视全屏", expect: ["tv.exit_fullscreen", "app.fullscreen.set", "media"] },
  {
    id: "051",
    command: "电视切到 Bloomberg TV",
    expect: ["tv.select_channel", "tv.play", "tv"],
    expectArgs: [{ keys: ["channelName"], match: "Bloomberg" }]
  },
  {
    id: "052",
    command: "我想看 NHK World-Japan",
    expect: ["tv.play", "tv.select_channel", "tv"],
    expectArgs: [{ keys: ["channelName"], match: "NHK" }]
  },
  {
    id: "053",
    command: "打开电视播放凤凰中文",
    expect: ["tv.play", "tv.select_channel", "tv"],
    expectArgs: [{ keys: ["channelName"], match: "凤凰中文" }]
  },
  {
    id: "054",
    command: "把电视换到 Al Jazeera English",
    expect: ["tv.select_channel", "tv.play", "tv"],
    expectArgs: [{ keys: ["channelName"], match: "Al Jazeera" }]
  },
  {
    id: "055",
    command: "切到 France 24 English 频道",
    expect: ["tv.select_channel", "tv.play", "tv"],
    expectArgs: [{ keys: ["channelName"], match: "France 24" }]
  },
  {
    id: "056",
    command: "电视调到 DW English",
    expect: ["tv.select_channel", "tv.play", "tv"],
    expectArgs: [{ keys: ["channelName"], match: "DW English" }]
  },
  {
    id: "057",
    command: "全屏播放 CNA",
    expect: ["tv.play", "tv.fullscreen", "tv"],
    expectArgs: [{ keys: ["channelName"], match: "CNA" }]
  },
  { id: "058", command: "先暂停电视直播", expect: ["tv.pause", "tv"] },
  {
    id: "059",
    command: "帮我找孙燕姿的遇见但先不播放",
    expect: ["music.search", "music"],
    expectArgs: [{ tool: "music.search", keys: ["query"], match: "孙燕姿.*遇见|遇见.*孙燕姿" }]
  },
  {
    id: "060",
    command: "来一首陈奕迅的十年",
    expect: ["music.play", "music"],
    expectArgs: [{ tool: "music.play", keys: ["query"], match: "陈奕迅.*十年|十年.*陈奕迅" }]
  },
  {
    id: "061",
    command: "搜索Taylor Swift的Lover歌单",
    expect: ["music.search", "music"],
    expectArgs: [{ tool: "music.search", keys: ["query"], match: "Taylor Swift.*Lover|Lover.*Taylor Swift" }]
  },
  {
    id: "062",
    command: "播放Beyond海阔天空",
    expect: ["music.play", "music"],
    expectArgs: [{ tool: "music.play", keys: ["query"], match: "Beyond.*海阔天空|海阔天空.*Beyond" }]
  },
  {
    id: "063",
    command: "找一点睡前白噪音，不要马上播放",
    expect: ["music.search", "music"],
    expectArgs: [{ tool: "music.search", keys: ["query"], match: "睡前|白噪音" }]
  },
  { id: "064", command: "音乐换下一首", expect: ["music.next", "music"], requiredTools: ["music.next"] },
  { id: "065", command: "切回上一首歌", expect: ["music.previous", "music"], requiredTools: ["music.previous"] },
  { id: "066", command: "恢复刚才的音乐", expect: ["music.resume", "music"], requiredTools: ["music.resume"] },
  {
    id: "067",
    command: "待办里加一条今晚九点检查电视源",
    expect: ["todo.add_item", "todo"],
    expectArgs: [{ tool: "todo.add_item", keys: ["text"], match: "检查电视源" }]
  },
  {
    id: "068",
    command: "提醒我明天上午十点给爸妈打电话",
    expect: ["todo.add_item", "todo"],
    expectArgs: [{ tool: "todo.add_item", keys: ["text"], match: "爸妈|打电话" }]
  },
  {
    id: "069",
    command: "新增任务：整理音乐测试结果",
    expect: ["todo.add_item", "todo"],
    expectArgs: [{ tool: "todo.add_item", keys: ["text"], match: "整理音乐测试结果" }]
  },
  {
    id: "070",
    command: "把整理音乐测试结果标记完成",
    expect: ["todo.complete_item", "todo"],
    expectArgs: [{ tool: "todo.complete_item", keys: ["text"], match: "整理音乐测试结果" }]
  },
  { id: "071", command: "清理已完成待办", expect: ["todo.clear_completed", "todo"] },
  {
    id: "072",
    command: "在便签写下电视源里 Bloomberg 可用",
    expect: ["note.write", "note"],
    expectArgs: [{ tool: "note.write", keys: ["content"], match: "Bloomberg.*可用|电视源" }]
  },
  {
    id: "073",
    command: "记一下：音乐测试要覆盖不同歌手",
    expect: ["note.write", "note"],
    expectArgs: [{ tool: "note.write", keys: ["content"], match: "音乐测试.*不同歌手" }]
  },
  {
    id: "074",
    command: "追加到便签：NHK 和凤凰中文都要复测",
    expect: ["note.write", "note"],
    expectArgs: [{ tool: "note.write", keys: ["content"], match: "NHK.*凤凰中文|凤凰中文.*NHK" }]
  },
  { id: "075", command: "清空便签内容", expect: ["note.clear", "note"] },
  {
    id: "076",
    command: "打开便签并写上今天重点测试冷门电视频道",
    expect: ["board.add_widget", "note.write", "note"],
    expectArgs: [{ keys: ["content"], match: "冷门电视频道" }]
  },
  {
    id: "077",
    command: "打开待办然后添加测试手机 Safari 语音",
    expect: ["board.add_widget", "todo.add_item", "todo"],
    expectArgs: [{ keys: ["text"], match: "手机 Safari 语音" }]
  },
  {
    id: "078",
    command: "打开音乐播放器并搜索Adele的Hello",
    expect: ["board.add_widget", "music.search", "music"],
    expectArgs: [{ keys: ["query"], match: "Adele.*Hello|Hello.*Adele" }]
  },
  {
    id: "079",
    command: "打开电视然后切到 Bloomberg TV 再全屏",
    expect: ["board.add_widget", "tv.play", "tv.select_channel", "tv.fullscreen"],
    requiredTools: ["tv.select_channel", "tv.fullscreen"],
    expectArgs: [{ keys: ["channelName"], match: "Bloomberg" }]
  },
  {
    id: "080",
    command: "把电视、音乐、待办和便签都打开",
    expect: ["board.add_widget"]
  }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function waitForUrl(url, timeoutMs = 45_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const loop = async () => {
      try {
        const response = await fetch(url);
        if (response.ok || response.status < 500) {
          resolve();
          return;
        }
      } catch {
        // Keep waiting.
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(loop, 500);
    };
    loop();
  });
}

function startDevServer(options, runDir) {
  if (options.noStartDev) return null;
  const logPath = path.join(runDir, "vite.log");
  const log = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn("pnpm", ["--filter", "@xiaozhuoban/web", "exec", "vite", "--host", "127.0.0.1", "--port", String(options.port), "--strictPort"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      XIAOZHUOBAN_E2E_REALTIME_AUTH_BYPASS: "true",
      VITE_XIAOZHUOBAN_E2E_AUTH_BYPASS: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return { child, logPath };
}

async function exportDiagnostics(page) {
  return page.evaluate(() => {
    const exported = window.__xiaozhuobanExportAssistantDiagnostics?.();
    if (!exported || typeof exported !== "object") return { events: [], persistentTraceEvents: [], lastHarnessDiagnostics: null };
    return exported;
  });
}

function flattenEvents(exported) {
  const byKey = new Map();
  for (const event of [...(exported.persistentTraceEvents || []), ...(exported.events || [])]) {
    if (!event || typeof event !== "object") continue;
    const key = `${event.clientSessionId || ""}:${event.clientEventIndex || ""}:${event.type || ""}:${event.clientCreatedAt || ""}`;
    byKey.set(key, event);
  }
  return [...byKey.values()].sort((a, b) => Number(a.clientEventIndex || 0) - Number(b.clientEventIndex || 0));
}

function maxEventIndex(events) {
  return events.reduce((max, event) => Math.max(max, Number(event.clientEventIndex || 0)), 0);
}

function eventToolName(event) {
  const data = event && typeof event.data === "object" ? event.data : {};
  return String(event.toolName || data.toolName || data.name || data.tool || "");
}

function classifyPath(events) {
  if (events.some((event) => event.type === "realtime.function_call.tool")) return "realtime_function_tool";
  if (events.some((event) => event.type === "realtime.function_call.command_plan_result")) return "realtime_plan";
  if (events.some((event) => event.type === "realtime.function_call.command_result" || event.type === "realtime.function_call.legacy_plan_result")) {
    return "realtime_command_tool";
  }
  if (events.some((event) => event.type === "realtime.tool_selection.local_add_widget_shortcut")) return "realtime_selection_local_widget";
  if (events.some((event) => event.type === "realtime.function_call.selection" || event.type === "realtime.plan_selection.success")) return "realtime_tool_selection";
  const result = events.find((event) => event.type === "voice.realtime_text_command.result");
  if (result?.data?.execution === "harness") return "realtime_text_harness";
  if (result?.status === "sent") return "realtime_data_channel";
  if (events.some((event) => event.type === "voice.text_command.result")) return "local_text_harness";
  return "unknown";
}

function summarizeRealtimeOrigin(events) {
  const functionCallEvents = events.filter((event) => typeof event.type === "string" && event.type.startsWith("realtime.function_call."));
  return {
    functionCall: functionCallEvents.length > 0,
    directTool: functionCallEvents.some((event) => event.type === "realtime.function_call.tool"),
    planTool: functionCallEvents.some((event) => event.type === "realtime.function_call.command_plan_result"),
    commandTool: functionCallEvents.some((event) => event.type === "realtime.function_call.command_result" || event.type === "realtime.function_call.legacy_plan_result"),
    toolNames: [...new Set(functionCallEvents.map(eventToolName).filter(Boolean))]
  };
}

function summarizeRealtimeToolCalls(events) {
  const directCalls = events
    .filter((event) => event.type === "realtime.function_call.tool")
    .map((event) => {
      const data = event && typeof event.data === "object" && event.data ? event.data : {};
      return {
        toolName: eventToolName(event),
        args: Object.fromEntries(
          Object.entries(data).filter(([, value]) =>
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number"))
          )
        )
      };
    });
  const localFollowUps = events
    .filter((event) =>
      event.type === "realtime.tool_selection.local_add_widget_shortcut" ||
      event.type === "realtime.function_call.missing_widget_wrapped" ||
      event.type === "realtime.function_call.add_widget_follow_up_repaired"
    )
    .map((event) => {
      const data = event && typeof event.data === "object" && event.data ? event.data : {};
      const toolName = typeof data.followUpName === "string" ? data.followUpName : "";
      const args = Object.fromEntries(
        Object.entries(data).filter(([key, value]) =>
          key !== "followUpName" &&
          (typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number")))
        )
      );
      return toolName ? { toolName, args } : null;
    })
    .filter(Boolean);
  const planCalls = events
    .filter((event) => event.type === "realtime.function_call.command_plan_result" || event.type === "realtime.runtime.command_plan_result")
    .flatMap((event) => {
      const data = event && typeof event.data === "object" && event.data ? event.data : {};
      const commands = Array.isArray(data.commands) ? data.commands : [];
      return commands
        .map((command) => {
          if (!command || typeof command !== "object") return null;
          const toolName = typeof command.toolName === "string" ? command.toolName : typeof command.tool === "string" ? command.tool : "";
          const argsRecord = command.args && typeof command.args === "object" && !Array.isArray(command.args) ? command.args : {};
          const args = Object.fromEntries(
            Object.entries(argsRecord).filter(([, value]) =>
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean" ||
              (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number"))
            )
          );
          return toolName ? { toolName, args } : null;
        })
        .filter(Boolean);
    });
  const operationCalls = events
    .filter((event) => event.type === "assistant.operation" && event.status === "success")
    .map((event) => {
      const toolName = eventToolName(event);
      const operationId = typeof event.operationId === "string" ? event.operationId : "";
      const args = {};
      if (/cna/i.test(operationId)) args.channelName = "CNA";
      if (/bloomberg/i.test(operationId)) args.channelName = "Bloomberg";
      if (/nhk/i.test(operationId)) args.channelName = "NHK World-Japan";
      return toolName ? { toolName, args } : null;
    })
    .filter(Boolean);
  return [...directCalls, ...localFollowUps, ...planCalls, ...operationCalls];
}

function expectedArgsMatched(expectArgs = [], realtimeToolCalls = []) {
  if (!expectArgs.length) return true;
  return expectArgs.every((rule) => {
    const matcher = new RegExp(rule.match, "i");
    return realtimeToolCalls.some((call) => {
      if (rule.tool && call.toolName !== rule.tool) return false;
      const values = (rule.keys || []).flatMap((key) => {
        const value = call.args?.[key];
        return Array.isArray(value) ? value : value === undefined ? [] : [value];
      });
      return values.some((value) => matcher.test(String(value)));
    });
  });
}

function summarizeTools(events) {
  const tools = new Set();
  for (const event of events) {
    const data = event && typeof event.data === "object" && event.data ? event.data : {};
    const tool = event.type === "assistant.operation"
      ? eventToolName(event)
      : typeof data.followUpName === "string"
        ? data.followUpName
        : "";
    if (tool) tools.add(tool);
  }
  return [...tools].filter(Boolean);
}

function summarizePlannedTools(events) {
  const tools = new Set();
  for (const event of events) {
    const data = event && typeof event.data === "object" ? event.data : {};
    if (Array.isArray(data.tools)) data.tools.forEach((item) => tools.add(String(item)));
  }
  return [...tools].filter(Boolean);
}

function expectedToolMatched(expected, tools) {
  if (!expected.length) return true;
  return expected.some((needle) => tools.some((tool) => tool === needle || tool.includes(needle) || needle.includes(tool)));
}

function requiredToolsMatched(required = [], tools = [], plannedTools = []) {
  const available = new Set([...tools, ...plannedTools]);
  return required.every((tool) => available.has(tool));
}

function replyLooksContradictory(result, snapshot) {
  const text = `${snapshot.answer || ""}\n${snapshot.operation || ""}\n${snapshot.statusStream || ""}`;
  const hasSuccess = result.operationEvents.some((event) => event.status === "success");
  const hasFailure = result.operationEvents.some((event) => event.status === "failed" || event.status === "error");
  const deniesSuccess = /(没有(成功|执行|找到|对应)|无法|不能|失败|未能|没法)/.test(text);
  const claimsSuccess = /(已|完成|好了|正在|开始|打开|切到|播放|添加|创建|关闭)/.test(text);
  if (hasSuccess && deniesSuccess) return true;
  if (hasFailure && claimsSuccess) return true;
  return false;
}

async function getSnapshot(page) {
  return page.evaluate(() => {
    const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.getAttribute("data-widget-id") || "",
        text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 260),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
      };
    });
    return {
      url: window.location.href,
      bodyText: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 2400),
      operation: document.querySelector('[data-testid="voice-assistant-operation"]')?.textContent?.replace(/\s+/g, " ").trim() || "",
      answer: document.querySelector(".voice-assistant-dock__answer-text")?.textContent?.replace(/\s+/g, " ").trim() || "",
      statusStream: Array.from(document.querySelectorAll(".voice-assistant-dock__status-stream span"))
        .map((item) => item.textContent?.replace(/\s+/g, " ").trim() || "")
        .filter(Boolean)
        .slice(0, 6)
        .join(" | "),
      widgets
    };
  });
}

async function sendCommand(page, command, waitMs) {
  const input = page.getByTestId("voice-assistant-command-input");
  if (!(await input.isVisible().catch(() => false))) {
    const orb = page.getByTestId("voice-assistant-dock").locator(".voice-assistant-dock__orb").first();
    const box = await orb.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(650);
      await page.mouse.up();
    }
  }
  if (!(await input.isVisible().catch(() => false))) {
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(500);
    const orb = page.getByTestId("voice-assistant-dock").locator(".voice-assistant-dock__orb").first();
    const box = await orb.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(650);
      await page.mouse.up();
    }
  }
  await input.waitFor({ state: "visible", timeout: 8_000 });
  await input.fill(command);
  await input.press("Enter");
  await page.waitForTimeout(waitMs);
  const pendingText = await page.locator(".voice-assistant-dock__confirm").textContent().catch(() => "");
  if (/确认|执行|取消/.test(pendingText || "")) {
    await input.fill("确认");
    await input.press("Enter");
    await page.waitForTimeout(Math.max(1_200, Math.floor(waitMs / 2)));
  }
}

async function connectRealtime(page, options) {
  await page.getByTestId("voice-assistant-dock").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByTestId("voice-assistant-dock").locator(".voice-assistant-dock__orb").first().click({ force: true });
  await page.waitForFunction(
    () => {
      const exported = window.__xiaozhuobanExportAssistantDiagnostics?.();
      const events = [...(exported?.persistentTraceEvents || []), ...(exported?.events || [])];
      return events.some((event) => event.type === "voice.status" && event.status === "connected");
    },
    null,
    { timeout: options.connectTimeoutMs }
  );
  await page.getByTestId("voice-assistant-command-input").waitFor({ state: "visible", timeout: 12_000 });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(outputRoot, runId);
  ensureDir(runDir);

  const dev = startDevServer(options, runDir);
  try {
    await waitForUrl(`http://127.0.0.1:${options.port}/app`);
    const playwright = requirePlaywright();
    const userDataDir = path.join(runDir, "browser-profile");
    const context = await playwright.chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: !options.headed,
      viewport: { width: 1440, height: 920 },
      permissions: ["microphone"],
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required"
      ]
    });
    const page = context.pages()[0] || (await context.newPage());
    const consoleMessages = [];
    const networkFailures = [];
    page.on("console", (message) => {
      const type = message.type();
      if (type === "error" || type === "warning") consoleMessages.push({ type, text: message.text().slice(0, 500) });
    });
    page.on("requestfailed", (request) => {
      networkFailures.push({ url: request.url(), failure: request.failure()?.errorText || "" });
    });
    await page.route("https://raw.githubusercontent.com/YueChan/Live/refs/heads/main/Global.m3u", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.apple.mpegurl",
        body: seededTvPlaylistM3u
      });
    });

    await page.addInitScript(
      ({ key, catalog }) => {
        window.localStorage.setItem(key, JSON.stringify(catalog));
      HTMLMediaElement.prototype.play = function play() {
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      };
      },
      { key: TV_ASSISTANT_CHANNEL_CATALOG_KEY, catalog: seededTvAssistantChannelCatalog }
    );
    await page.goto(`http://127.0.0.1:${options.port}/app`, { waitUntil: "domcontentloaded" });
    await connectRealtime(page, options);

    const startIndex = Math.max(0, Math.min(commandCases.length, options.from - 1));
    const endIndex = options.to == null ? Math.min(commandCases.length, startIndex + options.limit) : Math.max(startIndex, Math.min(commandCases.length, options.to));
    const selectedCases = commandCases.slice(startIndex, endIndex);
    const results = [];
    for (const testCase of selectedCases) {
      const beforeEvents = flattenEvents(await exportDiagnostics(page));
      const beforeIndex = maxEventIndex(beforeEvents);
      const beforeSnapshot = await getSnapshot(page);
      let sendError = "";
      try {
        await sendCommand(page, testCase.command, options.commandWaitMs);
      } catch (error) {
        sendError = error instanceof Error ? error.message : String(error);
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(700);
      }
      const afterExport = await exportDiagnostics(page);
      const afterEvents = flattenEvents(afterExport);
      const newEvents = afterEvents.filter((event) => Number(event.clientEventIndex || 0) > beforeIndex);
      const afterSnapshot = await getSnapshot(page);
      const tools = summarizeTools(newEvents);
      const plannedTools = summarizePlannedTools(newEvents);
      const operationEvents = newEvents.filter((event) => event.type === "assistant.operation");
      const success = operationEvents.some((event) => event.status === "success");
      const failed = operationEvents.some((event) => event.status === "failed" || event.status === "error" || event.status === "skipped");
      const commandResultFailed = newEvents.some((event) =>
        (event.type === "voice.realtime_text_command.result" || event.type === "voice.text_command.result") &&
        (event.status === "failed" || event.status === "error")
      );
      const pathName = classifyPath(newEvents);
      const realtimeOrigin = summarizeRealtimeOrigin(newEvents);
      const realtimeToolCalls = summarizeRealtimeToolCalls(newEvents);
      const toolMatched = expectedToolMatched(testCase.expect, tools);
      const requiredMatched = requiredToolsMatched(testCase.requiredTools, tools, plannedTools);
      const argsMatched = expectedArgsMatched(testCase.expectArgs, realtimeToolCalls);
      const replyContradiction = replyLooksContradictory({ operationEvents }, afterSnapshot);
      const uiChanged =
        beforeSnapshot.widgets.length !== afterSnapshot.widgets.length ||
        beforeSnapshot.bodyText !== afterSnapshot.bodyText ||
        beforeSnapshot.operation !== afterSnapshot.operation;
      const passed =
        !sendError &&
        success &&
        toolMatched &&
        requiredMatched &&
        argsMatched &&
        !replyContradiction &&
        !failed &&
        !commandResultFailed &&
        (options.allowLocalFallback || realtimeOrigin.functionCall);
      const result = {
        ...testCase,
        passed,
        sendError,
        path: pathName,
        tools,
        plannedTools,
        realtimeOrigin,
        realtimeToolCalls,
        success,
        failed: failed || commandResultFailed,
        toolMatched,
        requiredMatched,
        argsMatched,
        replyContradiction,
        uiChanged,
        operation: afterSnapshot.operation,
        answer: afterSnapshot.answer,
        statusStream: afterSnapshot.statusStream,
        widgetCount: afterSnapshot.widgets.length,
        eventTypes: newEvents.map((event) => `${event.type}${event.status ? `:${event.status}` : ""}`).slice(-30),
        operationEvents
      };
      results.push(result);
      const visibleSummary = result.answer || (result.operation && result.operation !== "待命" ? result.operation : "") || result.operation;
      const originSummary = realtimeOrigin.functionCall ? realtimeOrigin.toolNames.join(",") || "function_call" : "no-realtime-function-call";
      const argSummary = realtimeToolCalls
        .map((call) => `${call.toolName}:${JSON.stringify(call.args)}`)
        .join("; ");
      console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id} ${result.command} | ${result.path} | ${originSummary} | ${tools.join(",") || "no-tools"} | ${argSummary || "no-args"} | ${visibleSummary}`);
    }

    const diagnostics = await exportDiagnostics(page);
    const finalSnapshot = await getSnapshot(page);
    await page.screenshot({ path: path.join(runDir, "final.png"), fullPage: true }).catch(() => undefined);
    await context.close();

    const report = {
      runId,
      pageUrl: `http://127.0.0.1:${options.port}/app`,
      totals: {
        count: results.length,
        passed: results.filter((item) => item.passed).length,
        failed: results.filter((item) => !item.passed).length,
        allowLocalFallback: options.allowLocalFallback,
        paths: results.reduce((acc, item) => {
          acc[item.path] = (acc[item.path] || 0) + 1;
          return acc;
        }, {})
      },
      results,
      consoleMessages,
      networkFailures,
      finalSnapshot,
      diagnostics
    };
    fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2));
    const markdown = [
      `# Realtime Text Command Matrix ${runId}`,
      "",
      `- Count: ${report.totals.count}`,
      `- Passed: ${report.totals.passed}`,
      `- Failed: ${report.totals.failed}`,
      `- Allow local fallback: ${report.totals.allowLocalFallback ? "yes" : "no"}`,
      `- Paths: ${Object.entries(report.totals.paths).map(([key, value]) => `${key}=${value}`).join(", ")}`,
      "",
      "| ID | Result | Path | Realtime origin | Tools | Args | Command | Operation |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...results.map((item) =>
        `| ${item.id} | ${item.passed ? "pass" : "fail"} | ${item.path} | ${item.realtimeOrigin.functionCall ? item.realtimeOrigin.toolNames.join(", ") || "function_call" : "-"} | ${item.tools.join(", ") || "-"} | ${item.realtimeToolCalls.map((call) => `${call.toolName}:${JSON.stringify(call.args)}`).join("<br>") || "-"} | ${item.command.replace(/\|/g, "/")} | ${(item.operation || item.answer || "").replace(/\|/g, "/").slice(0, 160)} |`
      )
    ].join("\n");
    fs.writeFileSync(path.join(runDir, "report.md"), markdown);
    console.log(`\nReport: ${path.relative(repoRoot, path.join(runDir, "report.md"))}`);
    if (report.totals.failed > 0) process.exitCode = 1;
  } finally {
    if (dev?.child && !dev.child.killed) {
      dev.child.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
