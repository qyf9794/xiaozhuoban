import {
  ToolScopeManager,
  createPassthroughSchema,
  type AssistantParameterSchema,
  type CompactAssistantContext,
  type AssistantToolScopeKind,
  type AssistantToolSpec
} from "@xiaozhuoban/assistant-core";

export const OPENAI_REALTIME_CLIENT_SECRET_URL = "https://api.openai.com/v1/realtime/client_secrets";
export const XIAOZHUOBAN_REALTIME_MODEL = "gpt-realtime-2";
export const DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS = 600;

export type RealtimeReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type RealtimeSemanticVadEagerness = "low" | "medium" | "high" | "auto";

export interface RealtimeSessionOptions {
  ttlSeconds?: number;
  reasoningEffort?: RealtimeReasoningEffort;
  turnDetectionEagerness?: RealtimeSemanticVadEagerness;
}

export interface RealtimeFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

type JsonObjectSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

type InitialToolMetadata = {
  name: string;
  description: string;
  scope: AssistantToolScopeKind;
  risk?: AssistantToolSpec["risk"];
  parameters: JsonObjectSchema;
};

export const XIAOZHUOBAN_REALTIME_INSTRUCTIONS = [
  "# Role and Objective",
  "你是小桌板里的语音助手，只能控制小桌板 Web 桌面和本阶段已开放的小工具能力。",
  "",
  "# Tool Policy",
  "- 优先等待本地 AssistantHarness 的 shortcut 结果；你只在工具已注册时调用工具。",
  "- 初始阶段只能做桌板级操作和目标选择，不要猜测未加载小工具的细节参数。",
  "- 调用小工具细节前，先选择或确认目标小工具上下文。",
  "- 删除、覆盖、批量操作必须请求确认。",
  "- 不控制 macOS、Windows、浏览器外部桌面或用户本地系统。",
  "- 不生成动态小工具，不调用 Codex，不做复杂规划，不改写长文本。",
  "- 游戏小工具和 AI 表单细节能力在本阶段不可用。",
  "",
  "# Context",
  "你只会收到摘要状态。不要要求完整桌面状态，也不要输出完整 widget payload。",
  "",
  "# Voice Style",
  "回复要短，通常一句话。成功时说“好了”或简短结果；不支持时一句话说明这一阶段不可用。"
].join("\n");

function formatRealtimeContextList(items: string[], fallback: string) {
  return items.length > 0 ? items.join("\n") : fallback;
}

export function createRealtimeContextInstructions(context?: CompactAssistantContext): string {
  if (!context) return XIAOZHUOBAN_REALTIME_INSTRUCTIONS;

  const boardName = context.boardName ?? context.boardId ?? "当前桌板";
  const focused = context.focusedWidget
    ? `${context.focusedWidget.name}(${context.focusedWidget.type}, widgetId=${context.focusedWidget.widgetId})`
    : "无";
  const widgets = formatRealtimeContextList(
    context.widgets.map((widget) => {
      const flags = [widget.focused ? "focused" : "", widget.recent ? "recent" : ""].filter(Boolean).join(",");
      return `- ${widget.name}(${widget.type}) widgetId=${widget.widgetId} definitionId=${widget.definitionId} summary=${widget.summary}${flags ? ` flags=${flags}` : ""}`;
    }),
    "- 当前桌板没有已加载小工具"
  );
  const definitions = formatRealtimeContextList(
    (context.availableDefinitions ?? []).map(
      (definition) => `- ${definition.name}(${definition.type}) definitionId=${definition.definitionId}`
    ),
    "- 没有可添加组件定义摘要"
  );
  const pending = context.pendingConfirmation
    ? `${context.pendingConfirmation.actionName}: ${context.pendingConfirmation.message}`
    : "无";

  return [
    XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
    "",
    "# Current Xiaozhuoban Context",
    `- board: ${boardName}`,
    `- focusedWidget: ${focused}`,
    `- pendingConfirmation: ${pending}`,
    "- loadedWidgets:",
    widgets,
    "- availableDefinitions:",
    definitions
  ].join("\n");
}

export function encodeRealtimeToolName(name: string): string {
  return name.replace(/\./g, "__dot__");
}

export function decodeRealtimeToolName(name: string): string {
  return name.replace(/__dot__/g, ".");
}

const anyObjectSchema = createPassthroughSchema<Record<string, unknown>>((value): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object"
);

