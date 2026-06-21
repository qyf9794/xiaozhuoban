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
};

export const OPENAI_REALTIME_CLIENT_SECRET_URL = "https://api.openai.com/v1/realtime/client_secrets";
export const XIAOZHUOBAN_REALTIME_MODEL = "gpt-realtime-2";
export const XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL = "gpt-4.1-mini";
export const XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
export const DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS = 600;
export const REALTIME_TOOL_SELECTION_TOOL_NAME = "assistant.select_tool";

const XIAOZHUOBAN_REALTIME_INSTRUCTIONS = [
  "# Role and Objective",
  "你是小桌板里的语音助手，负责控制小桌板 Web 桌面、已加载小工具和已注册工具。",
  "",
  "# Tool Policy",
  "- 常驻阶段只选择工具，不直接生成真实工具参数。",
  "- 需要控制桌面时，先调用 assistant.select_tool，让前端按所选工具提供最小必要上下文。",
  "- 前端提供局部上下文后，只调用已选工具；工具缺失时再简短说明缺少对应能力。",
  "- 关闭、关掉、收起小工具窗口时调用 widget.remove，不需要请求确认。",
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

const initialToolMetadata: InitialToolMetadata[] = [
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

export function clampRealtimeClientSecretTtl(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS;
  return Math.max(10, Math.min(7200, Math.trunc(value)));
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

export function encodeRealtimeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, (char) => `__${char.charCodeAt(0).toString(16)}__`).replace(/__2e__/g, "__dot__");
}

export function createRealtimeToolSelectionTool(tools: InitialToolMetadata[]): RealtimeFunctionTool {
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

export function createInitialRealtimeTools(): RealtimeFunctionTool[] {
  return [createRealtimeToolSelectionTool(initialToolMetadata)];
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
      instructions: XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
      reasoning: {
        effort: options.reasoningEffort ?? "low"
      },
      audio: {
        input: {
          turn_detection: createRealtimeTurnDetection(options),
          transcription: createRealtimeInputTranscription()
        },
        output: {
          voice: "marin"
        }
      },
      max_output_tokens: 240,
      tool_choice: "auto",
      parallel_tool_calls: true,
      tools: createInitialRealtimeTools()
    }
  };
}
