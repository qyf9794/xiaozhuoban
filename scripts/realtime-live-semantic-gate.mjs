import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import WebSocket from "ws";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const REPORT_PATH = resolve(ROOT, "docs/realtime-live-semantic-gate-report.md");
const CATALOG_REPORT_PATH = resolve(ROOT, "docs/realtime-voice-scenario-catalog-simulation-report.md");
const LIVE_CATALOG_REPORT_PATH = resolve(ROOT, "docs/realtime-live-semantic-catalog-570-report.md");
const COMMAND_POLICY_MANIFEST_PATH = resolve(ROOT, "packages/assistant-core/src/commandPolicyManifest.json");
const MODEL = process.env.XIAOZHUOBAN_REALTIME_LIVE_MODEL || "gpt-realtime-2";
const LIVE_SITE = process.env.XIAOZHUOBAN_REALTIME_LIVE_SITE || "";
const RESPONSE_TIMEOUT_MS = Number(process.env.XIAOZHUOBAN_REALTIME_LIVE_TIMEOUT_MS || 20_000);
const SELECT_TOOL_NAME = "assistant.select_tool";
const PLAN_TOOL_NAME = "assistant.select_command_plan";
const BATCH_TOOL_NAME = "assistant.submit_semantic_batch";

const toolNames = [
  "music.search",
  "music.play",
  "weather.current",
  "board.add_widget",
  "widget.remove",
  "widget.focus",
  "app.sidebar.set",
  "app.settings.open",
  "app.fullscreen.set",
  "board.auto_align"
];

const moduleTypes = ["music", "weather", "messageBoard", "dialClock", "worldClock", "settings", "app", "board"];

const commandPolicyManifest = JSON.parse(readFileSync(COMMAND_POLICY_MANIFEST_PATH, "utf8"));

const toolDescriptions = {
  "app.ai_dialog.open": "Open the AI widget builder dialog.",
  "app.command_palette.open": "Open the command/search palette.",
  "app.fullscreen.set": "Enter, exit, or toggle fullscreen.",
  "app.settings.open": "Open app settings.",
  "app.sidebar.set": "Show, hide, or toggle the sidebar.",
  "assistant.reply": "Reply without mutating app state when no safe tool applies.",
  "assistant.runtime_diagnostics": "Show or record assistant runtime diagnostics.",
  "board.add_widget": "Open or add an existing widget definition.",
  "board.auto_align": "Auto-align or organize widgets on the current board.",
  "board.create": "Create a new board.",
  "board.delete": "Delete a board after confirmation.",
  "board.rename": "Rename a board.",
  "board.switch": "Switch to another board.",
  "calculator.set_display": "Calculate an expression and show the result.",
  "clipboard.add_text": "Save or copy text into the clipboard widget.",
  "clipboard.clear": "Clear clipboard items.",
  "converter.set": "Convert units such as weight, length, area, temperature, time, or currency.",
  "countdown.pause": "Pause countdown.",
  "countdown.reset": "Reset countdown.",
  "countdown.resume": "Resume countdown.",
  "countdown.set": "Set a countdown or reminder duration.",
  "dialClock.set_night_mode": "Adjust dial clock night/dim mode.",
  "headline.request_refresh": "Refresh or show headline/news widget.",
  "market.set_indices": "Show market indices.",
  "messageBoard.clear_draft": "Clear the message board draft without sending.",
  "messageBoard.send": "Send text to the message board.",
  "music.auth_status": "Check Apple Music authorization or preview/full playback status.",
  "music.next": "Skip to next track.",
  "music.pause": "Pause music playback.",
  "music.play": "Play music or a specific track when playback is intended.",
  "music.previous": "Go to previous track.",
  "music.resume": "Resume music playback.",
  "music.search": "Search music by artist, song, mood, style, or playlist without assuming previous/next control.",
  "note.clear": "Clear note contents.",
  "note.write": "Write or append text to a note.",
  "recorder.pause": "Pause recorder playback.",
  "recorder.play": "Play a recording.",
  "recorder.start": "Start recording.",
  "recorder.stop": "Stop recording.",
  "todo.add_item": "Add a todo item or reminder.",
  "todo.clear_completed": "Clear completed todo items.",
  "todo.complete_item": "Mark a todo item completed.",
  "translate.set_draft": "Translate text or prepare translation draft.",
  "tv.fullscreen": "Fullscreen TV widget.",
  "tv.pause": "Pause TV playback.",
  "tv.play": "Play TV/live channel.",
  "tv.select_channel": "Select a TV channel.",
  "weather.set_city": "Show weather for a city or weather-related outdoor suitability.",
  "widget.bring_to_front": "Bring a widget window to front.",
  "widget.focus": "Focus a widget window.",
  "widget.fullscreen_focus": "Fullscreen-focus a widget window.",
  "widget.move": "Move a widget window.",
  "widget.remove": "Close/remove a widget window.",
  "widget.resize": "Resize a widget window.",
  "worldClock.set_zones": "Show world clock zones or city times."
};

