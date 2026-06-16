import {
  type AssistantToolCall,
  type AssistantToolSpec,
  type CompactAssistantContext
} from "@xiaozhuoban/assistant-core";
import {
  XIAOZHUOBAN_REALTIME_MODEL,
  createRealtimeContextInstructions,
  decodeRealtimeToolName,
  serializeAssistantToolForRealtime,
  type RealtimeFunctionTool
} from "./realtimeSessionConfig";

export type RealtimeTextToolCallRequest = {
  input: string;
  context?: CompactAssistantContext;
  tools: AssistantToolSpec[];
  phase?: "select" | "execute" | "auto";
  selection?: RealtimeTextToolSelection;
};

export type RealtimeTextToolCallResponse = {
  call: AssistantToolCall | null;
  selection?: RealtimeTextToolSelection | null;
};

export type RealtimeTextToolSelection = {
  name: string;
  targetHint?: string;
  confidence?: number;
};

const SELECT_TOOL_NAME = "assistant.select_tool";

export const REALTIME_TOOL_SELECTION_TOOL_NAME = SELECT_TOOL_NAME;

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

export function createRealtimeTextToolCallRequestBody(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  selection?: RealtimeTextToolSelection
) {
  return JSON.stringify({ input, context, tools, selection, phase: "auto" } satisfies RealtimeTextToolCallRequest);
}

export function createRealtimeToolSelectionRequestBody(input: string, tools: AssistantToolSpec[]) {
  return JSON.stringify({ input, tools, phase: "select" } satisfies RealtimeTextToolCallRequest);
}

export function createRealtimeScopedToolCallRequestBody(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  selection: RealtimeTextToolSelection
) {
  return JSON.stringify({ input, context, tools, selection, phase: "execute" } satisfies RealtimeTextToolCallRequest);
}

