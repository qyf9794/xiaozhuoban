export type RealtimeReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type RealtimeSemanticVadEagerness = "low" | "medium" | "high" | "auto";

export interface RealtimeSessionOptions {
  ttlSeconds?: number;
  reasoningEffort?: RealtimeReasoningEffort;
  turnDetectionEagerness?: RealtimeSemanticVadEagerness;
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
export const XIAOZHUOBAN_REALTIME_MODEL = "gpt-realtime-2";
export const XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL = "gpt-4.1-mini";
export const XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
export const DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS = 600;
export const REALTIME_TOOL_SELECTION_TOOL_NAME = "assistant.select_tool";
export const REALTIME_COMMAND_EXECUTION_TOOL_NAME = "assistant.execute_command";
export const REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD = 0.65;

export const XIAOZHUOBAN_REALTIME_INSTRUCTIONS = [
  "# Role and Objective",
  "你是小桌板里的语音助手，负责控制小桌板 Web 桌面、已加载小工具和已注册工具。",
  "",
  "# Tool Policy",
  "- 需要控制桌面、窗口或小工具时，只调用 assistant.execute_command，并把用户原话或最短等价命令放入 command。",
  "- 不要直接调用 widget.remove、widget.move、board.add_widget 等底层工具；本地 harness 会解析、确认、校验和执行。",
  "- 普通问候或闲聊可以直接简短回答，不需要调用工具。",
  "- 清空内容、删除用户数据、覆盖内容、批量修改数据必须请求确认。",
  "- 不控制 macOS、Windows、浏览器外部桌面或用户本地系统。",
  "- 不调用 Codex 或浏览器外部系统；动态生成、复杂规划和长文本改写需要对应工具注册后才执行。",
  "",
  "# Context",
  "默认不会收到完整桌面状态。不要要求完整桌面状态，也不要输出完整 widget payload。",
  "",
  "# Voice Style",
  "回复要短，通常一句话。成功时说“好了”或简短结果；不支持时说明缺少哪个工具或目标。"
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
    "第一阶段只选择模块或工具类别",
    "第二阶段只基于 selected module scoped context 生成结构化动作"
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
