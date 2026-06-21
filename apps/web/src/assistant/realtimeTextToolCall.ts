import {
  type AssistantToolCall,
  type AssistantToolSpec,
  type CommandPlan,
  type CompactAssistantContext,
  type RealtimeModuleCatalogItem,
  type RealtimeScopedModuleContext
} from "@xiaozhuoban/assistant-core";
import {
  REALTIME_ADD_WIDGET_TOOL_NAME,
  findRealtimeWidgetType,
  inputMentionsRealtimeWidgetType,
  realtimeToolSelectionPolicyLines,
  realtimeToolSelectionSessionPolicyLines
} from "./realtimeRoutingPolicy";
import {
  XIAOZHUOBAN_REALTIME_MODEL,
  createRealtimeContextInstructions,
  createRealtimeSessionAudioConfig,
  decodeRealtimeToolName,
  serializeAssistantToolForRealtime,
  type RealtimeFunctionTool
} from "./realtimeSessionConfig";

export type RealtimeTextToolCallRequest = {
  input: string;
  contextVersion?: string;
  toolCatalogVersion?: string;
  context?: CompactAssistantContext;
  tools: AssistantToolSpec[];
  moduleCatalog?: RealtimeModuleCatalogItem[];
  moduleContext?: RealtimeScopedModuleContext;
  moduleContexts?: RealtimeScopedModuleContext[];
  phase?: "select" | "execute" | "auto" | "plan_select" | "plan_execute";
  selection?: RealtimeTextToolSelection;
  planSelection?: RealtimeTextPlanSelection;
};

export type RealtimeTextToolCallResponse = {
  call: AssistantToolCall | null;
  selection?: RealtimeTextToolSelection | null;
  plan?: CommandPlan | null;
  planSelection?: RealtimeTextPlanSelection | null;
};

export type RealtimeTextToolSelection = {
  name: string;
  selectedModule?: string;
  targetHint?: string;
  confidence?: number;
};

export type RealtimeTextPlanSelectionStep = RealtimeTextToolSelection & {
  id?: string;
  connector?: "start" | "sequential" | "parallel";
};

export type RealtimeTextPlanSelection = {
  steps: RealtimeTextPlanSelectionStep[];
};

const SELECT_TOOL_NAME = "assistant.select_tool";
const ADD_WIDGET_TOOL_NAME = REALTIME_ADD_WIDGET_TOOL_NAME;

export const REALTIME_TOOL_SELECTION_TOOL_NAME = SELECT_TOOL_NAME;

function parsePlanConnector(value: unknown): RealtimeTextPlanSelectionStep["connector"] {
  return value === "parallel" || value === "sequential" || value === "start" ? value : undefined;
}

export function createRealtimeTextToolCallRequestBody(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  selection?: RealtimeTextToolSelection
) {
  return JSON.stringify({
    input,
    context,
    contextVersion: context.contextVersion,
    toolCatalogVersion: context.toolCatalogVersion,
    tools,
    selection,
    phase: "auto"
  } satisfies RealtimeTextToolCallRequest);
}

function getRealtimeCatalogVersion(moduleCatalog: RealtimeModuleCatalogItem[] | undefined): string | undefined {
  const first = moduleCatalog?.find((module) => "catalogVersion" in module && typeof module.catalogVersion === "string");
  return first && "catalogVersion" in first && typeof first.catalogVersion === "string" ? first.catalogVersion : undefined;
}

export function createRealtimeToolSelectionRequestBody(
  input: string,
  tools: AssistantToolSpec[],
  moduleCatalog?: RealtimeModuleCatalogItem[]
) {
  return JSON.stringify({
    input,
    tools,
    moduleCatalog,
    toolCatalogVersion: getRealtimeCatalogVersion(moduleCatalog),
    phase: "select"
  } satisfies RealtimeTextToolCallRequest);
}

export function createRealtimeScopedToolCallRequestBody(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  selection: RealtimeTextToolSelection,
  moduleContext?: RealtimeScopedModuleContext
) {
  return JSON.stringify({
    input,
    context,
    contextVersion: context.contextVersion,
    toolCatalogVersion: context.toolCatalogVersion,
    tools,
    selection,
    moduleContext,
    phase: "execute"
  } satisfies RealtimeTextToolCallRequest);
}

