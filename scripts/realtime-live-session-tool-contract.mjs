import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const REPORT_PATH = resolve(ROOT, "docs/realtime-live-session-tool-contract-report.md");
const DRY_RUN_REPORT_PATH = resolve(ROOT, "docs/realtime-live-session-tool-contract-dry-run-report.md");
const TOOL_EXPOSURE_REPORT_PATH = resolve(ROOT, "docs/realtime-tool-exposure-700-report.md");
const MODEL = process.env.XIAOZHUOBAN_REALTIME_LIVE_MODEL || "gpt-realtime-2";
const RESPONSE_TIMEOUT_MS = Number(process.env.XIAOZHUOBAN_REALTIME_LIVE_TIMEOUT_MS || 20_000);
const SELECT_TOOL_NAME = "assistant.select_tool";

const DEFAULT_CASES = [
  {
    id: "recent_countdown_5m",
    command: "倒计时5分钟",
    selectedModules: ["countdown"],
    exposedTools: ["countdown.set", "countdown.pause", "countdown.reset", "countdown.resume", "board.add_widget"],
    expectedTools: ["countdown.set"]
  },
  {
    id: "recent_music_wangfei",
    command: "我想听王菲的歌",
    selectedModules: ["music"],
    exposedTools: ["music.play", "music.search", "music.next", "music.pause", "music.previous", "music.resume", "board.add_widget", "widget.focus"],
    expectedTools: ["music.play", "music.search"]
  },
  {
    id: "recent_tv_bbc",
    command: "我想看BBC",
    selectedModules: ["tv"],
    exposedTools: ["tv.play", "tv.select_channel", "tv.fullscreen", "tv.pause", "board.add_widget", "widget.focus"],
    expectedTools: ["tv.play", "tv.select_channel"]
  },
  {
    id: "recent_close_message_board",
    command: "关闭留言板",
    selectedModules: ["messageBoard"],
    exposedTools: ["widget.remove", "messageBoard.send", "messageBoard.clear_draft"],
    expectedTools: ["widget.remove"]
  },
  {
    id: "recent_weather_shanghai",
    command: "上海天气",
    selectedModules: ["weather"],
    exposedTools: ["weather.set_city", "board.add_widget", "widget.focus"],
    expectedTools: ["weather.set_city"]
  }
];

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
  "music.search": "Search music by artist, song, mood, style, or playlist.",
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

function encodeToolName(name) {
  return name.replace(/\./g, "__dot__");
}

function decodeToolName(name) {
  return String(name).replace(/__dot__/g, ".");
}

function moduleForTool(toolName) {
  if (toolName.startsWith("app.")) return "app";
  if (toolName.startsWith("board.")) return "board";
  if (toolName.startsWith("widget.")) return "widget";
  if (toolName.startsWith("assistant.")) return "assistant";
  return toolName.split(".")[0] || "unknown";
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
  return { type: "string", enum: [...new Set(values)].sort() };
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

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseToolExposureReport() {
  const text = readFileSync(TOOL_EXPOSURE_REPORT_PATH, "utf8");
  const rows = [];
  const regex =
    /^(\d{3})\. \[pass\]; selected=([^;]*); expected=([^;]*); exposed=([^;]*); missing=none; command=(.+)$/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    rows.push({
      id: match[1],
      command: match[5],
      selectedModules: parseList(match[2]).filter((item) => item !== "none"),
      expectedTools: parseList(match[3]),
      exposedTools: parseList(match[4]).filter((item) => item !== "NONE")
    });
  }
  return rows;
}

function selectCases() {
  const idFilter = parseList(getArg("--ids", ""));
  if (!idFilter.length) return DEFAULT_CASES;
  const rows = parseToolExposureReport();
  const selected = rows.filter((row) => idFilter.includes(row.id));
  if (selected.length !== idFilter.length) {
    throw new Error(`ID_FILTER_MISMATCH expected=${idFilter.length} actual=${selected.length}`);
  }
  return selected;
}

function createSelectorTool(allTools, moduleTypes) {
  return {
    type: "function",
    name: encodeToolName(SELECT_TOOL_NAME),
    description: "Select one registered Xiaozhuoban tool and module for the spoken command. Do not execute.",
    parameters: objectSchema(
      {
        name: stringEnum(allTools),
        selectedModule: stringEnum(moduleTypes),
        targetHint: { type: "string" },
        userCommand: { type: "string" },
        confidence: { type: "number" }
      },
      ["name", "selectedModule", "targetHint", "confidence"]
    )
  };
}

function createExecutableTool(name) {
  const description = toolDescriptions[name] || `${name} tool.`;
  return {
    type: "function",
    name: encodeToolName(name),
    description,
    parameters: objectSchema(
      {
        widgetId: { type: "string" },
        definitionId: { type: "string" },
        targetHint: { type: "string" },
        targetText: { type: "string" },
        query: { type: "string" },
        city: { type: "string" },
        channelName: { type: "string" },
        totalSeconds: { type: "number" },
        start: { type: "boolean" }
      },
      []
    )
  };
}