function getArg(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseIdFilter(value) {
  return String(value || "")
    .split(",")
    .map((item) => normalizeCatalogId(item.trim()))
    .filter(Boolean);
}

const tests = [
  {
    id: "music_entity_exact",
    mode: "select",
    command: "播放王菲的红豆",
    expectedNames: ["music.search", "music.play"],
    expectedModule: "music",
    targetIncludes: ["王菲", "红豆"]
  },
  {
    id: "music_mood_research",
    mode: "select",
    command: "我想听点轻松的音乐",
    expectedNames: ["music.search", "music.play"],
    expectedModule: "music",
    targetIncludes: ["轻松"]
  },
  {
    id: "close_message_board",
    mode: "select",
    command: "关闭留言板",
    expectedNames: ["widget.remove"],
    expectedModule: "messageBoard",
    targetIncludes: ["留言板"]
  },
  {
    id: "open_default_clock",
    mode: "select",
    command: "打开时钟",
    expectedNames: ["board.add_widget"],
    expectedModule: "dialClock",
    targetIncludes: ["时钟"]
  },
  {
    id: "hide_sidebar",
    mode: "select",
    command: "隐藏侧边栏",
    expectedNames: ["app.sidebar.set"],
    expectedModule: "app",
    targetIncludes: ["侧边栏"]
  },
  {
    id: "organize_desktop",
    mode: "select",
    command: "整理桌面",
    expectedNames: ["board.auto_align"],
    expectedModule: "board",
    targetIncludes: ["桌面"]
  },
  {
    id: "music_weather_plan",
    mode: "plan",
    command: "播放陈奕迅的十年，然后查上海天气",
    expectedNames: ["music.search", "weather.current"],
    targetIncludes: ["陈奕迅", "十年", "上海"]
  }
];

function encodeToolName(name) {
  return name.replace(/\./g, "__dot__");
}

function decodeToolName(name) {
  return String(name).replace(/__dot__/g, ".");
}

function redactApiKey(value) {
  return typeof value === "string" && value.startsWith("sk-") ? "[redacted-openai-key]" : value;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
}

function getApiKey() {
  loadEnvFile(resolve(ROOT, "apps/web/.env.local"));
  const localKeyPath = resolve(ROOT, ".realtime-live-key");
  const fileKey = existsSync(localKeyPath) ? readFileSync(localKeyPath, "utf8").trim() : "";
  const apiKey = process.env.OPENAI_API_KEY || fileKey;
  if (!apiKey || apiKey.includes("your-server-side-openai-api-key")) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }
  return apiKey;
}

async function discoverProductionSupabaseConfig(siteBaseUrl) {
  const baseUrl = new URL(siteBaseUrl);
  const html = await (await fetch(baseUrl)).text();
  const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], baseUrl).href)
    .filter((url) => url.includes("/assets/") && url.endsWith(".js"));
  for (const assetUrl of assetUrls) {
    const text = await (await fetch(assetUrl)).text();
    const supabaseUrl = text.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const publishableKey = text.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
    if (supabaseUrl && publishableKey) {
      return { supabaseUrl, publishableKey };
    }
  }
  throw new Error("PRODUCTION_SUPABASE_CONFIG_NOT_FOUND");
}

async function createProductionSupabaseAccessToken(siteBaseUrl) {
  const { supabaseUrl, publishableKey } = await discoverProductionSupabaseConfig(siteBaseUrl);
  const email = `codex-realtime-live-${Date.now()}@example.com`;
  const password = `Codex-${randomBytes(12).toString("base64url")}1!`;
  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${publishableKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await response.json().catch(() => null);
  const accessToken = payload?.access_token;
  if (!response.ok || typeof accessToken !== "string" || !accessToken) {
    throw new Error(`PRODUCTION_SUPABASE_SIGNUP_FAILED status=${response.status} body=${JSON.stringify(payload)}`);
  }
  return { accessToken, email };
}

async function getRealtimeAccessToken() {
  if (!LIVE_SITE) {
    return { token: getApiKey(), source: "local-openai-api-key" };
  }
  const siteBaseUrl = LIVE_SITE.replace(/\/+$/, "");
  const { accessToken, email } = await createProductionSupabaseAccessToken(siteBaseUrl);
  const response = await fetch(`${siteBaseUrl}/api/realtime/session`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ ttlSeconds: 120, reasoningEffort: "low" })
  });
  const payload = await response.json().catch(() => null);
  const secret = payload?.value ?? payload?.client_secret?.value;
  if (!response.ok || typeof secret !== "string" || !secret) {
    throw new Error(`PRODUCTION_REALTIME_SESSION_FAILED status=${response.status} body=${JSON.stringify(payload)}`);
  }
  return { token: secret, source: "production-ephemeral-token", productionSite: siteBaseUrl, email };
}

function objectSchema(properties, required = [], additionalProperties = false) {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties
  };
}

function stringEnum(values) {
  return { type: "string", enum: values };
}

function createSelectTool() {
  return {
    type: "function",
    name: encodeToolName(SELECT_TOOL_NAME),
    description: "Select the best Xiaozhuoban tool/module for one spoken user command. Do not execute the tool.",
    parameters: objectSchema(
      {
        name: stringEnum(toolNames),
        selectedModule: stringEnum(moduleTypes),
        targetHint: {
          type: "string",
          description: "Copy key Chinese target words, entities, song names, artists, or widgets from the user command."
        },
        userCommand: { type: "string" },
        confidence: { type: "number" }
      },
      ["name", "selectedModule", "targetHint", "confidence"]
    )
  };
}

function createPlanTool() {
  return {
    type: "function",
    name: encodeToolName(PLAN_TOOL_NAME),
    description: "Select an ordered tool plan for a multi-step Xiaozhuoban spoken command. Do not execute tools.",
    parameters: objectSchema(
      {
        steps: {
          type: "array",
          items: objectSchema(
            {
              id: { type: "string" },
              name: stringEnum(toolNames),
              selectedModule: stringEnum(moduleTypes),
              targetHint: { type: "string" },
              connector: { type: "string", enum: ["start", "sequential", "parallel"] },
              confidence: { type: "number" }
            },
            ["name", "targetHint"]
          )
        },
        confidence: { type: "number" }
      },
      ["steps"]
    )
  };
}

function createBatchTool(allToolNames, allModuleTypes) {
  return {
    type: "function",
    name: encodeToolName(BATCH_TOOL_NAME),
    description: "Submit semantic parsing results for a batch of Xiaozhuoban spoken commands. Do not execute tools.",
    parameters: objectSchema(
      {
        rows: {
          type: "array",
          items: objectSchema(
            {
              id: { type: "string" },
              tools: {
                type: "array",
                items: stringEnum(allToolNames),
                description: "All tools needed to satisfy this command. Keep order meaningful for sequential commands."
              },
              primaryModule: stringEnum(allModuleTypes),
              targetHint: { type: "string" },
              confidence: { type: "number" },
              notes: { type: "string" }
            },
            ["id", "tools", "primaryModule", "targetHint", "confidence"]
          )
        }
      },
      ["rows"]
    )
  };
}

