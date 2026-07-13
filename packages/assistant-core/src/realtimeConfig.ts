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

export interface RealtimeClientSecretPayloadOptions extends RealtimeSessionOptions {
  instructions?: string;
  tools?: RealtimeFunctionTool[];
  outputVoice?: string;
  maxOutputTokens?: number;
  toolChoice?: "auto" | "none" | "required";
  parallelToolCalls?: boolean;
}

export interface AssistantResponsibility {
  owner: "local_harness" | "realtime_planner" | "transcription" | "text_model_fallback" | "remote_codex";
  responsibilities: string[];
  forbidden: string[];
}

export type CommandPlanExecutionMode = "sequential" | "parallel";

export interface CommandPlanStep {
  id: string;
  module: string;
  tool: string;
  args: Record<string, unknown>;
  risk: "safe" | "confirm" | "destructive";
  confidence: number;
  dependsOn?: string[];
  source: "shortcut" | "realtime" | "text" | "learned" | "test";
  requiresHarnessValidation: true;
}

export interface CommandDependency {
  from: string;
  to: string;
}

export interface ExecutionGroup {
  id: string;
  mode: CommandPlanExecutionMode;
  commandIds: string[];
}

export interface CommandPlan {
  id: string;
  sourceText: string;
  normalizedText: string;
  commands: CommandPlanStep[];
  dependencies: CommandDependency[];
  executionGroups: ExecutionGroup[];
  confidence: number;
  needsConfirmation: boolean;
  createdBy: "local" | "realtime-2" | "text-llm" | "learned";
  requiresHarnessValidation: true;
}

export interface LegacyCommandPlanStep {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  source: "shortcut" | "realtime" | "text" | "learned" | "test";
  requiresHarnessValidation: true;
}

export const OPENAI_REALTIME_CLIENT_SECRET_URL = "https://api.openai.com/v1/realtime/client_secrets";
export const XIAOZHUOBAN_REALTIME_MINI_MODEL = "gpt-realtime-2.1-mini";
export const XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL = "gpt-realtime-2.1";
export const XIAOZHUOBAN_REALTIME_MODEL = XIAOZHUOBAN_REALTIME_MINI_MODEL;
export const XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL = "gpt-4.1-mini";
export const XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
export const DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS = 600;
export const XIAOZHUOBAN_REALTIME_OUTPUT_VOICE = "marin";
export const XIAOZHUOBAN_REALTIME_MAX_OUTPUT_TOKENS = 480;
export const REALTIME_TOOL_SELECTION_TOOL_NAME = "assistant.select_tool";
export const REALTIME_COMMAND_EXECUTION_TOOL_NAME = "assistant.execute_command";
export const REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD = 0.65;

export const OPENAI_PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing";
export const OPENAI_PRICING_CHECKED_AT = "2026-07-07";

export type OpenAIModelTokenRates = {
  input?: number;
  cachedInput?: number;
  output?: number;
  textInput?: number;
  cachedTextInput?: number;
  textOutput?: number;
  audioInput?: number;
  cachedAudioInput?: number;
  audioOutput?: number;
};

export const OPENAI_MODEL_TOKEN_RATES: Record<string, OpenAIModelTokenRates> = {
  "gpt-realtime-2.1-mini": {
    textInput: 0.6,
    cachedTextInput: 0.06,
    textOutput: 2.4,
    audioInput: 10,
    cachedAudioInput: 0.3,
    audioOutput: 20
  },
  "gpt-realtime-2.1": {
    textInput: 4,
    cachedTextInput: 0.4,
    textOutput: 24,
    audioInput: 32,
    cachedAudioInput: 0.4,
    audioOutput: 64
  },
  "gpt-realtime-2": {
    textInput: 4,
    cachedTextInput: 0.4,
    textOutput: 24,
    audioInput: 32,
    cachedAudioInput: 0.4,
    audioOutput: 64
  }
};

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
  "工具调用前不要说“好的、我来、让我看看”等开场白，直接调用工具。",
  "工具执行成功后的语音回复要自然简洁，例如“好了，已设置五分钟倒计时”，不要重复上一句。",
  "普通问答、解释和聊天可以按需要完整回答，不要为了简短人为截断内容。",
  "成功时必须以工具结果为准，不要补充未执行的内容。",
  "不支持时说明缺少哪个工具或目标。"
].join("\n");

export const LocalHarnessResponsibility: AssistantResponsibility = {
  owner: "local_harness",
  responsibilities: [
    "注册工具模块、快捷命令和工具 schema",
    "优先处理确定性高置信度本地命令",
    "把所有模型输出转换为 CommandPlan 后校验、确认、执行和审计"
  ],
  forbidden: ["静默执行高风险命令", "绕过 harness 执行模型返回的工具调用", "向模型发送完整私密上下文"]
};

export const RealtimePlannerResponsibility: AssistantResponsibility = {
  owner: "realtime_planner",
  responsibilities: [
    "处理复杂口语、低置信度、多重语义和连续轮次",
    "第一阶段只选择最匹配的已注册工具名",
    "第二阶段只基于 selected tool scoped context 生成结构化动作"
  ],
  forbidden: ["直接执行工具", "接收全量桌面上下文", "代替本地快捷命令处理高置信度命令"]
};

export const TranscriptionResponsibility: AssistantResponsibility = {
  owner: "transcription",
  responsibilities: ["将用户语音稳定转写为文本", "可由 gpt-4o-mini-transcribe 或 gpt-realtime-whisper 承担"],
  forbidden: ["执行工具", "长期保存工具状态", "决定桌面控制权限"]
};

export const TextModelFallbackResponsibility: AssistantResponsibility = {
  owner: "text_model_fallback",
  responsibilities: ["非实时文本命令解析", "两阶段工具选择 fallback", "离线回放和日志总结"],
  forbidden: ["默认使用 realtime 模型", "直接执行本地工具", "接管实时语音中断控制流"]
};

export const RemoteCodexResponsibility: AssistantResponsibility = {
  owner: "remote_codex",
  responsibilities: ["异步生成或修改 WidgetAssistantModule", "编写测试矩阵", "分析失败日志和生成补丁"],
  forbidden: ["接收实时麦克风流", "接收未过滤完整桌面状态", "未经用户确认安装或执行新工具"]
};

export function encodeRealtimeToolName(name: string): string {
  return name.replace(/\./g, "__dot__");
}

export function decodeRealtimeToolName(name: string): string {
  return name.replace(/__dot__/g, ".");
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
    model: XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL
  };
}

export function createRealtimeSessionAudioConfig(options: RealtimeSessionOptions = {}) {
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

export function createRealtimeClientSecretPayload(options: RealtimeClientSecretPayloadOptions = {}) {
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