function toolCatalog(tools: AssistantToolSpec[]) {
  return tools
    .map((tool) =>
      [
        `- ${tool.name}`,
        `description=${tool.description}`,
        `scope=${tool.scope}`,
        tool.widgetType ? `widgetType=${tool.widgetType}` : "",
        tool.risk ? `risk=${tool.risk}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");
}

export function createRealtimeToolSelectionPrompt(input: string, tools: AssistantToolSpec[]) {
  return [
    "你是小桌板命令路由器。先只判断用户想使用哪个已注册工具，不要生成工具参数。",
    "你只能基于工具目录和用户命令选择工具；此阶段不会提供桌面上下文。",
    "如果用户说“打开 + 小工具名”，优先添加或聚焦这个小工具。",
    "如果用户说“关闭/关掉 + 小工具名”，优先调用 widget.remove 关闭这个小工具窗口。",
    "如果用户说“暂停/继续/播放/下一首”等播放控制，优先调用对应媒体工具。",
    "没有足够把握时不要调用工具。",
    "",
    "# 工具目录",
    toolCatalog(tools),
    "",
    `用户命令：${input}`
  ].join("\n");
}

export function createRealtimeToolSelectionInstructions(tools: AssistantToolSpec[]) {
  return [
    "你是小桌板命令路由器。当前阶段只判断用户想使用哪个已注册工具。",
    "不要生成任何真实工具参数，不要猜 widgetId、definitionId、boardId。",
    "不要要求完整桌面上下文；如果需要目标，只把用户说出的目标词放到 targetHint。",
    "用户要控制桌面时，先调用 assistant.select_tool；前端随后会按所选工具提供最小必要上下文。",
    "如果用户说“打开 + 小工具名”，优先选择 board.add_widget 或 widget.focus。",
    "如果用户说“关闭/关掉 + 小工具名”，优先选择 widget.remove 关闭这个小工具窗口。",
    "如果用户说“暂停/继续/播放/下一首”等播放控制，优先选择对应媒体工具。",
    "",
    "# 工具目录",
    toolCatalog(tools)
  ].join("\n");
}

export function createRealtimeToolSelectionTool(tools: AssistantToolSpec[]): RealtimeFunctionTool {
  return {
    type: "function",
    name: SELECT_TOOL_NAME.replace(/\./g, "__dot__"),
    description: "Select the single best registered Xiaozhuoban tool before any desktop context is provided.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          enum: tools.map((tool) => tool.name),
          description: "Selected registered tool name."
        },
        targetHint: {
          type: "string",
          description: "Short target words copied from the user's command, such as 音乐, 天气, 默认桌板."
        },
        userCommand: {
          type: "string",
          description: "A short normalized version of the user's command."
        },
        confidence: { type: "number" }
      },
      required: ["name"],
      additionalProperties: false
    }
  };
}

export function createToolSelectionPayload(
  request: RealtimeTextToolCallRequest,
  options: { model?: string } = {}
) {
  return {
    model: options.model ?? XIAOZHUOBAN_REALTIME_MODEL,
    input: [
      {
        role: "user",
        content: createRealtimeToolSelectionPrompt(request.input, request.tools)
      }
    ],
    tools: [
      {
        type: "function",
        name: SELECT_TOOL_NAME.replace(/\./g, "__dot__"),
        description: "Select the single best registered Xiaozhuoban tool for the user's command.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Selected registered tool name." },
            targetHint: { type: "string", description: "Short widget or board target words from the user command." },
            confidence: { type: "number" }
          },
          required: ["name"],
          additionalProperties: false
        }
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

function targetHintMentionsWidget(targetHint: string | undefined, widget: CompactAssistantContext["widgets"][number]) {
  const hint = targetHint ?? "";
  return Boolean(hint) && (hint.includes(widget.name) || hint.includes(widget.type) || inputMentionsWidgetType(hint, widget.type));
}

export function createScopedRealtimeContext(
  context: CompactAssistantContext,
  tool: AssistantToolSpec,
  selection: RealtimeTextToolSelection,
  input: string
): CompactAssistantContext {
  const selectedWidgetType = tool.widgetType || Object.keys(widgetAliases).find((type) => inputMentionsWidgetType(input, type));
  const includeBoards = tool.name.startsWith("board.") || tool.name === "assistant.confirm" || tool.name === "assistant.cancel";
  const includeDefinitions = tool.name === "board.add_widget";
  const widgets =
    tool.requiresTarget || tool.name.startsWith("widget.")
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
      context.focusedWidget &&
      (tool.requiresTarget || tool.name.startsWith("widget.")) &&
      (!selectedWidgetType || context.focusedWidget.type === selectedWidgetType)
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

export function createScopedToolCallPayload(
  request: RealtimeTextToolCallRequest,
  selection: RealtimeTextToolSelection,
  options: { model?: string } = {}
) {
  const tool = request.tools.find((candidate) => candidate.name === selection.name);
  if (!tool || !request.context) {
    return {
      model: options.model ?? XIAOZHUOBAN_REALTIME_MODEL,
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
  const scopedContext = createScopedRealtimeContext(request.context, tool, selection, request.input);
  return {
    model: options.model ?? XIAOZHUOBAN_REALTIME_MODEL,
    input: [
      {
        role: "user",
        content: [
          createRealtimeContextInstructions(scopedContext),
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
    tools: tool ? [serializeAssistantToolForRealtime(tool)] : [],
    tool_choice: tool ? "auto" : "none",
    parallel_tool_calls: false,
    max_output_tokens: 120
  };
}

export function createScopedRealtimeToolInstructions(
  context: CompactAssistantContext,
  selection: RealtimeTextToolSelection,
  input: string
) {
  return [
    createRealtimeContextInstructions(context),
    "",
    "# Selected Tool Stage",
    "现在只根据上一步选中的工具和此处提供的最小上下文，返回可执行工具调用。",
    "只调用已选工具；不要调用未提供的工具，不要访问未提供的桌面上下文。",
    "如果缺少目标或信息不足，不要猜测参数，直接简短说明需要澄清。",
    "",
    `已选工具：${selection.name}`,
    selection.targetHint ? `目标提示：${selection.targetHint}` : "",
    `用户命令：${input}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function createScopedRealtimeToolUpdate(
  request: RealtimeTextToolCallRequest,
  selection: RealtimeTextToolSelection
) {
  const tool = request.tools.find((candidate) => candidate.name === selection.name);
  if (!tool || !request.context) return null;
  const scopedContext = createScopedRealtimeContext(request.context, tool, selection, request.input);
  return {
    type: "session.update",
    session: {
      instructions: createScopedRealtimeToolInstructions(scopedContext, selection, request.input),
      tools: [serializeAssistantToolForRealtime(tool)],
      tool_choice: "auto",
      parallel_tool_calls: false
    }
  };
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function findResponsesFunctionCall(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "function_call" && typeof record.name === "string") return record;
  for (const key of ["output", "items", "content"]) {
    const items = record[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const found = findResponsesFunctionCall(item);
      if (found) return found;
    }
  }
  return null;
}

export function extractAssistantToolCallFromResponsesPayload(
  payload: unknown,
  allowedToolNames: Set<string>
): AssistantToolCall | null {
  const functionCall = findResponsesFunctionCall(payload);
  if (!functionCall || typeof functionCall.name !== "string") return null;
  const name = decodeRealtimeToolName(functionCall.name);
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

export function extractToolSelectionFromResponsesPayload(
  payload: unknown,
  allowedToolNames: Set<string>
): RealtimeTextToolSelection | null {
  const functionCall = findResponsesFunctionCall(payload);
  if (!functionCall || decodeRealtimeToolName(String(functionCall.name)) !== SELECT_TOOL_NAME) return null;
  const args = parseArguments(functionCall.arguments);
  const name = typeof args.name === "string" ? args.name : "";
  if (!allowedToolNames.has(name)) return null;
  return {
    name,
    targetHint: typeof args.targetHint === "string" ? args.targetHint : undefined,
    confidence: typeof args.confidence === "number" ? args.confidence : undefined
  };
}

export function parseRealtimeTextToolCallResponse(value: unknown): AssistantToolCall | null {
  if (!value || typeof value !== "object") return null;
  const call = (value as Record<string, unknown>).call;
  if (!call || typeof call !== "object") return null;
  const record = call as Record<string, unknown>;
  if (typeof record.name !== "string") return null;
  return {
    id: typeof record.id === "string" ? record.id : `model_${Date.now()}`,
    name: record.name,
    arguments: parseArguments(record.arguments),
    source: "text"
  };
}

export function parseRealtimeTextToolSelectionResponse(value: unknown): RealtimeTextToolSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = (value as Record<string, unknown>).selection;
  if (!selection || typeof selection !== "object") return null;
  const record = selection as Record<string, unknown>;
  if (typeof record.name !== "string") return null;
  return {
    name: record.name,
    targetHint: typeof record.targetHint === "string" ? record.targetHint : undefined,
    confidence: typeof record.confidence === "number" ? record.confidence : undefined
  };
}