function moduleForTool(toolName) {
  if (toolName.startsWith("app.")) return "app";
  if (toolName.startsWith("board.")) return "board";
  if (toolName.startsWith("widget.")) return "widget";
  if (toolName.startsWith("assistant.")) return "assistant";
  return toolName.split(".")[0] || "unknown";
}

function parseCatalogSimulation(limit) {
  const text = readFileSync(CATALOG_REPORT_PATH, "utf8");
  const rows = [];
  const regex = /^(\d{3})\. \[pass\] route=([^;]+); reason=([^;]+); tools=([^;]+); command=(.+)$/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const index = Number(match[1]);
    if (index > limit) continue;
    const expectedNames = match[4].split(",").map((tool) => tool.trim()).filter(Boolean);
    rows.push({
      id: match[1],
      index,
      route: match[2],
      reason: match[3],
      expectedNames,
      command: match[5]
    });
  }
  rows.sort((a, b) => a.index - b.index);
  return rows;
}

function createCatalogInstructions(allToolNames) {
  const catalog = allToolNames
    .map((name) => `- ${name}: ${toolDescriptions[name] ?? `${name} tool.`}`)
    .join("\n");
  return [
    "# Role and Objective",
    "你是小桌板 Realtime-2 在线语义解析门禁。只做语义解析和工具规划，不执行工具。",
    "给定一批中文语音命令，为每条命令选择完整的工具列表。",
    "",
    "# Available Tools",
    catalog,
    "",
    "# General Rules",
    "- 对每条输入必须返回一条 rows 结果，id 必须原样保留。",
    "- tools 必须只使用 Available Tools 中的工具名。",
    "- 多步骤命令需要列出所有必要工具，保持执行顺序；独立并发步骤也全部列出。",
    "- 只要用户有明确小桌板操作意图，就选择最接近的工具；不要因为需要确认、可能失败、缺少当前状态、包含条件句、包含 token/口令/验证码等文本就改成 assistant.reply。",
    "- 只有纯问候、纯闲聊、纯状态询问且没有可用动作工具时，才使用 assistant.reply 或 assistant.runtime_diagnostics。",
    "- 日志、监控、诊断、工具目录、分级加载、模块加载、工具调用失败、前端成功状态、弱网、断线、重连、重复回复、记录错误、导出语音诊断摘要，使用 assistant.runtime_diagnostics；但同一句出现执行关闭、关闭留言板、整理桌面、触发确认、搜索音乐等明确动作时，动作工具优先。",
    "- 多轮对话记忆、同一条语音不要丢命令、全局工具摘要/选中模块详情、工具目录没加载完这类系统观测命令，必须使用 assistant.runtime_diagnostics；但不要覆盖同一句里的明确小工具动作。",
    "- “我说 X 时优先 Y”“以后我说 X 就 Y”“把 X 规则改成 Y”是偏好或规则设置，不是立即执行 X；使用 assistant.runtime_diagnostics 或 assistant.reply，除非用户同时说现在/马上执行。",
    "- 如果一句话同时包含诊断词和明确动作，例如“关闭留言板的本地解析置信度低就交给 realtime”，明确动作优先，选择 widget.remove 等动作工具。",
    "- “我说关闭留言板时执行关闭”“关闭留言板不是发送消息”“置信度低就交给 realtime”仍是关闭动作，必须使用 widget.remove，不要改成 assistant.runtime_diagnostics。",
    "- “我说整理桌面时加载桌板和窗口工具”“整理桌面时触发确认”仍是整理桌面动作，必须使用 board.auto_align，不要只做诊断。",
    "- 如果用户说连接后“在吗”，这是连通性自然回复，使用 assistant.reply。",
    "- 打开小工具使用 board.add_widget；如果打开后还要播放、查询、刷新、发送、写入或设置内容，同时列出对应工具。",
    "- 硬性窗口规则：句子包含打开、先打开、再打开、都打开、新的实例、新建实例、添加、放上去、只放、唤出 + 小工具名时，必须保留 board.add_widget，即使同时选择 weather.set_city、converter.set、note.write 等内容工具。",
    "- 电视、天气、世界时钟、表盘时钟、新闻、行情、录音机、便签、待办、剪贴板、翻译、计算器都按硬性窗口规则处理。",
    "- 如果用户说某个窗口“如果没开，先打开再查/再做”，必须包含 board.add_widget 和对应内容工具。",
    "- 再打开一个倒计时/再打开一个计时器是打开新小工具实例，使用 board.add_widget；不要误解为设置倒计时。",
    "- 打开电视/先打开电视/打开 CCTV/播放 CCTV 前如果语义包含打开窗口，必须包含 board.add_widget，再列 tv.play 或 tv.select_channel。",
    "- 打开天气/打开世界时钟/打开新闻/打开行情时，必须包含 board.add_widget，并列出 weather.set_city/worldClock.set_zones/headline.request_refresh/market.set_indices。",
    "- 打开音乐播放器并搜索/播放时，必须包含 board.add_widget，并列出 music.search 或 music.play。",
    "- 如果工具目录没加载完但用户要求打开音乐，仍包含 board.add_widget；如果要求播放具体歌曲且缺音乐工具，仍包含 music.play。",
    "- 打开上证和深证行情、打开市场行情、打开财经行情这类打开行情窗口请求，必须包含 board.add_widget 和 market.set_indices。",
    "- 查某地天气并提醒我/如果冷就提醒/明天出门先查天气再提醒，必须同时包含 weather.set_city 和 todo.add_item。",
    "- 关闭/收起小工具使用 widget.remove；聚焦窗口使用 widget.focus。",
    "- 用户说先确认、确认后、如果没有、保留 pinned、保留正在运行的等约束时，仍返回对应动作工具；确认和约束执行由本地 Harness 处理，不要改成 assistant.reply。",
    "- 聚焦天气卡片、切到天气窗口等天气窗口目标，在当前 catalog 中同时包含 widget.focus 和 weather.set_city。",
    "- 移动、放大、缩小、调位置、放最前等窗口布局请求分别使用 widget.move、widget.resize、widget.bring_to_front。",
    "- 恢复正常大小、退出全屏后恢复大小、把播放器恢复正常大小，必须包含 widget.resize。",
    "- 别盖住、避免挡住、不要遮住、恢复正常大小、排成一列、控件居中、登录按钮右上角这类界面布局请求使用 widget.move 或 widget.resize，不要使用 assistant.reply。",
    "- 放最前、置顶、最前面必须包含 widget.bring_to_front；通常还包含 widget.focus。",
    "- 放最前、别被挡住、置顶类请求还要同时包含 widget.focus。",
    "- 全屏看某个媒体/小工具时，包含对应播放/打开工具、对应 fullscreen 工具，以及 widget.fullscreen_focus。",
    "- 全屏看电视、电视全屏、CCTV 全屏时使用 tv.fullscreen 和 widget.fullscreen_focus；不要把它解析成 app.fullscreen.set。",
    "- 打开表盘时钟、一个表盘时钟、钟表等 dialClock 请求，必须同时包含 board.add_widget 和 dialClock.set_night_mode。",
    "- 用户只说打开时钟，默认 dialClock；明确世界时间、时区、东京/纽约/巴黎等多城市时间才使用 worldClock.set_zones。",
    "- 涉及非本地城市天气如洛杉矶、纽约、东京、巴黎、伦敦时，如果命令是“看看某地天气/时间”这类上下文请求，同时包含 weather.set_city 和 worldClock.set_zones。",
    "- 播放/来一首/给我放/我要听 + 歌手或歌曲名时使用 music.play。",
    "- 播放/给我一首/换成/专注模式用的播放列表/播放轻音乐/播放舒缓钢琴，即使是风格词，也表示要开始播放，使用 music.play。",
    "- 搜索/搜 + 关键词 + 然后播放第一个结果，必须同时包含 music.search 和 music.play。",
    "- 找 + 明确歌手和歌名，且用户表达别只放试听/不要试听时，使用 music.play；只是找运动、睡前、背景、轻柔、周末感觉等风格探索时使用 music.search。",
    "- 换成轻松一点、不要继续现在的歌曲、不要沿用上一首，必须使用 music.search 重新搜索。",
    "- 找 + 明确歌手和歌名，即使带播放前确认，也使用 music.play；确认由本地 Harness 处理。",
    "- 音乐登录、授权、试听片段、完整播放、已登录账号但仍试听，使用 music.auth_status，不要使用 music.search。",
    "- 检查有没有登录音乐入口、查看音乐登录入口，也使用 music.auth_status；可以同时包含 app.settings.open，但不要 assistant.reply。",
    "- 搜索/找/重新搜索/不一定播放/先不播放/不要播放，或只是轻松、放松、背景、睡前等模糊风格探索时，使用 music.search，不要误判为上一首/下一首。",
    "- 搜索轻松音乐不要复用上一条播放器状态、重新搜索音乐不要沿用当前歌曲，必须使用 music.search，不要改成诊断。",
    "- 暂停/继续/上一首/下一首等明确播放控制才使用 music.pause、music.resume、music.previous、music.next。",
    "- 关闭留言板是 widget.remove，不是 messageBoard.send。",
    "- 留言板发一句、回复、发送文本才使用 messageBoard.send。",
    "- 天气、适合出门、下雨、带伞、冷不冷、适合跑步/洗车都使用 weather.set_city。",
    "- 新闻/头条/重大新闻使用 headline.request_refresh；行情/指数/纳指/恒生/上证使用 market.set_indices。",
    "- 新闻摘要追加到便签、新闻备忘、天气摘要发到留言板这类跨工具摘要命令，需要同时列出来源工具和目标工具。",
    "- 翻译成英文备忘、写入备忘、追加到便签，必须包含 note.write。",
    "- 新闻和天气并排、新闻窗口和天气窗口一起显示，必须包含 headline.request_refresh、weather.set_city 和 widget.move。",
    "- 翻译/什么意思使用 translate.set_draft；计算表达式使用 calculator.set_display；单位换算使用 converter.set。",
    "- 英文/外文短语 + 帮我看中文/看中文/什么意思，使用 translate.set_draft。",
    "- 加减乘除算式使用 calculator.set_display；单位换算和货币换算使用 converter.set。",
    "- 两公斤是多少克、2斤是多少克、多少人民币、米换公里等单位或货币换算必须使用 converter.set，不要使用 calculator.set_display。",
    "- 倒计时/计时通常使用 countdown.set；分钟后/小时后提醒我、叫我、别忘了这类提醒，同时包含 countdown.set 和 todo.add_item。",
    "- 有空提醒我、提醒我复盘、别忘了这类没有明确时间的提醒，使用 todo.add_item。",
    "- 清空/清除便签内容使用 note.clear；如果用户说先弹确认，仍返回 note.clear，确认由本地 Harness 处理。",
    "- 新建便签实例用于测试这类带“便签实例”但没有打开二字的历史 catalog 命令，按 board.add_widget 对齐真实窗口执行。",
    "- 复制/保存/固定保存/口令/验证码/token/项目名到剪贴板，使用 clipboard.add_text；清理/清空剪贴板，使用 clipboard.clear。",
    "- 清理剪贴板时保留 pinned 内容、不要删固定项、只清理未固定记录，仍使用 clipboard.clear；pinned/固定项是执行约束，不是诊断词。",
    "- 本地路径、当前歌曲名、普通文本复制到剪贴板时使用 clipboard.add_text，不要因为路径或当前状态而 assistant.reply。",
    "- 录音之前/开始录音之前如果要求先关闭电视声音，包含 tv.pause 和 recorder.start。",
    "- 删除/关闭临时倒计时或临时小工具使用 widget.remove；不要误用 countdown.reset。",
    "- 用户说“我说关闭 X 时执行关闭，不是发送/不是回复”仍然是关闭命令，使用 widget.remove。",
    "- 发送消息前先确认内容，仍选择 messageBoard.send；关闭音乐和电视之前先确认一次，仍选择 widget.remove。",
    "- 缩小窗口且避免挡住其他窗口时，同时包含 widget.resize 和 widget.move。",
    "- 留言板发送/回复/发一句使用 messageBoard.send；关闭留言板使用 widget.remove，不要发送“关闭”。",
    "- 重大新闻/头条使用 headline.request_refresh；行情/指数/纳指/恒生/上证/深证使用 market.set_indices；打开这些小工具时也包含 board.add_widget。",
    "- 清空、删除、批量整理等仍选择对应工具；确认策略由本地 Harness 处理。",
    "- 打开某某桌板、切到某某桌板、进入某某桌板使用 board.switch；只有新建/创建某某桌板才使用 board.create。",
    "",
    "# Output",
    `必须调用 ${BATCH_TOOL_NAME}，不要输出自然语言。`
  ].join("\n");
}