function createSelectorInstructions(allTools) {
  const catalog = allTools.map((name) => `- ${name}: ${toolDescriptions[name] || `${name} tool.`}`).join("\n");
  return [
    "# Role and Objective",
    "你是小桌板 Realtime voice session 的第一阶段工具选择器。",
    "必须根据用户命令调用 assistant.select_tool，选择一个最合适的已注册工具和模块。",
    "",
    "# Available Registered Tools",
    catalog,
    "",
    "# Rules",
    "- 不要执行真实工具，不要生成 widgetId、definitionId 或完整参数。",
    "- 只把用户说出的目标词复制到 targetHint。",
    "- 打开窗口优先 board.add_widget；播放、搜索、切频道、天气、倒计时等内容请求选择对应内容工具。",
    "- 如果用户要求控制小桌板，不要直接回答没有工具。"
  ].join("\n");
}

function createScopedInstructions(test, selectionName) {
  return [
    "# Role and Objective",
    "你是小桌板 Realtime voice session 的第二阶段工具调用器。",
    "只能调用本次 scoped session.update 中提供的工具，不能调用未提供工具。",
    "",
    "# Scoped Contract",
    `userCommand=${test.command}`,
    `selectedTool=${selectionName}`,
    `selectedModules=${test.selectedModules.join(",") || "unknown"}`,
    `exposedTools=${test.exposedTools.join(",")}`,
    "",
    "# Rules",
    "- 必须调用一个最能满足用户命令的 scoped function tool。",
    "- 如果需要先打开小工具并且 board.add_widget 已暴露，可以调用 board.add_widget。",
    "- 不要回答没有工具。"
  ].join("\n");
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

function redactApiKey(value) {
  return typeof value === "string" && value.startsWith("sk-") ? "[redacted-openai-key]" : value;
}

function formatErrorPayload(event) {
  const error = event?.error && typeof event.error === "object" ? event.error : event;
  return JSON.stringify(error, (key, value) => (key.toLowerCase().includes("key") ? redactApiKey(value) : value));
}

class RealtimeWsClient {
  constructor(apiKey) {
    const safetyIdentifier = `xz_session_contract_${createHash("sha256").update("xiaozhuoban-session-contract").digest("base64url")}`;
    this.ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier
      }
    });
    this.eventLog = [];
    this.waiters = [];
    this.ws.on("message", (raw) => {
      const event = JSON.parse(raw.toString());
      this.eventLog.push({ type: event.type, metadata: event.response?.metadata });
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(event)) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(event);
        }
      }
    });
    this.ws.on("error", (error) => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    });
  }

  waitFor(predicate, label) {
    return new Promise((resolveWait, rejectWait) => {
      const timeout = setTimeout(() => {
        const recent = this.eventLog.slice(-16).map((event) => event.type).join(", ");
        rejectWait(new Error(`${label}_TIMEOUT recentEvents=[${recent}]`));
      }, RESPONSE_TIMEOUT_MS);
      this.waiters.push({
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

  async connect() {
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(() => rejectOpen(new Error("REALTIME_CONNECT_TIMEOUT")), RESPONSE_TIMEOUT_MS);
      this.ws.once("open", () => {
        clearTimeout(timeout);
        resolveOpen();
      });
      this.ws.once("error", (error) => {
        clearTimeout(timeout);
        rejectOpen(error);
      });
    });
    await this.waitFor((event) => event.type === "session.created", "SESSION_CREATED");
  }

  async updateSession(session, label) {
    const updated = this.waitFor((event) => event.type === "session.updated", label);
    this.ws.send(JSON.stringify({ type: "session.update", session }));
    await updated;
  }

  async responseCreate(input, tools, instructions, testId) {
    const done = this.waitFor(
      (event) => event.type === "response.function_call_arguments.done",
      `FUNCTION_ARGUMENTS_DONE_${testId}`
    );
    this.ws.send(
      JSON.stringify({
        type: "response.create",
        response: {
          conversation: "none",
          metadata: { testId, gate: "realtime-live-session-tool-contract" },
          output_modalities: ["text"],
          instructions,
          input: [{ type: "message", role: "user", content: [{ type: "input_text", text: input }] }],
          tools,
          tool_choice: "required",
          max_output_tokens: 320
        }
      })
    );
    const event = await done;
    return {
      type: "function_call",
      name: event.name,
      arguments: event.arguments,
      call_id: event.call_id,
      item_id: event.item_id
    };
  }

  close() {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close(1000, "session contract complete");
  }
}

function evaluateSelection(test, functionCall) {
  const name = decodeToolName(functionCall?.name);
  const args = parseArguments(functionCall?.arguments);
  const selectedTool = typeof args.name === "string" ? args.name : "";
  const confidence = typeof args.confidence === "number" ? args.confidence : 0;
  const failures = [];
  if (name !== SELECT_TOOL_NAME) failures.push(`selector_function=${name}`);
  if (!test.exposedTools.includes(selectedTool)) failures.push(`selected_not_exposed=${selectedTool}`);
  if (!test.expectedTools.includes(selectedTool) && selectedTool !== "board.add_widget") {
    failures.push(`selected_not_expected=${selectedTool}`);
  }
  if (confidence < 0.5) failures.push(`low_confidence=${confidence}`);
  return {
    passed: failures.length === 0,
    failures,
    actual: {
      selectedTool,
      selectedModule: args.selectedModule || "",
      targetHint: args.targetHint || "",
      confidence
    }
  };
}

function evaluateScopedCall(test, functionCall) {
  const toolName = decodeToolName(functionCall?.name);
  const failures = [];
  if (!test.exposedTools.includes(toolName)) failures.push(`function_not_exposed=${toolName}`);
  if (!test.expectedTools.includes(toolName) && toolName !== "board.add_widget") {
    failures.push(`function_not_expected=${toolName}`);
  }
  return {
    passed: failures.length === 0,
    failures,
    actual: { toolName, arguments: parseArguments(functionCall?.arguments) }
  };
}

async function runCase(client, test, allTools, moduleTypes) {
  await client.updateSession(
    {
      type: "realtime",
      model: MODEL,
      output_modalities: ["text"],
      instructions: createSelectorInstructions(allTools),
      reasoning: { effort: "low" },
      tools: [createSelectorTool(allTools, moduleTypes)],
      tool_choice: "required",
      parallel_tool_calls: false
    },
    `SELECTOR_SESSION_UPDATED_${test.id}`
  );

  const selectionEvent = await client.responseCreate(
    test.command,
    [createSelectorTool(allTools, moduleTypes)],
    createSelectorInstructions(allTools),
    `${test.id}_select`
  );
  const selectionCall = findFunctionCall(selectionEvent);
  const selection = evaluateSelection(test, selectionCall);
  if (!selection.passed) {
    return { id: test.id, command: test.command, selection, scoped: null, passed: false };
  }

  await client.updateSession(
    {
      type: "realtime",
      model: MODEL,
      output_modalities: ["text"],
      instructions: createScopedInstructions(test, selection.actual.selectedTool),
      reasoning: { effort: "low" },
      tools: test.exposedTools.map(createExecutableTool),
      tool_choice: "required",
      parallel_tool_calls: false
    },
    `SCOPED_SESSION_UPDATED_${test.id}`
  );

  const scopedEvent = await client.responseCreate(
    test.command,
    test.exposedTools.map(createExecutableTool),
    createScopedInstructions(test, selection.actual.selectedTool),
    `${test.id}_scoped`
  );
  const scopedCall = findFunctionCall(scopedEvent);
  const scoped = evaluateScopedCall(test, scopedCall);
  return { id: test.id, command: test.command, selection, scoped, passed: scoped.passed };
}

function renderReport(results, mode) {
  const passed = results.filter((result) => result.passed).length;
  const lines = [
    "# Realtime Live Session Tool Contract Report",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Model: ${MODEL}`,
    `- Mode: ${mode}`,
    `- Cases: ${passed}/${results.length} passed`,
    "- Secret handling: Realtime credentials are never written to this report.",
    "",
    "| id | command | selected | scoped_call | result |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const result of results) {
    const selected = result.selection ? JSON.stringify(result.selection.actual).replace(/\|/g, "\\|") : "none";
    const scoped = result.scoped ? JSON.stringify(result.scoped.actual).replace(/\|/g, "\\|") : "none";
    const failures = [...(result.selection?.failures ?? []), ...(result.scoped?.failures ?? [])];
    lines.push(
      `| ${result.id} | ${result.command} | ${selected} | ${scoped} | ${result.passed ? "pass" : `fail: ${failures.join("; ")}`} |`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const cases = selectCases();
  const allTools = Array.from(new Set(cases.flatMap((test) => [...test.exposedTools, ...test.expectedTools]))).sort();
  const moduleTypes = Array.from(new Set(["app", "assistant", "board", "widget", ...allTools.map(moduleForTool), ...cases.flatMap((test) => test.selectedModules)])).sort();

  if (hasFlag("--dry-run")) {
    const dryResults = cases.map((test) => ({
      id: test.id,
      command: test.command,
      selection: { actual: { selectedTool: "(dry-run)", selectedModule: test.selectedModules[0] || "", targetHint: "", confidence: 1 }, failures: [] },
      scoped: { actual: { toolName: "(dry-run)", arguments: {} }, failures: [] },
      passed: true
    }));
    writeFileSync(DRY_RUN_REPORT_PATH, renderReport(dryResults, "dry-run"), "utf8");
    console.log(`Realtime live session tool contract dry run: ${dryResults.length}/${dryResults.length} prepared`);
    console.log(`Report: ${DRY_RUN_REPORT_PATH}`);
    return;
  }

  const client = new RealtimeWsClient(getApiKey());
  const results = [];
  try {
    await client.connect();
    for (const test of cases) {
      results.push(await runCase(client, test, allTools, moduleTypes));
    }
  } finally {
    client.close();
  }
  writeFileSync(REPORT_PATH, renderReport(results, "live"), "utf8");
  const failed = results.filter((result) => !result.passed);
  console.log(`Realtime live session tool contract: ${results.length - failed.length}/${results.length} passed`);
  console.log(`Report: ${REPORT_PATH}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
