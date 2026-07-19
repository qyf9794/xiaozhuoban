export type RealtimeReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type RealtimeSemanticVadEagerness = "low" | "medium" | "high" | "auto";

export interface RealtimeFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface RealtimeSessionOptions {
  ttlSeconds?: number;
  reasoningEffort?: RealtimeReasoningEffort;
  turnDetectionEagerness?: RealtimeSemanticVadEagerness;
  highAccuracy?: boolean;
}

interface RealtimeClientSecretPayloadOptions extends RealtimeSessionOptions {
  instructions?: string;
  tools?: RealtimeFunctionTool[];
  outputVoice?: string;
  maxOutputTokens?: number;
  toolChoice?: "auto" | "none" | "required";
  parallelToolCalls?: boolean;
}

export const OPENAI_REALTIME_CLIENT_SECRET_URL = "https://api.openai.com/v1/realtime/client_secrets";
export const XIAOZHUOBAN_REALTIME_MINI_MODEL = "gpt-realtime-2.1-mini";
export const XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL = "gpt-realtime-2.1";
export const XIAOZHUOBAN_REALTIME_MODEL = XIAOZHUOBAN_REALTIME_MINI_MODEL;
export const XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL = "gpt-4.1-mini";
export const XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
export const DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS = 600;
export const XIAOZHUOBAN_REALTIME_OUTPUT_VOICE = "marin";
export const XIAOZHUOBAN_REALTIME_MAX_OUTPUT_TOKENS = 480;
export const REALTIME_TOOL_SELECTION_TOOL_NAME = "assistant.select_tool";
export const REALTIME_COMMAND_EXECUTION_TOOL_NAME = "assistant.execute_command";
export const XIAOZHUOBAN_REALTIME_INSTRUCTIONS = [
  "# Role and Objective",
  "你是小桌板里的语音助手，负责控制小桌板 Web 桌面、已加载小工具和已注册工具。",
  "",
  "# Tool Policy",
  "- 需要控制桌面、窗口或小工具时，优先调用 assistant.select_tool，选择最准确的已注册工具名、目标提示和置信度。",
  "- 决定调用 assistant.select_tool 时不要先说话或复述选择参数，直接调用工具，等待工具结果。",
  "- 前端会在你选择工具后通过 session.update 提供最小必要上下文和少量可执行工具 schema。",
  "- 只有在 assistant.select_tool 不可用、scoped session.update 失败、data channel 不可用，或前端明确要求 transcript fallback 时，才调用 assistant.execute_command。",
  "- 如果当前阶段没看到精确工具，不要直接回答缺少工具；优先选择最接近的已注册工具，让前端加载 scoped tools。",
  "- 不要编造 widgetId、definitionId 或完整桌面状态；本地 harness 会解析、确认、校验和执行。",
  "- 普通问候或闲聊可以直接简短回答，不需要调用工具。",
  "- 清空内容、删除用户数据、覆盖内容、批量修改数据必须请求确认。",
  "- 不控制 macOS、Windows、浏览器外部桌面或用户本地系统。",
  "- 不调用 Codex 或浏览器外部系统；动态生成、复杂规划和长文本改写需要对应工具注册后才执行。",
  "",
  "# Context",
  "默认不会收到完整桌面状态。不要要求完整桌面状态，也不要输出完整 widget payload。",
  "",
  "# Voice Style",
  "回复要短，通常一句话。",
  "成功时可以自然变化表达，例如“好了”“可以，已处理”“完成了”，但必须以工具结果为准，不要补充未执行的内容。",
  "不支持时说明缺少哪个工具或目标。"
].join("\n");

export function encodeRealtimeToolName(name: string): string {
  return name.replace(/\./g, "__dot__");
}

export function clampRealtimeClientSecretTtl(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS;
  }
  return Math.max(10, Math.min(7200, Math.floor(value)));
}

export function createRealtimeTurnDetection(options: RealtimeSessionOptions = {}) {
  return {
    type: "semantic_vad",
    eagerness: options.turnDetectionEagerness ?? "low",
    create_response: true,
    interrupt_response: true
  };
}

export function createRealtimeInputTranscription() {
  return {
    model: XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL,
    language: "zh",
    prompt:
      "中文小桌板语音控制。准确保留应用、小工具、歌手、歌曲、频道、操作名称，以及日期、星期和具体时间等时间实体。时间词表包括周一、周二、周三、周四、周五、周六、周日，以及上午、中午、下午、晚上；结合声学信号区分星期与日内时段，不要把“周”替换成“中”。常见音乐操作包括搜索、播放、暂停、继续、上一首、下一首、搜索结果第一首。"
  };
}

function createRealtimeSessionAudioConfig(options: RealtimeSessionOptions = {}) {
  return {
    input: {
      turn_detection: createRealtimeTurnDetection(options),
      transcription: createRealtimeInputTranscription()
    },
    output: {
      voice: XIAOZHUOBAN_REALTIME_OUTPUT_VOICE
    }
  };
}