export function createRealtimePlanSelectionRequestBody(
  input: string,
  tools: AssistantToolSpec[],
  moduleCatalog?: RealtimeModuleCatalogItem[]
) {
  return JSON.stringify({
    input,
    tools,
    moduleCatalog,
    toolCatalogVersion: getRealtimeCatalogVersion(moduleCatalog),
    phase: "plan_select"
  } satisfies RealtimeTextToolCallRequest);
}

export function createRealtimeCommandPlanRequestBody(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  planSelection: RealtimeTextPlanSelection,
  moduleContexts?: RealtimeScopedModuleContext[]
) {
  return JSON.stringify({
    input,
    context,
    contextVersion: context.contextVersion,
    toolCatalogVersion: context.toolCatalogVersion,
    tools,
    planSelection,
    moduleContexts,
    phase: "plan_execute"
  } satisfies RealtimeTextToolCallRequest);
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

function moduleCatalogText(moduleCatalog: RealtimeModuleCatalogItem[] | undefined) {
  return (moduleCatalog ?? [])
    .map((module) =>
      [
        `- ${module.type}`,
        `displayName=${module.displayName}`,
        `aliases=${module.aliases.join("/")}`,
        `capabilities=${module.capabilities.join("/")}`,
        "toolNames" in module && Array.isArray(module.toolNames) ? `tools=${module.toolNames.join("/")}` : "",
        "concurrencyKeys" in module && Array.isArray(module.concurrencyKeys) && module.concurrencyKeys.length
          ? `concurrency=${module.concurrencyKeys.join("/")}`
          : "",
        "loadLevel" in module && typeof module.loadLevel === "string" ? `load=${module.loadLevel}` : "",
        module.riskSummary.length ? `risk=${module.riskSummary.join("/")}` : "",
        module.shortcutExamples.length ? `examples=${module.shortcutExamples.join("/")}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");
}

export function createRealtimeToolSelectionPrompt(
  input: string,
  tools: AssistantToolSpec[],
  moduleCatalog?: RealtimeModuleCatalogItem[]
) {
  const catalogVersion = getRealtimeCatalogVersion(moduleCatalog);
  return [
    "你是小桌板命令路由器。先只判断用户想使用哪个模块和已注册工具，不要生成工具参数。",
    "你只能基于模块目录、工具目录和用户命令选择；此阶段不会提供桌面上下文。",
    ...realtimeToolSelectionPolicyLines,
    "没有足够把握时不要调用工具。",
    "",
    "# 版本",
    catalogVersion ? `toolCatalogVersion=${catalogVersion}` : "toolCatalogVersion=unknown",
    "",
    "# 模块目录",
    moduleCatalogText(moduleCatalog) || "- 未提供模块目录",
    "",
    "# 工具目录",
    toolCatalog(tools),
    "",
    `用户命令：${input}`
  ].join("\n");
}

export function createRealtimeToolSelectionInstructions(tools: AssistantToolSpec[], moduleCatalog?: RealtimeModuleCatalogItem[]) {
  const catalogVersion = getRealtimeCatalogVersion(moduleCatalog);
  return [
    "你是小桌板命令路由器。当前阶段只判断用户想使用哪个模块和已注册工具。",
    "不要生成任何真实工具参数，不要猜 widgetId、definitionId、boardId。",
    "不要要求完整桌面上下文；如果需要目标，只把用户说出的目标词放到 targetHint。",
    "用户要控制桌面时，先调用 assistant.select_tool；前端随后会按所选工具提供最小必要上下文。",
    ...realtimeToolSelectionSessionPolicyLines,
    "",
    "# 版本",
    catalogVersion ? `toolCatalogVersion=${catalogVersion}` : "toolCatalogVersion=unknown",
    "",
    "# 模块目录",
    moduleCatalogText(moduleCatalog) || "- 未提供模块目录",
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
        selectedModule: {
          type: "string",
          enum: (tools.length > 0 ? [...new Set(tools.map((tool) => tool.widgetType).filter(Boolean))] : []) as string[],
          description: "Selected module type when known."
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
        content: createRealtimeToolSelectionPrompt(request.input, request.tools, request.moduleCatalog)
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
            selectedModule: { type: "string", description: "Selected Xiaozhuoban module type when known." },
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
  return inputMentionsRealtimeWidgetType(input, type);
}

function targetHintMentionsWidget(targetHint: string | undefined, widget: CompactAssistantContext["widgets"][number]) {
  const hint = targetHint ?? "";
  return Boolean(hint) && (hint.includes(widget.name) || hint.includes(widget.type) || inputMentionsWidgetType(hint, widget.type));
}

function getSelectedWidgetType(tool: AssistantToolSpec, selection: RealtimeTextToolSelection, input: string) {
  return (
    selection.selectedModule ||
    tool.widgetType ||
    findRealtimeWidgetType(input, selection.targetHint)
  );
}

function selectScopedWidgets(
  context: CompactAssistantContext,
  selectedWidgetType: string | undefined,
  selection: RealtimeTextToolSelection
) {
  return context.widgets.filter(
    (widget) =>
      widget.type === selectedWidgetType ||
      (!selectedWidgetType && widget.focused) ||
      targetHintMentionsWidget(selection.targetHint, widget)
  );
}

function canAddWidgetForSelectedTool(context: CompactAssistantContext, selectedWidgetType: string | undefined) {
  return Boolean(selectedWidgetType && context.availableDefinitions?.some((definition) => definition.type === selectedWidgetType));
}

function getExecutableToolsForSelection(
  tools: AssistantToolSpec[],
  selectedTool: AssistantToolSpec,
  scopedContext: CompactAssistantContext,
  selectedWidgetType: string | undefined
) {
  if (!selectedTool.requiresTarget || scopedContext.widgets.length > 0) return [selectedTool];
  if (!canAddWidgetForSelectedTool(scopedContext, selectedWidgetType)) return [selectedTool];
  const addWidgetTool = tools.find((tool) => tool.name === ADD_WIDGET_TOOL_NAME);
  return addWidgetTool ? [addWidgetTool, selectedTool] : [selectedTool];
}

export function createScopedRealtimeContext(
  context: CompactAssistantContext,
  tool: AssistantToolSpec,
  selection: RealtimeTextToolSelection,
  input: string
): CompactAssistantContext {
  const selectedWidgetType = getSelectedWidgetType(tool, selection, input);
  const includeBoards = tool.name.startsWith("board.") || tool.name === "assistant.confirm" || tool.name === "assistant.cancel";
  const widgets = tool.requiresTarget || tool.name.startsWith("widget.") ? selectScopedWidgets(context, selectedWidgetType, selection) : [];
  const includeDefinitions = tool.name === ADD_WIDGET_TOOL_NAME || (tool.requiresTarget && widgets.length === 0);

  return {
    contextVersion: context.contextVersion,
    toolCatalogVersion: context.toolCatalogVersion,
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
    availableDefinitions: includeDefinitions ? context.availableDefinitions ?? [] : undefined,
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
  const selectedWidgetType = getSelectedWidgetType(tool, selection, request.input);
  const executableTools = getExecutableToolsForSelection(request.tools, tool, scopedContext, selectedWidgetType);
  return {
    model: options.model ?? XIAOZHUOBAN_REALTIME_MODEL,
    input: [
      {
        role: "user",
        content: [
          createRealtimeContextInstructions(scopedContext),
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
          executableTools.some((candidate) => candidate.name === ADD_WIDGET_TOOL_NAME) && tool.name !== ADD_WIDGET_TOOL_NAME
            ? `如果当前没有 ${selectedWidgetType ?? "目标"} 小工具实例，但 availableDefinitions 中有对应定义，可以调用 board.add_widget，并在 followUp 中填写已选工具 ${tool.name} 及原始参数。`
            : "",
          "",
          `已选工具：${selection.name}`,
          selection.targetHint ? `目标提示：${selection.targetHint}` : "",
          `用户命令：${request.input}`
        ]
          .filter(Boolean)
          .join("\n")
      }
    ],
    tools: executableTools.map((candidate) => serializeAssistantToolForRealtime(candidate)),
    tool_choice: executableTools.length ? "auto" : "none",
    parallel_tool_calls: false,
    max_output_tokens: 120
  };
}

export function createScopedRealtimeToolInstructions(
  context: CompactAssistantContext,
  selection: RealtimeTextToolSelection,
  input: string,
  moduleContext?: RealtimeScopedModuleContext
) {
  return [
    createRealtimeContextInstructions(context),
    moduleContext
      ? [
          "",
          "# Selected Module Scoped Context",
          JSON.stringify({
            moduleType: moduleContext.moduleType,
            instances: moduleContext.instances,
            stateSummary: moduleContext.stateSummary,
            shortcutExamples: moduleContext.shortcutExamples,
            executionPolicy: moduleContext.executionPolicy,
            riskPolicy: moduleContext.riskPolicy
          })
        ].join("\n")
      : "",
    "",
    "# Selected Tool Stage",
    "现在只根据上一步选中的工具和此处提供的最小上下文，返回可执行工具调用。",
    "只调用已选工具；不要调用未提供的工具，不要访问未提供的桌面上下文。",
    selection.name === "board.add_widget"
      ? "如果已选工具是 board.add_widget，必须从 availableDefinitions 选择与用户命令最匹配的小工具，并用对应 definitionId 调用 board.add_widget；不要回答缺少打开小工具的方式。"
      : "",
    selection.name === "board.add_widget"
      ? "用户只说“时钟”时默认打开 dialClock/表盘时钟；只有明确说“世界时钟、世界时间、时区、东京时间、纽约时间”等才打开 worldClock。"
      : "",
    selection.name !== "board.add_widget" && context.widgets.length === 0 && (context.availableDefinitions?.length ?? 0) > 0
      ? `如果当前没有目标小工具实例，但工具列表提供了 board.add_widget，可以先用匹配的 definitionId 调用 board.add_widget，并在 followUp 中填写已选工具 ${selection.name} 及原始参数。`
      : "",
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
  const selectedWidgetType = getSelectedWidgetType(tool, selection, request.input);
  const executableTools = getExecutableToolsForSelection(request.tools, tool, scopedContext, selectedWidgetType);
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: createScopedRealtimeToolInstructions(scopedContext, selection, request.input, request.moduleContext),
      audio: createRealtimeSessionAudioConfig(),
      tools: executableTools.map((candidate) => serializeAssistantToolForRealtime(candidate)),
      tool_choice: executableTools.length ? "required" : "none",
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
    selectedModule: typeof args.selectedModule === "string" ? args.selectedModule : undefined,
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
    selectedModule: typeof record.selectedModule === "string" ? record.selectedModule : undefined,
    targetHint: typeof record.targetHint === "string" ? record.targetHint : undefined,
    confidence: typeof record.confidence === "number" ? record.confidence : undefined
  };
}

export function parseRealtimeTextPlanSelectionResponse(value: unknown): RealtimeTextPlanSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = (value as Record<string, unknown>).planSelection;
  if (!selection || typeof selection !== "object") return null;
  const steps = (selection as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) return null;
  const parsed = steps
    .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object" && !Array.isArray(step))
    .map((step) => ({
      id: typeof step.id === "string" ? step.id : undefined,
      name: typeof step.name === "string" ? step.name : "",
      selectedModule: typeof step.selectedModule === "string" ? step.selectedModule : undefined,
      targetHint: typeof step.targetHint === "string" ? step.targetHint : undefined,
      confidence: typeof step.confidence === "number" ? step.confidence : undefined,
      connector: parsePlanConnector(step.connector)
    }))
    .filter((step) => step.name);
  return parsed.length > 0 ? { steps: parsed } : null;
}

export function parseRealtimeCommandPlanResponse(value: unknown): CommandPlan | null {
  if (!value || typeof value !== "object") return null;
  const plan = (value as Record<string, unknown>).plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const record = plan as Record<string, unknown>;
  if (!Array.isArray(record.commands)) return null;
  return record as unknown as CommandPlan;
}