function normalizeTools(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item) => typeof item === "string")));
}

function uniqueTools(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeCatalogId(value) {
  const digits = String(value ?? "").match(/\d+/)?.[0] ?? "";
  return digits ? String(Number(digits)).padStart(3, "0") : String(value ?? "");
}

function buildSemanticContract(row) {
  const command = row.command;
  const mustInclude = [...row.expectedNames];
  const anyOf = [];
  const forbidden = [];
  const recoverableNonAction = [];
  const notes = [];

  const replaceMustWithAnyOf = (tools, note) => {
    const matched = tools.some((tool) => mustInclude.includes(tool));
    if (!matched) return;
    for (const tool of tools) {
      const index = mustInclude.indexOf(tool);
      if (index >= 0) mustInclude.splice(index, 1);
    }
    anyOf.push(tools);
    notes.push(note);
  };

  for (const rule of commandPolicyManifest.semanticContractRules ?? []) {
    if (!rule?.pattern || !Array.isArray(rule.tools)) continue;
    if (!new RegExp(rule.pattern).test(command)) continue;
    if (rule.kind === "anyOf") {
      replaceMustWithAnyOf(rule.tools, rule.id);
    } else if (rule.kind === "forbid") {
      forbidden.push(...rule.tools);
      notes.push(rule.id);
    }
  }
  for (const rule of commandPolicyManifest.recoverableNonActionRules ?? []) {
    if (!rule?.pattern || !Array.isArray(rule.tools)) continue;
    if (!new RegExp(rule.pattern).test(command)) continue;
    const matchingTools = rule.tools.filter((tool) => row.expectedNames.includes(tool));
    if (!matchingTools.length) continue;
    recoverableNonAction.push({ id: rule.id, tools: uniqueTools(matchingTools) });
    notes.push(rule.id);
  }

  return {
    mustInclude: uniqueTools(mustInclude),
    anyOf: anyOf.map(uniqueTools),
    forbidden: uniqueTools(forbidden),
    recoverableNonAction,
    notes: uniqueTools(notes)
  };
}

function summarizeContract(contract) {
  return [
    contract.mustInclude.length ? `must=${contract.mustInclude.join(",")}` : "",
    ...contract.anyOf.map((group) => `anyOf=${group.join("/")}`),
    contract.forbidden.length ? `forbid=${contract.forbidden.join(",")}` : ""
  ].filter(Boolean).join("; ");
}

function evaluateCatalogRow(expected, actual) {
  const actualTools = normalizeTools(actual?.tools);
  const contract = buildSemanticContract(expected);
  const missing = contract.mustInclude.filter((tool) => !actualTools.includes(tool));
  const missingAnyOf = contract.anyOf.filter((tools) => !tools.some((tool) => actualTools.includes(tool)));
  const forbidden = contract.forbidden.filter((tool) => actualTools.includes(tool));
  const unexpected = actualTools.filter((tool) => !expected.expectedNames.includes(tool));
  const confidence = typeof actual?.confidence === "number" ? actual.confidence : 0;
  const nonActionTools = new Set(commandPolicyManifest.nonActionModelTools ?? []);
  const nonActionOnly = actualTools.length > 0 && actualTools.every((tool) => nonActionTools.has(tool));
  const recoverableMissing = contract.recoverableNonAction.some((rule) => rule.tools.some((tool) => missing.includes(tool)));
  const recoverableMissingAnyOf = contract.recoverableNonAction.some((rule) =>
    missingAnyOf.some((group) => group.some((tool) => rule.tools.includes(tool)))
  );
  const hasRecoverableMiss = recoverableMissing || recoverableMissingAnyOf;
  const recoverableNonAction = Boolean(
    nonActionOnly &&
      forbidden.length === 0 &&
      hasRecoverableMiss
  );
  const recoverableForbidden = Boolean(
    forbidden.length > 0 &&
      hasRecoverableMiss
  );
  const recovered = recoverableNonAction || recoverableForbidden;
  const passed = (missing.length === 0 && missingAnyOf.length === 0 && forbidden.length === 0) || recovered;
  const failures = [];
  if (missing.length && !recovered) failures.push(`missing=${missing.join(",")}`);
  if (missingAnyOf.length && !recovered) failures.push(`missingAnyOf=${missingAnyOf.map((tools) => tools.join("/")).join(",")}`);
  if (forbidden.length && !recovered) failures.push(`forbidden=${forbidden.join(",")}`);
  return {
    passed,
    recoverableNonAction,
    recoverableForbidden,
    missing,
    missingAnyOf,
    forbidden,
    contract,
    unexpected,
    actual: {
      tools: actualTools,
      primaryModule: typeof actual?.primaryModule === "string" ? actual.primaryModule : "",
      targetHint: typeof actual?.targetHint === "string" ? actual.targetHint : "",
      confidence,
      notes: typeof actual?.notes === "string" ? actual.notes : ""
    },
    failures
  };
}

function issueCategory(row) {
  const command = row.command;
  const expected = row.expectedNames.join(",");
  const missing = row.missing.join(",");
  const actual = row.actual.tools.join(",");
  if (expected.includes("board.add_widget") && missing.includes("board.add_widget")) return "open-widget-missing";
  if (expected.includes("widget.remove") && missing.includes("widget.remove")) return "close-widget-missing";
  if (/音乐|歌|王菲|陈奕迅|周杰伦|放松|轻松|播放/.test(command) && /music/.test(expected)) return "music-intent";
  if (/天气|出门|下雨|带伞|冷不冷/.test(command) && expected.includes("weather.set_city")) return "weather-intent";
  if (/新闻|头条/.test(command) || /行情|指数|纳指|上证|恒生/.test(command)) return "news-market-intent";
  if (/便签|待办|提醒/.test(command)) return "productivity-intent";
  if (/移动|拖|放大|缩小|右上|并排|挡住|前面|聚焦|全屏/.test(command)) return "window-layout-intent";
  if (actual.includes("assistant.reply")) return "over-refusal";
  return "other";
}

function summarizeFailures(results) {
  const summary = new Map();
  for (const row of results.filter((item) => !item.passed)) {
    const category = issueCategory(row);
    summary.set(category, (summary.get(category) ?? 0) + 1);
  }
  return [...summary.entries()].sort((a, b) => b[1] - a[1]);
}

function renderCatalogReport(results, metadata) {
  const passed = results.filter((row) => row.passed).length;
  const failures = results.filter((row) => !row.passed);
  const lines = [
    `# Realtime-2 Live Semantic Catalog ${metadata.caseLabel ?? metadata.limit} Report`,
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Model: ${MODEL}`,
    `- Credential source: ${metadata.credentialSource}`,
    `- Source site: ${metadata.productionSite ?? "local"}`,
    `- Cases: ${passed}/${results.length} passed`,
    `- Batch size: ${metadata.batchSize}`,
    "- Secret handling: Realtime credentials are never written to this report.",
    "",
    "## Failure Summary",
    ""
  ];
  const summary = summarizeFailures(results);
  if (summary.length === 0) {
    lines.push("None.");
  } else {
    for (const [category, count] of summary) {
      lines.push(`- ${category}: ${count}`);
    }
  }
  lines.push("", "## Failures", "");
  if (failures.length === 0) {
    lines.push("None.");
  } else {
    lines.push("| id | command | expected | actual | missing | unexpected | category |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of failures.slice(0, 200)) {
      lines.push(
        `| ${row.id} | ${row.command.replace(/\|/g, "\\|")} | ${summarizeContract(row.contract) || row.expectedNames.join(", ")} | ${row.actual.tools.join(", ")} | ${row.failures.join("; ")} | ${row.unexpected.join(", ")} | ${issueCategory(row)} |`
      );
    }
  }
  lines.push("", "## Per-Command Results", "");
  lines.push("| id | route | command | expected | actual | confidence | result |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of results) {
    const result = row.passed
      ? row.recoverableForbidden
        ? "pass: recoverable_forbidden_tool"
        : row.recoverableNonAction
          ? "pass: recoverable_non_action"
          : "pass"
      : `fail: ${row.failures.join("; ")}`;
    lines.push(
      `| ${row.id} | ${row.route} | ${row.command.replace(/\|/g, "\\|")} | ${summarizeContract(row.contract) || row.expectedNames.join(", ")} | ${row.actual.tools.join(", ")} | ${row.actual.confidence} | ${result} |`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function createInstructions(mode) {
  const lines = [
    "# Role and Objective",
    "你是小桌板 Realtime-2 在线语义解析门禁。只做语义解析和工具选择，不执行工具。",
    "",
    "# Available Tools",
    "- music.search: 搜索并准备播放指定歌曲、歌手、歌单、风格或心情音乐。",
    "- music.play: 控制当前已选音乐播放。",
    "- weather.current: 查询城市天气。",
    "- board.add_widget: 打开已有小工具。",
    "- widget.remove: 关闭一个小工具窗口。",
    "- widget.focus: 聚焦一个小工具。",
    "- app.sidebar.set: 显示、隐藏或切换侧边栏。",
    "- app.settings.open: 打开小桌板设置。",
    "- app.fullscreen.set: 进入或退出全屏。",
    "- board.auto_align: 整理或自动排列当前桌面，需要本地确认策略处理。",
    "",
    "# Routing Rules",
    "- 播放某位歌手的某首歌，优先选择 music.search，targetHint 必须保留歌手和歌名。",
    "- 用户说轻松音乐、粤语老歌、安静一点等风格/心情，不要理解为上一首或播放控制，选择 music.search。",
    "- 关闭留言板、关掉便签、收起天气等窗口关闭意图，选择 widget.remove，不要把“关闭”当留言内容。",
    "- 用户只说打开时钟，默认 selectedModule=dialClock；只有明确说世界时钟、世界时间、时区、纽约时间等才选 worldClock。",
    "- 隐藏侧边栏选择 app.sidebar.set。",
    "- 整理桌面选择 board.auto_align。",
    "- 复杂命令拆成多个 steps，保留实体词。",
    "",
    "# Output",
    `必须调用 ${mode === "plan" ? PLAN_TOOL_NAME : SELECT_TOOL_NAME}。`
  ];
  return lines.join("\n");
}

function parseArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function findFunctionCall(value) {
  if (!value || typeof value !== "object") return null;
  if (value.type === "function_call" && typeof value.name === "string") return value;
  for (const key of ["response", "output", "items", "item", "content"]) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findFunctionCall(item);
        if (found) return found;
      }
    } else if (nested && typeof nested === "object") {
      const found = findFunctionCall(nested);
      if (found) return found;
    }
  }
  return null;
}

function formatErrorPayload(event) {
  const error = event?.error && typeof event.error === "object" ? event.error : event;
  return JSON.stringify(error, (key, value) => (key.toLowerCase().includes("key") ? redactApiKey(value) : value));
}

function createRealtimeClient(apiKey, options = {}) {
  const safetyIdentifier = `xz_live_${createHash("sha256").update("xiaozhuoban-realtime-live-gate").digest("base64url")}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`
  };
  if (!options.omitSafetyIdentifier) {
    headers["OpenAI-Safety-Identifier"] = safetyIdentifier;
  }
  const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`, {
    headers
  });
  const eventLog = [];
  const waiters = [];

  ws.on("message", (raw) => {
    const event = JSON.parse(raw.toString());
    eventLog.push({ type: event.type, responseId: event.response?.id, metadata: event.response?.metadata });
    for (const waiter of [...waiters]) {
      if (waiter.predicate(event)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(event);
      }
    }
  });

  ws.on("error", (error) => {
    for (const waiter of waiters.splice(0)) {
      waiter.reject(error);
    }
  });

  function waitFor(predicate, timeoutMs, label) {
    return new Promise((resolveWait, rejectWait) => {
      const timeout = setTimeout(() => {
        const recent = eventLog.slice(-12).map((event) => event.type).join(", ");
        rejectWait(new Error(`${label}_TIMEOUT recentEvents=[${recent}]`));
      }, timeoutMs);
      waiters.push({
        predicate: (event) => {
          if (event.type === "error") {
            clearTimeout(timeout);
            rejectWait(new Error(`REALTIME_ERROR ${formatErrorPayload(event)}`));
            return false;
          }
          if (!predicate(event)) return false;
          clearTimeout(timeout);
          return true;
        },
        resolve: resolveWait,
        reject: rejectWait
      });
    });
  }

  async function connect() {
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(() => rejectOpen(new Error("REALTIME_CONNECT_TIMEOUT")), RESPONSE_TIMEOUT_MS);
      ws.once("open", () => {
        clearTimeout(timeout);
        resolveOpen();
      });
      ws.once("error", (error) => {
        clearTimeout(timeout);
        rejectOpen(error);
      });
    });
    await waitFor((event) => event.type === "session.created", RESPONSE_TIMEOUT_MS, "SESSION_CREATED");
    const updated = waitFor((event) => event.type === "session.updated", RESPONSE_TIMEOUT_MS, "SESSION_UPDATED");
    ws.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "realtime",
        model: MODEL,
        output_modalities: ["text"],
        instructions: createInstructions("select"),
        reasoning: { effort: "low" },
        tool_choice: "auto",
        max_output_tokens: 240
      }
    }));
    await updated;
  }

  async function run(test) {
    const argumentsDone = waitFor(
      (event) => event.type === "response.function_call_arguments.done",
      RESPONSE_TIMEOUT_MS,
      `FUNCTION_ARGUMENTS_DONE_${test.id}`
    );
    const toolName = test.mode === "plan" ? PLAN_TOOL_NAME : SELECT_TOOL_NAME;
    ws.send(JSON.stringify({
      type: "response.create",
      response: {
        conversation: "none",
        metadata: { testId: test.id, gate: "realtime-live-semantic", mode: test.mode },
        output_modalities: ["text"],
        instructions: createInstructions(test.mode),
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: test.command }]
          }
        ],
        tools: [test.mode === "plan" ? createPlanTool() : createSelectTool()],
        tool_choice: "required",
        max_output_tokens: test.mode === "plan" ? 320 : 160
      }
    }));
    const event = await argumentsDone;
    return { type: "function_call", name: encodeToolName(toolName), arguments: event.arguments };
  }

  async function runCatalogBatch(batch, allToolNames, allModuleTypes, batchIndex) {
    const testId = `catalog_batch_${String(batchIndex).padStart(3, "0")}`;
    const argumentsDone = waitFor(
      (event) => event.type === "response.function_call_arguments.done",
      Math.max(RESPONSE_TIMEOUT_MS, 45_000),
      `FUNCTION_ARGUMENTS_DONE_${testId}`
    );
    const input = batch.map((row) => `${row.id}. ${row.command}`).join("\n");
    ws.send(JSON.stringify({
      type: "response.create",
      response: {
        conversation: "none",
        metadata: { testId, gate: "realtime-live-semantic-catalog", batchIndex: String(batchIndex) },
        output_modalities: ["text"],
        instructions: createCatalogInstructions(allToolNames),
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: input }]
          }
        ],
        tools: [createBatchTool(allToolNames, allModuleTypes)],
        tool_choice: "required",
        max_output_tokens: 4096
      }
    }));
    const event = await argumentsDone;
    return { type: "function_call", name: encodeToolName(BATCH_TOOL_NAME), arguments: event.arguments };
  }

  async function close() {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "live gate complete");
    }
  }

  return { connect, run, runCatalogBatch, close };
}

