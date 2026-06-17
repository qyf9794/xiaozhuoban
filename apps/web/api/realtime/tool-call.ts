import type { IncomingMessage, ServerResponse } from "node:http";
import { XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL } from "../../src/assistant/realtimeSessionConfig";
import { authenticateRealtimeRequest } from "./auth";

type AssistantToolSpecLike = {
  name: string;
  description?: string;
  scope?: string;
  risk?: string;
  widgetType?: string;
  requiresTarget?: boolean;
};

type CompactWidget = {
  widgetId: string;
  definitionId: string;
  type: string;
  name: string;
  order: number;
  summary?: string;
  focused?: boolean;
  recent?: boolean;
};

type CompactDefinition = {
  definitionId: string;
  type: string;
  name: string;
};

type CompactContext = {
  boardId?: string;
  boardName?: string;
  availableBoards?: Array<{ boardId: string; name: string; active?: boolean }>;
  focusedWidget?: CompactWidget;
  pendingConfirmation?: unknown;
  widgetCountsByType: Record<string, number>;
  availableDefinitions?: CompactDefinition[];
  widgets: CompactWidget[];
};

type RealtimeModuleCatalogItem = {
  type: string;
  displayName: string;
  aliases: string[];
  capabilities: string[];
  shortcutExamples: string[];
  riskSummary: string[];
};

type RealtimeScopedModuleContext = {
  moduleType: string;
  instances: CompactWidget[];
  stateSummary: Record<string, unknown>;
  shortcutExamples: string[];
  executionPolicy: Record<string, unknown>;
  riskPolicy: Record<string, unknown>;
};

type TextToolCallRequest = {
  input: string;
  context?: CompactContext;
  tools: AssistantToolSpecLike[];
  moduleCatalog?: RealtimeModuleCatalogItem[];
  moduleContext?: RealtimeScopedModuleContext;
  phase: "select" | "execute" | "auto";
  selection?: TextToolSelection;
};

type TextToolSelection = {
  name: string;
  selectedModule?: string;
  targetHint?: string;
  confidence?: number;
};

type JsonBody = Record<string, unknown>;

const SELECT_TOOL_NAME = "assistant.select_tool";

const widgetAliases: Record<string, string[]> = {
  note: ["便签", "笔记"],
  todo: ["待办", "任务", "清单"],
  tv: ["电视", "直播"],
  music: ["音乐", "歌曲", "歌", "播放器"],
  worldClock: ["世界时钟", "时区"],
  dialClock: ["时钟", "表盘"],
  translate: ["翻译"],
  converter: ["换算", "单位"],
  clipboard: ["剪贴板"],
  recorder: ["录音"],
  messageBoard: ["留言板", "留言"],
  weather: ["天气"],
  countdown: ["倒计时", "计时器"],
  headline: ["新闻", "头条"],
  market: ["行情", "股票", "指数"],
  calculator: ["计算器"]
};

function sendJson(response: ServerResponse, statusCode: number, body: JsonBody) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRequestBody(value: unknown): TextToolCallRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.input !== "string" || !Array.isArray(value.tools)) return null;
  const phase =
    value.phase === "select" || value.phase === "execute" || value.phase === "auto" ? value.phase : "auto";
  const context = isRecord(value.context) ? value.context : undefined;
  if (phase !== "select" && !context) return null;
  if (context && (!Array.isArray(context.widgets) || !isRecord(context.widgetCountsByType))) return null;
  const selection = isRecord(value.selection) && typeof value.selection.name === "string"
    ? {
        name: value.selection.name,
        selectedModule: typeof value.selection.selectedModule === "string" ? value.selection.selectedModule : undefined,
        targetHint: typeof value.selection.targetHint === "string" ? value.selection.targetHint : undefined,
        confidence: typeof value.selection.confidence === "number" ? value.selection.confidence : undefined
      }
    : undefined;
  const moduleCatalog = Array.isArray(value.moduleCatalog)
    ? (value.moduleCatalog.filter(isRecord).filter((item) => typeof item.type === "string") as RealtimeModuleCatalogItem[])
    : undefined;
  const moduleContext =
    isRecord(value.moduleContext) && typeof value.moduleContext.moduleType === "string"
      ? (value.moduleContext as RealtimeScopedModuleContext)
      : undefined;
  return {
    input: value.input,
    context: context as CompactContext | undefined,
    tools: value.tools.filter(isRecord).filter((tool) => typeof tool.name === "string") as AssistantToolSpecLike[],
    moduleCatalog,
    moduleContext,
    phase,
    selection
  };
}

