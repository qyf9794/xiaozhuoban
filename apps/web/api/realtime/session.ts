import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
type RealtimeReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
type RealtimeSemanticVadEagerness = "low" | "medium" | "high" | "auto";
type RealtimeSessionOptions = {
  ttlSeconds?: number;
  reasoningEffort?: RealtimeReasoningEffort;
  turnDetectionEagerness?: RealtimeSemanticVadEagerness;
};
type RealtimeSessionRequestOptions = RealtimeSessionOptions & {
  safetyIdentifier?: string;
};

const OPENAI_REALTIME_CLIENT_SECRET_URL = "https://api.openai.com/v1/realtime/client_secrets";
const XIAOZHUOBAN_REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS = 600;
const REALTIME_TURN_DETECTION_HEADER = "semantic_vad;eagerness=low";
const REALTIME_PARALLEL_TOOLS_HEADER = "true";
const REALTIME_TOOL_STAGE_HEADER = "selector-only";
const REALTIME_TOOL_SELECTION_TOOL_NAME = "assistant.select_tool";

const XIAOZHUOBAN_REALTIME_INSTRUCTIONS = [
  "# Role and Objective",
  "你是小桌板里的语音助手，负责控制小桌板 Web 桌面、已加载小工具和已注册工具。",
  "",
  "# Tool Policy",
  "- 常驻阶段只选择工具，不直接生成真实工具参数。",
  "- 需要控制桌面时，先调用 assistant.select_tool，让前端按所选工具提供最小必要上下文。",
  "- 前端提供局部上下文后，只调用已选工具；工具缺失时再简短说明缺少对应能力。",
  "- 删除、覆盖、批量操作必须请求确认。",
  "- 不控制 macOS、Windows、浏览器外部桌面或用户本地系统。",
  "- 不调用 Codex 或浏览器外部系统；动态生成、复杂规划和长文本改写需要对应工具注册后才执行。",
  "",
  "# Context",
  "默认不会收到完整桌面状态。不要要求完整桌面状态，也不要输出完整 widget payload。",
  "",
  "# Voice Style",
  "回复要短，通常一句话。成功时说“好了”或简短结果；不支持时说明缺少哪个工具或目标。"
].join("\n");

function objectSchema(properties: Record<string, unknown>, required?: string[], additionalProperties = false) {
  return {
    type: "object",
    properties,
    ...(required?.length ? { required } : {}),
    additionalProperties
  };
}

function realtimeTool(name: string, description: string, parameters: Record<string, unknown>) {
  return {
    type: "function",
    name: encodeRealtimeToolName(name),
    description,
    parameters
  };
}

function encodeRealtimeToolName(name: string): string {
  return name.replace(/\./g, "__dot__");
}

function clampRealtimeClientSecretTtl(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS;
  }
  return Math.max(10, Math.min(7200, Math.floor(value)));
}

function createInitialRealtimeTools() {
  const names = createRegisteredRealtimeToolNames();
  return [
    realtimeTool(
      REALTIME_TOOL_SELECTION_TOOL_NAME,
      "Select the single best registered Xiaozhuoban tool before any desktop context is provided.",
      objectSchema(
        {
          name: {
            type: "string",
            enum: names,
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
    )
  ];
}

function createRegisteredRealtimeToolNames() {
  return [
    "board.add_widget",
    "widget.focus",
    "widget.fullscreen_focus",
    "widget.remove",
    "widget.move",
    "widget.resize",
    "widget.bring_to_front",
    "board.auto_align",
    "board.switch",
    "board.create",
    "board.rename"
  ];
}

function createRealtimeTurnDetection(options: RealtimeSessionOptions = {}) {
  return {
    type: "semantic_vad",
    eagerness: options.turnDetectionEagerness ?? "low",
    create_response: true,
    interrupt_response: true
  };
}

function createRealtimeClientSecretPayload(options: RealtimeSessionOptions = {}) {
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

function sendJson(response: ServerResponse, statusCode: number, payload: JsonValue): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function createOpenAISafetyIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return `xz_${createHash("sha256").update(trimmed).digest("base64url")}`;
}

function parseOptions(value: unknown): RealtimeSessionRequestOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    ttlSeconds: typeof record.ttlSeconds === "number" ? record.ttlSeconds : undefined,
    safetyIdentifier: typeof record.safetyIdentifier === "string" ? record.safetyIdentifier : undefined,
    reasoningEffort:
      record.reasoningEffort === "minimal" ||
      record.reasoningEffort === "low" ||
      record.reasoningEffort === "medium" ||
      record.reasoningEffort === "high" ||
      record.reasoningEffort === "xhigh"
        ? record.reasoningEffort
        : undefined
  };
}

async function readJsonOptions(request: IncomingMessage): Promise<RealtimeSessionRequestOptions> {
  const raw = await readBody(request);
  if (!raw.trim()) {
    return {};
  }
  try {
    return parseOptions(JSON.parse(raw));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(response, 500, { error: "OPENAI_API_KEY_MISSING" });
    return;
  }

  let options: RealtimeSessionRequestOptions;
  try {
    options = await readJsonOptions(request);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      sendJson(response, 400, { error: "INVALID_JSON" });
      return;
    }
    throw error;
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json"
  };
  const safetyIdentifier = createOpenAISafetyIdentifier(options.safetyIdentifier);
  if (safetyIdentifier) {
    headers["OpenAI-Safety-Identifier"] = safetyIdentifier;
  }

  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_REALTIME_CLIENT_SECRET_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(createRealtimeClientSecretPayload(options))
    });
  } catch (error) {
    sendJson(response, 502, {
      error: "OPENAI_REALTIME_SESSION_REQUEST_FAILED",
      message: error instanceof Error ? error.message : "Realtime session request failed"
    });
    return;
  }

  const text = await upstream.text();
  let payload: JsonValue;
  try {
    payload = text ? (JSON.parse(text) as JsonValue) : {};
  } catch {
    payload = { error: "OPENAI_REALTIME_SESSION_RESPONSE_PARSE_FAILED", body: text };
  }

  if (!upstream.ok) {
    sendJson(response, upstream.status || 502, {
      error: "OPENAI_REALTIME_SESSION_CREATE_FAILED",
      status: upstream.status,
      payload
    });
    return;
  }

  response.setHeader("x-xiaozhuoban-realtime-turn-detection", REALTIME_TURN_DETECTION_HEADER);
  response.setHeader("x-xiaozhuoban-realtime-parallel-tools", REALTIME_PARALLEL_TOOLS_HEADER);
  response.setHeader("x-xiaozhuoban-realtime-tool-stage", REALTIME_TOOL_STAGE_HEADER);
  sendJson(response, 200, payload);
}