const initialToolMetadata: InitialToolMetadata[] = [
  {
    name: "board.add_widget",
    description: "Add an existing widget definition to the current Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema(
      {
        definitionId: stringSchema(),
        mobileMode: booleanSchema(),
        followUp: objectSchema({ name: stringSchema(), arguments: objectSchema({}, undefined, true) }, ["name"])
      },
      ["definitionId"]
    )
  },
  {
    name: "widget.focus",
    description: "Focus an existing widget on the current Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema() }, ["widgetId"])
  },
  {
    name: "widget.fullscreen_focus",
    description: "Enter fullscreen focus for an existing widget when supported.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema() }, ["widgetId"])
  },
  {
    name: "widget.remove",
    description: "Remove a widget from the current board after confirmation.",
    scope: "desktop",
    risk: "destructive",
    parameters: objectSchema({ widgetId: stringSchema() }, ["widgetId"])
  },
  {
    name: "widget.move",
    description: "Move a widget to a new board position.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema(), x: numberSchema(), y: numberSchema() }, ["widgetId", "x", "y"])
  },
  {
    name: "widget.resize",
    description: "Resize a widget only when its existing panel supports resizing.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema(), w: numberSchema(), h: numberSchema() }, ["widgetId", "w", "h"])
  },
  {
    name: "widget.bring_to_front",
    description: "Bring a widget to the front when layer changes are available.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema() }, ["widgetId"])
  },
  {
    name: "board.auto_align",
    description: "Auto-align widgets on the current board. Requires confirmation.",
    scope: "desktop",
    risk: "confirm",
    parameters: objectSchema({ viewportWidth: numberSchema(), mobileMode: booleanSchema() })
  },
  {
    name: "board.switch",
    description: "Switch to another Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema({ boardId: stringSchema() }, ["boardId"])
  },
  {
    name: "board.create",
    description: "Create a new Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema({ name: stringSchema() })
  },
  {
    name: "board.rename",
    description: "Rename an existing Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema({ boardId: stringSchema(), name: stringSchema() }, ["boardId", "name"])
  },
  {
    name: "assistant.out_of_scope",
    description: "Return a short stage-one out-of-scope response without planning or server tool calls.",
    scope: "desktop",
    parameters: objectSchema(
      {
        category: {
          type: "string",
          enum: ["deferred_widget", "ai_form", "dynamic_widget_generation", "complex_planning", "long_text_rewrite"]
        },
        targetType: stringSchema(),
        request: stringSchema()
      },
      ["category"]
    )
  },
  {
    name: "gomoku.play",
    description: "Deferred game action; never exposed in stage one.",
    scope: "deferred",
    parameters: objectSchema({})
  }
];

function stringSchema() {
  return { type: "string" };
}

function numberSchema() {
  return { type: "number" };
}

function booleanSchema() {
  return { type: "boolean" };
}

function objectSchema(properties: Record<string, unknown>, required?: string[], additionalProperties = false): JsonObjectSchema {
  return {
    type: "object",
    properties,
    ...(required?.length ? { required } : {}),
    additionalProperties
  };
}

function toAssistantToolSpec(metadata: InitialToolMetadata): AssistantToolSpec<Record<string, unknown>> {
  return {
    name: metadata.name,
    description: metadata.description,
    parameters: anyObjectSchema as AssistantParameterSchema<Record<string, unknown>>,
    risk: metadata.risk,
    scope: metadata.scope
  };
}

export function clampRealtimeClientSecretTtl(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS;
  }
  return Math.max(10, Math.min(7200, Math.floor(value)));
}

export function createInitialRealtimeToolSpecs(): AssistantToolSpec[] {
  const specs = initialToolMetadata.map(toAssistantToolSpec);
  return new ToolScopeManager(specs).getInitialTools();
}

export function createInitialRealtimeTools(): RealtimeFunctionTool[] {
  const initialNames = new Set(createInitialRealtimeToolSpecs().map((tool) => tool.name));
  return initialToolMetadata
    .filter((metadata) => initialNames.has(metadata.name))
    .map((metadata) => serializeAssistantToolForRealtime(toAssistantToolSpec(metadata), metadata.parameters));
}

export function serializeAssistantToolForRealtime(
  tool: AssistantToolSpec,
  parameters: Record<string, unknown> = objectSchema({}, undefined)
): RealtimeFunctionTool {
  return {
    type: "function",
    name: encodeRealtimeToolName(tool.name),
    description: tool.description,
    parameters
  };
}

export function createRealtimeTurnDetection(options: RealtimeSessionOptions = {}) {
  return {
    type: "semantic_vad",
    eagerness: options.turnDetectionEagerness ?? "low",
    create_response: true,
    interrupt_response: true
  };
}

export function createRealtimeClientSecretPayload(options: RealtimeSessionOptions = {}) {
  return {
    expires_after: {
      anchor: "created_at",
      seconds: clampRealtimeClientSecretTtl(options.ttlSeconds)
    },
    session: {
      type: "realtime",
      model: XIAOZHUOBAN_REALTIME_MODEL,
      instructions: createRealtimeContextInstructions(),
      reasoning: {
        effort: options.reasoningEffort ?? "low"
      },
      output_modalities: ["audio"],
      audio: {
        input: {
          turn_detection: createRealtimeTurnDetection(options)
        },
        output: {
          voice: "marin"
        }
      },
      max_output_tokens: 120,
      tool_choice: "auto",
      parallel_tool_calls: true,
      tools: createInitialRealtimeTools()
    }
  };
}