function encodeToolName(name: string) {
  return name.replace(/\./g, "__dot__");
}

function decodeToolName(name: string) {
  return name.replace(/__dot__/g, ".");
}

function objectSchema(properties: Record<string, unknown>, required?: string[], additionalProperties = false) {
  return {
    type: "object",
    properties,
    ...(required?.length ? { required } : {}),
    additionalProperties
  };
}

function stringSchema() {
  return { type: "string" };
}

function numberSchema() {
  return { type: "number" };
}

function booleanSchema() {
  return { type: "boolean" };
}

function inferToolParameters(tool: AssistantToolSpecLike) {
  switch (tool.name) {
    case "board.add_widget":
      return objectSchema(
        {
          definitionId: stringSchema(),
          mobileMode: booleanSchema(),
          followUp: objectSchema({ name: stringSchema(), arguments: objectSchema({}, undefined, true) }, ["name"])
        },
        ["definitionId"]
      );
    case "widget.focus":
    case "widget.fullscreen_focus":
    case "widget.remove":
    case "widget.bring_to_front":
      return objectSchema({ widgetId: stringSchema() }, ["widgetId"]);
    case "widget.move":
      return objectSchema({ widgetId: stringSchema(), x: numberSchema(), y: numberSchema() }, ["widgetId", "x", "y"]);
    case "widget.resize":
      return objectSchema({ widgetId: stringSchema(), w: numberSchema(), h: numberSchema() }, ["widgetId", "w", "h"]);
    case "board.switch":
      return objectSchema({ boardId: stringSchema() }, ["boardId"]);
    case "board.rename":
      return objectSchema({ boardId: stringSchema(), name: stringSchema() }, ["boardId", "name"]);
    case "board.create":
      return objectSchema({ name: stringSchema() });
    default:
      return tool.requiresTarget
        ? objectSchema({ widgetId: stringSchema() }, ["widgetId"], true)
        : objectSchema({}, undefined, true);
  }
}

function serializeTool(tool: AssistantToolSpecLike) {
  return {
    type: "function",
    name: encodeToolName(tool.name),
    description: tool.description || tool.name,
    parameters: inferToolParameters(tool)
  };
}