function includesAllTargets(args, expectedTargets) {
  const text = JSON.stringify(args);
  return expectedTargets.every((target) => text.includes(target));
}

function evaluateSelection(test, functionCall) {
  const functionName = decodeToolName(functionCall?.name);
  const args = parseArguments(functionCall?.arguments);
  const name = typeof args.name === "string" ? args.name : "";
  const selectedModule = typeof args.selectedModule === "string" ? args.selectedModule : "";
  const confidence = typeof args.confidence === "number" ? args.confidence : 0;
  const failures = [];

  if (functionName !== SELECT_TOOL_NAME) failures.push(`function=${functionName}`);
  if (!test.expectedNames.includes(name)) failures.push(`name=${name}`);
  if (test.expectedModule && selectedModule !== test.expectedModule) failures.push(`selectedModule=${selectedModule}`);
  if (!includesAllTargets(args, test.targetIncludes ?? [])) failures.push(`targetMissing=${(test.targetIncludes ?? []).join("/")}`);
  if (confidence < 0.5) failures.push(`confidence=${confidence}`);

  return {
    passed: failures.length === 0,
    actual: { functionName, name, selectedModule, confidence, targetHint: args.targetHint ?? "" },
    failures
  };
}

function evaluatePlan(test, functionCall) {
  const functionName = decodeToolName(functionCall?.name);
  const args = parseArguments(functionCall?.arguments);
  const steps = Array.isArray(args.steps) ? args.steps : [];
  const names = steps.map((step) => step?.name).filter(Boolean);
  const failures = [];

  if (functionName !== PLAN_TOOL_NAME) failures.push(`function=${functionName}`);
  for (const expectedName of test.expectedNames) {
    if (!names.includes(expectedName)) failures.push(`missing=${expectedName}`);
  }
  if (!includesAllTargets(args, test.targetIncludes ?? [])) failures.push(`targetMissing=${(test.targetIncludes ?? []).join("/")}`);

  return {
    passed: failures.length === 0,
    actual: {
      functionName,
      names,
      targets: steps.map((step) => step?.targetHint).filter(Boolean)
    },
    failures
  };
}

