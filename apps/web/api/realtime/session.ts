import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
type RealtimeReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
type RealtimeSessionOptions = {
  ttlSeconds?: number;
  reasoningEffort?: RealtimeReasoningEffort;
};
type RealtimeSessionRequestOptions = RealtimeSessionOptions & {
  safetyIdentifier?: string;
};

const OPENAI_REALTIME_CLIENT_SECRET_URL = "https://api.openai.com/v1/realtime/client_secrets";
const XIAOZHUOBAN_REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS = 600;

const XIAOZHUOBAN_REALTIME_INSTRUCTIONS = [
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

function stringSchema() {
  return { type: "string" };
}

function numberSchema() {
  return { type: "number" };
}

function booleanSchema() {
  return { type: "boolean" };
}

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
  return [
    realtimeTool(
      "board.add_widget",
      "Add an existing widget definition to the current Xiaozhuoban board.",
      objectSchema(
        {
          definitionId: stringSchema(),
          mobileMode: booleanSchema(),
          followUp: objectSchema({ name: stringSchema(), arguments: objectSchema({}, undefined, true) }, ["name"])
        },
        ["definitionId"]
      )
    ),
    realtimeTool(
      "widget.focus",
      "Focus an existing widget on the current Xiaozhuoban board.",
      objectSchema({ widgetId: stringSchema() }, ["widgetId"])
    ),
    realtimeTool(
      "widget.fullscreen_focus",
      "Enter fullscreen focus for an existing widget when supported.",
      objectSchema({ widgetId: stringSchema() }, ["widgetId"])
    ),
    realtimeTool(
      "widget.remove",
      "Remove a widget from the current board after confirmation.",
      objectSchema({ widgetId: stringSchema() }, ["widgetId"])
    ),
    realtimeTool(
      "widget.move",
      "Move a widget to a new board position.",
      objectSchema({ widgetId: stringSchema(), x: numberSchema(), y: numberSchema() }, ["widgetId", "x", "y"])
    ),
    realtimeTool(
      "widget.resize",
      "Resize a widget only when its existing panel supports resizing.",
      objectSchema({ widgetId: stringSchema(), w: numberSchema(), h: numberSchema() }, ["widgetId", "w", "h"])
    ),
    realtimeTool(
      "widget.bring_to_front",
      "Bring a widget to the front when layer changes are available.",
      objectSchema({ widgetId: stringSchema() }, ["widgetId"])
    ),
    realtimeTool(
      "board.auto_align",
      "Auto-align widgets on the current board. Requires confirmation.",
      objectSchema({ viewportWidth: numberSchema(), mobileMode: booleanSchema() })
    ),
    realtimeTool("board.switch", "Switch to another Xiaozhuoban board.", objectSchema({ boardId: stringSchema() }, ["boardId"])),
    realtimeTool("board.create", "Create a new Xiaozhuoban board.", objectSchema({ name: stringSchema() })),
    realtimeTool(
      "board.rename",
      "Rename an existing Xiaozhuoban board.",
      objectSchema({ boardId: stringSchema(), name: stringSchema() }, ["boardId", "name"])
    ),
    realtimeTool(
      "assistant.out_of_scope",
      "Return a short stage-one out-of-scope response without planning or server tool calls.",
      objectSchema(
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
    )
  ];
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
          turn_detection: {
            type: "semantic_vad"
          }
        },
        output: {
          voice: "marin"
        }
      },
      max_output_tokens: 120,
      tool_choice: "auto",
      parallel_tool_calls: false,
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
  return `xz:${createHash("sha256").update(trimmed).digest("hex")}`;
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

  sendJson(response, 200, payload);
}