function toolCatalog(tools: AssistantToolSpecLike[]) {
  return tools
    .map((tool) =>
      [
        `- ${tool.name}`,
        `description=${tool.description || tool.name}`,
        tool.scope ? `scope=${tool.scope}` : "",
        tool.widgetType ? `widgetType=${tool.widgetType}` : "",
        tool.risk ? `risk=${tool.risk}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");
}

function moduleCatalogText(moduleCatalog: RealtimeModuleCatalogItem[] | undefined) {
  return (moduleCatalog ?? [])
    .map((module) =>
      [
        `- ${module.type}`,
        `displayName=${module.displayName}`,
        `aliases=${module.aliases?.join("/") ?? ""}`,
        `capabilities=${module.capabilities?.join("/") ?? ""}`,
        module.riskSummary?.length ? `risk=${module.riskSummary.join("/")}` : "",
        module.shortcutExamples?.length ? `examples=${module.shortcutExamples.join("/")}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");
}

function createToolSelectionPayload(request: TextToolCallRequest, model: string) {
  return {
    model,
    input: [
      {
        role: "user",
        content: [
          "你是小桌板命令路由器。先只判断用户想使用哪个模块和已注册工具，不要生成工具参数。",
          "你只能基于模块目录、工具目录和用户命令选择；此阶段不会提供桌面上下文。",
          "如果用户说“打开 + 小工具名”，优先添加或聚焦这个小工具。",
          "如果用户说“关闭/关掉 + 小工具名”，优先调用 widget.remove 关闭这个小工具窗口。",
          "如果用户说“暂停/继续/播放/下一首”等播放控制，优先调用对应媒体工具。",
          "没有足够把握时不要调用工具。",
          "",
          "# 模块目录",
          moduleCatalogText(request.moduleCatalog) || "- 未提供模块目录",
          "",
          "# 工具目录",
          toolCatalog(request.tools),
          "",
          `用户命令：${request.input}`
        ].join("\n")
      }
    ],
    tools: [
      {
        type: "function",
        name: encodeToolName(SELECT_TOOL_NAME),
        description: "Select the single best registered Xiaozhuoban tool for the user's command.",
        parameters: objectSchema(
          {
            name: { type: "string", description: "Selected registered tool name." },
            selectedModule: { type: "string", description: "Selected Xiaozhuoban module type when known." },
            targetHint: { type: "string", description: "Short widget or board target words from the user command." },
            confidence: { type: "number" }
          },
          ["name"]
        )
      }
    ],
    tool_choice: "required",
    parallel_tool_calls: false,
    max_output_tokens: 80
  };
}

function inputMentionsWidgetType(input: string, type: string) {
  return (widgetAliases[type] ?? []).some((alias) => input.includes(alias));
}

function targetHintMentionsWidget(targetHint: string | undefined, widget: CompactWidget) {
  const hint = targetHint ?? "";
  return Boolean(hint) && (hint.includes(widget.name) || hint.includes(widget.type) || inputMentionsWidgetType(hint, widget.type));
}

function createScopedContext(context: CompactContext, tool: AssistantToolSpecLike, selection: TextToolSelection, input: string): CompactContext {
  const selectedWidgetType = tool.widgetType || Object.keys(widgetAliases).find((type) => inputMentionsWidgetType(input, type));
  const includeBoards = tool.name.startsWith("board.") || tool.name === "assistant.confirm" || tool.name === "assistant.cancel";
  const includeDefinitions = tool.name === "board.add_widget";
  const needsWidgetContext = Boolean(tool.requiresTarget || tool.name.startsWith("widget."));
  const widgets = needsWidgetContext
    ? context.widgets.filter(
        (widget) =>
          widget.type === selectedWidgetType ||
          (!selectedWidgetType && widget.focused) ||
          targetHintMentionsWidget(selection.targetHint, widget)
      )
    : [];

  return {
    boardId: context.boardId,
    boardName: context.boardName,
    pendingConfirmation: context.pendingConfirmation,
    availableBoards: includeBoards ? context.availableBoards : undefined,
    focusedWidget:
      context.focusedWidget && needsWidgetContext && (!selectedWidgetType || context.focusedWidget.type === selectedWidgetType)
        ? context.focusedWidget
        : undefined,
    widgetCountsByType: context.widgetCountsByType,
    availableDefinitions: includeDefinitions
      ? context.availableDefinitions?.filter(
          (definition) =>
            definition.type === selectedWidgetType ||
            inputMentionsWidgetType(input, definition.type) ||
            selection.targetHint?.includes(definition.name)
        )
      : undefined,
    widgets
  };
}

function formatList(items: string[], fallback: string) {
  return items.length > 0 ? items.join("\n") : fallback;
}

function createContextInstructions(context: CompactContext) {
  const focused = context.focusedWidget
    ? `${context.focusedWidget.name}(${context.focusedWidget.type}, widgetId=${context.focusedWidget.widgetId})`
    : "无";
  const widgets = formatList(
    context.widgets.map((widget) => {
      const flags = [widget.focused ? "focused" : "", widget.recent ? "recent" : ""].filter(Boolean).join(",");
      return `- ${widget.name}(${widget.type}) widgetId=${widget.widgetId} definitionId=${widget.definitionId} summary=${widget.summary ?? ""}${flags ? ` flags=${flags}` : ""}`;
    }),
    "- 未提供相关已加载小工具"
  );
  const definitions = formatList(
    (context.availableDefinitions ?? []).map(
      (definition) => `- ${definition.name}(${definition.type}) definitionId=${definition.definitionId}`
    ),
    "- 未提供相关可添加组件定义"
  );
  return [
    "你是小桌板里的语音助手，负责控制小桌板 Web 桌面、已加载小工具和已注册工具。",
    "只使用当前提供的最小上下文，不要假设未提供的桌面状态。",
    `- board: ${context.boardName ?? context.boardId ?? "当前桌板"}`,
    `- focusedWidget: ${focused}`,
    `- pendingConfirmation: ${context.pendingConfirmation ? "有" : "无"}`,
    "- loadedWidgets:",
    widgets,
    "- availableDefinitions:",
    definitions
  ].join("\n");
}

function createScopedToolCallPayload(request: TextToolCallRequest, selection: TextToolSelection, model: string) {
  const tool = request.tools.find((candidate) => candidate.name === selection.name);
  if (!tool || !request.context) {
    return {
      model,
      input: [
        {
          role: "user",
          content: [
            "# Text Command Fallback",
            "缺少已选工具或局部上下文，因此不能生成可执行工具调用。",
            `已选工具：${selection.name}`,
            `用户命令：${request.input}`
          ].join("\n")
        }
      ],
      tools: [],
      tool_choice: "none",
      parallel_tool_calls: false,
      max_output_tokens: 80
    };
  }
  const scopedContext = createScopedContext(request.context, tool, selection, request.input);
  return {
    model,
    input: [
      {
        role: "user",
        content: [
          createContextInstructions(scopedContext),
          request.moduleContext
            ? [
                "",
                "# Selected Module Scoped Context",
                JSON.stringify({
                  moduleType: request.moduleContext.moduleType,
                  instances: request.moduleContext.instances,
                  stateSummary: request.moduleContext.stateSummary,
                  shortcutExamples: request.moduleContext.shortcutExamples,
                  executionPolicy: request.moduleContext.executionPolicy,
                  riskPolicy: request.moduleContext.riskPolicy
                })
              ].join("\n")
            : "",
          "",
          "# Text Command Fallback",
          "现在只根据上一步选中的工具和最小必要上下文，返回可执行工具调用。",
          "不要访问未提供的桌面上下文；如果缺少目标或信息不足，不要调用工具。",
          "",
          `已选工具：${selection.name}`,
          selection.targetHint ? `目标提示：${selection.targetHint}` : "",
          `用户命令：${request.input}`
        ]
          .filter(Boolean)
          .join("\n")
      }
    ],
    tools: tool ? [serializeTool(tool)] : [],
    tool_choice: tool ? "auto" : "none",
    parallel_tool_calls: false,
    max_output_tokens: 120
  };
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (isRecord(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function findFunctionCall(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (value.type === "function_call" && typeof value.name === "string") return value;
  for (const key of ["output", "items", "content"]) {
    const items = value[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const found = findFunctionCall(item);
      if (found) return found;
    }
  }
  return null;
}

function extractSelection(payload: unknown, allowedToolNames: Set<string>): TextToolSelection | null {
  const functionCall = findFunctionCall(payload);
  if (!functionCall || decodeToolName(String(functionCall.name)) !== SELECT_TOOL_NAME) return null;
  const args = parseArguments(functionCall.arguments);
  const name = typeof args.name === "string" ? args.name : "";
  if (!allowedToolNames.has(name)) return null;
  return {
    name,
    selectedModule: typeof args.selectedModule === "string" ? args.selectedModule : undefined,
    targetHint: typeof args.targetHint === "string" ? args.targetHint : undefined,
    confidence: typeof args.confidence === "number" ? args.confidence : undefined
  };
}

function extractToolCall(payload: unknown, allowedToolNames: Set<string>) {
  const functionCall = findFunctionCall(payload);
  if (!functionCall || typeof functionCall.name !== "string") return null;
  const name = decodeToolName(functionCall.name);
  if (!allowedToolNames.has(name)) return null;
  return {
    id:
      typeof functionCall.call_id === "string"
        ? functionCall.call_id
        : typeof functionCall.id === "string"
          ? functionCall.id
          : `model_${Date.now()}`,
    name,
    arguments: parseArguments(functionCall.arguments),
    source: "text"
  };
}

async function requestOpenAI(apiKey: string, payload: unknown, timeoutMs = 6_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const auth = await authenticateRealtimeRequest(request);
    if (!auth.ok) {
      sendJson(response, auth.status, { error: auth.error });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      sendJson(response, 503, { error: "OPENAI_API_KEY_MISSING" });
      return;
    }

    let body: TextToolCallRequest | null;
    try {
      body = parseRequestBody(await readJson(request));
    } catch {
      sendJson(response, 400, { error: "INVALID_JSON" });
      return;
    }
    if (!body) {
      sendJson(response, 400, { error: "INVALID_REQUEST" });
      return;
    }

    const allowedToolNames = new Set(body.tools.map((tool) => tool.name));
    const model = process.env.XIAOZHUOBAN_TEXT_TOOL_MODEL || XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL;
    let selection: TextToolSelection | null = body.selection && allowedToolNames.has(body.selection.name) ? body.selection : null;

    if (body.phase === "execute" && !selection) {
      sendJson(response, 200, { call: null, selection: null, error: "TEXT_TOOL_SELECTION_MISSING" });
      return;
    }
    if (body.phase === "execute" && !body.context) {
      sendJson(response, 200, { call: null, selection, error: "TEXT_TOOL_CONTEXT_MISSING" });
      return;
    }

    if (!selection) {
      const selectionResponse = await requestOpenAI(apiKey, createToolSelectionPayload(body, model));
      if (!selectionResponse.ok) {
        let upstream: unknown = null;
        try {
          upstream = await selectionResponse.json();
        } catch {
          // Keep the structured status without leaking raw text.
        }
        sendJson(response, 200, {
          call: null,
          selection: null,
          error: "TEXT_TOOL_SELECTION_FAILED",
          model,
          status: selectionResponse.status,
          upstream
        });
        return;
      }

      selection = extractSelection(await selectionResponse.json(), allowedToolNames);
    }
    if (!selection) {
      sendJson(response, 200, { call: null, selection: null });
      return;
    }
    if (body.phase === "select") {
      sendJson(response, 200, { call: null, selection });
      return;
    }
    if (!body.context) {
      sendJson(response, 200, { call: null, selection, error: "TEXT_TOOL_CONTEXT_MISSING" });
      return;
    }

    const toolCallResponse = await requestOpenAI(apiKey, createScopedToolCallPayload(body, selection, model));
    if (!toolCallResponse.ok) {
      let upstream: unknown = null;
      try {
        upstream = await toolCallResponse.json();
      } catch {
        // Keep the structured status without leaking raw text.
      }
      sendJson(response, 200, {
        call: null,
        selection,
        error: "TEXT_TOOL_CALL_FAILED",
        model,
        status: toolCallResponse.status,
        upstream
      });
      return;
    }

    sendJson(response, 200, {
      selection,
      call: extractToolCall(await toolCallResponse.json(), allowedToolNames)
    });
  } catch (error) {
    sendJson(response, 200, {
      call: null,
      selection: null,
      error: "TEXT_TOOL_CALL_UNHANDLED",
      message: error instanceof Error ? error.message : "Unknown realtime text tool-call error"
    });
  }
}