export function resolveXiaozhuobanRealtimeModel(options: Pick<RealtimeSessionOptions, "highAccuracy"> = {}): string {
  return options.highAccuracy ? XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL : XIAOZHUOBAN_REALTIME_MODEL;
}

function createCoreRealtimeClientSecretPayload(options: RealtimeClientSecretPayloadOptions = {}) {
  return {
    expires_after: {
      anchor: "created_at",
      seconds: clampRealtimeClientSecretTtl(options.ttlSeconds)
    },
    session: {
      type: "realtime",
      model: resolveXiaozhuobanRealtimeModel(options),
      instructions: options.instructions ?? XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
      reasoning: {
        effort: options.reasoningEffort ?? "low"
      },
      audio: createRealtimeSessionAudioConfig(options),
      max_output_tokens: options.maxOutputTokens ?? XIAOZHUOBAN_REALTIME_MAX_OUTPUT_TOKENS,
      tool_choice: options.toolChoice ?? "auto",
      parallel_tool_calls: options.parallelToolCalls ?? true,
      tools: options.tools ?? []
    }
  };
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
};

export type InitialRealtimeSessionHints = {
  initialToolHints?: InitialToolMetadata[];
  initialModuleTypes?: string[];
};

const fallbackInitialToolMetadata: InitialToolMetadata[] = [
  { name: "board.add_widget", description: "Add an existing widget definition to the current Xiaozhuoban board." },
  { name: "widget.focus", description: "Focus an existing widget on the current Xiaozhuoban board." },
  { name: "widget.fullscreen_focus", description: "Enter fullscreen focus for an existing widget when supported." },
  { name: "widget.remove", description: "Close a widget window on the current board." },
  { name: "widget.move", description: "Move a widget to a new board position." },
  { name: "widget.resize", description: "Resize a widget only when its existing panel supports resizing." },
  { name: "widget.bring_to_front", description: "Bring a widget to the front when layer changes are available." },
  { name: "board.auto_align", description: "Auto-align widgets on the current board. Requires confirmation." },
  { name: "board.switch", description: "Switch to another Xiaozhuoban board." },
  { name: "board.create", description: "Create a new Xiaozhuoban board." },
  { name: "board.rename", description: "Rename an existing Xiaozhuoban board." }
];

const fallbackInitialModuleTypes = [
  "app",
  "board",
  "widget",
  "window",
  "calculator",
  "clipboard",
  "converter",
  "countdown",
  "dialClock",
  "headline",
  "market",
  "messageBoard",
  "music",
  "note",
  "recorder",
  "todo",
  "translate",
  "tv",
  "weather",
  "worldClock"
];

function stringSchema() {
  return { type: "string" };
}

function objectSchema(properties: Record<string, unknown>, required?: string[], additionalProperties = false): JsonObjectSchema {
  return {
    type: "object",
    properties,
    ...(required?.length ? { required } : {}),
    additionalProperties
  };
}

export function createRealtimeToolSelectionTool(
  tools: InitialToolMetadata[],
  moduleTypes: string[] = fallbackInitialModuleTypes
): RealtimeFunctionTool {
  return {
    type: "function",
    name: encodeRealtimeToolName(REALTIME_TOOL_SELECTION_TOOL_NAME),
    description: "Select the single best registered Xiaozhuoban tool before any desktop context is provided.",
    parameters: objectSchema(
      {
        name: {
          type: "string",
          enum: tools.map((tool) => tool.name),
          description: "Selected registered tool name."
        },
        selectedModule: {
          type: "string",
          enum: moduleTypes,
          description: "Selected Xiaozhuoban module type when known."
        },
        targetHint: {
          type: "string",
          description: "Short target words copied from the user's command."
        },
        userCommand: {
          type: "string",
          description: "A short normalized version of the user's command."
        },
        confidence: { type: "number" }
      },
      ["name"]
    )
  };
}

export function createRealtimeCommandExecutionTool(): RealtimeFunctionTool {
  return {
    type: "function",
    name: encodeRealtimeToolName(REALTIME_COMMAND_EXECUTION_TOOL_NAME),
    description:
      "Fallback only: execute a Xiaozhuoban command through the local harness when tool selection or scoped session updates are unavailable. Do not use as the normal UI-control path.",
    parameters: objectSchema(
      {
        command: {
          type: "string",
          description: "The user's original command or the shortest equivalent command to execute."
        }
      },
      ["command"]
    )
  };
}

export function createInitialRealtimeTools(hints: InitialRealtimeSessionHints = {}): RealtimeFunctionTool[] {
  return [
    createRealtimeToolSelectionTool(
      hints.initialToolHints?.length ? hints.initialToolHints : fallbackInitialToolMetadata,
      hints.initialModuleTypes?.length ? hints.initialModuleTypes : fallbackInitialModuleTypes
    ),
    createRealtimeCommandExecutionTool()
  ];
}

export function createRealtimeClientSecretPayload(options: RealtimeSessionOptions & InitialRealtimeSessionHints = {}) {
  return createCoreRealtimeClientSecretPayload({
    ...options,
    tools: createInitialRealtimeTools(options)
  });
}