function renderReport(results) {
  const passed = results.filter((result) => result.passed).length;
  const lines = [
    "# Realtime-2 Live Semantic Gate Report",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Model: ${MODEL}`,
    "- Transport: OpenAI Realtime WebSocket",
    `- Cases: ${passed}/${results.length} passed`,
    "- Secret handling: Realtime credentials are never written to this report.",
    "",
    "| id | command | mode | expected | actual | result |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const result of results) {
    lines.push(
      `| ${result.id} | ${result.command} | ${result.mode} | ${result.expectedNames.join(", ")} | ${JSON.stringify(result.actual).replace(/\|/g, "\\|")} | ${result.passed ? "pass" : `fail: ${result.failures.join("; ")}`} |`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  if (hasFlag("--catalog")) {
    await runCatalogMode();
    return;
  }

  const access = await getRealtimeAccessToken();
  const client = createRealtimeClient(access.token, { omitSafetyIdentifier: access.source === "production-ephemeral-token" });
  const results = [];
  try {
    await client.connect();
    for (const test of tests) {
      const event = await client.run(test);
      const functionCall = findFunctionCall(event);
      const evaluation = test.mode === "plan" ? evaluatePlan(test, functionCall) : evaluateSelection(test, functionCall);
      results.push({
        id: test.id,
        command: test.command,
        mode: test.mode,
        expectedNames: test.expectedNames,
        ...evaluation
      });
      const status = evaluation.passed ? "PASS" : "FAIL";
      console.log(`${status} ${test.id} ${JSON.stringify(evaluation.actual)}`);
    }
  } finally {
    await client.close();
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, renderReport(results).replace(`- Model: ${MODEL}`, `- Model: ${MODEL}\n- Credential source: ${access.source}${access.productionSite ? ` (${access.productionSite})` : ""}`));
  const failed = results.filter((result) => !result.passed);
  console.log(`Realtime live semantic gate: ${results.length - failed.length}/${results.length} passed`);
  console.log(`Report: ${REPORT_PATH}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

async function runCatalogMode() {
  const limit = Number(getArg("--limit", "570"));
  const batchSize = Number(getArg("--batch-size", "15"));
  const idFilter = parseIdFilter(getArg("--ids", ""));
  const parseLimit = idFilter.length
    ? Math.max(limit, ...idFilter.map((id) => Number(id)).filter((id) => Number.isFinite(id)))
    : limit;
  const fullCatalogRows = parseCatalogSimulation(parseLimit);
  let catalogRows = fullCatalogRows;
  if (idFilter.length) {
    const idSet = new Set(idFilter);
    catalogRows = catalogRows.filter((row) => idSet.has(row.id));
    if (catalogRows.length !== idSet.size) {
      throw new Error(`CATALOG_ID_FILTER_MISMATCH expected=${idSet.size} actual=${catalogRows.length} ids=${idFilter.join(",")}`);
    }
  } else if (catalogRows.length !== limit) {
    throw new Error(`CATALOG_LIMIT_MISMATCH expected=${limit} actual=${catalogRows.length}`);
  }
  const allToolNames = Array.from(new Set(fullCatalogRows.flatMap((row) => row.expectedNames))).sort();
  const allModuleTypes = Array.from(new Set(["app", "assistant", "board", "widget", ...allToolNames.map(moduleForTool)])).sort();
  const access = await getRealtimeAccessToken();
  const client = createRealtimeClient(access.token, { omitSafetyIdentifier: access.source === "production-ephemeral-token" });
  const results = [];
  try {
    await client.connect();
    for (let start = 0, batchIndex = 1; start < catalogRows.length; start += batchSize, batchIndex += 1) {
      const batch = catalogRows.slice(start, start + batchSize);
      const event = await client.runCatalogBatch(batch, allToolNames, allModuleTypes, batchIndex);
      const functionCall = findFunctionCall(event);
      const functionName = decodeToolName(functionCall?.name);
      if (functionName !== BATCH_TOOL_NAME) {
        throw new Error(`CATALOG_BATCH_FUNCTION_MISMATCH batch=${batchIndex} function=${functionName}`);
      }
      const args = parseArguments(functionCall.arguments);
      const actualRows = Array.isArray(args.rows) ? args.rows : [];
      const byId = new Map(actualRows.filter((row) => row && typeof row === "object").map((row) => [normalizeCatalogId(row.id), row]));
      for (const expected of batch) {
        const actual = byId.get(expected.id);
        const evaluation = evaluateCatalogRow(expected, actual);
        results.push({ ...expected, ...evaluation });
      }
      const passed = results.filter((row) => row.passed).length;
      console.log(`BATCH ${batchIndex} ${batch[0].id}-${batch[batch.length - 1].id}: totalPassed=${passed}/${results.length}`);
    }
  } finally {
    await client.close();
  }

  mkdirSync(dirname(LIVE_CATALOG_REPORT_PATH), { recursive: true });
  const reportPath = idFilter.length
    ? resolve(ROOT, "docs/realtime-live-semantic-catalog-selected-report.md")
    : (limit === 570 ? LIVE_CATALOG_REPORT_PATH : resolve(ROOT, `docs/realtime-live-semantic-catalog-${limit}-report.md`));
  writeFileSync(
    reportPath,
    renderCatalogReport(results, {
      limit,
      caseLabel: idFilter.length ? `${results.length} Selected` : String(limit),
      credentialSource: access.source,
      productionSite: access.productionSite,
      batchSize
    })
  );
  const failed = results.filter((row) => !row.passed);
  console.log(`Realtime live semantic catalog: ${results.length - failed.length}/${results.length} passed`);
  console.log(`Report: ${reportPath}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
