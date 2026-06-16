import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createScopedToolCallPayload,
  createToolSelectionPayload,
  extractAssistantToolCallFromResponsesPayload,
  extractToolSelectionFromResponsesPayload,
  type RealtimeTextToolCallRequest
} from "../../src/assistant/realtimeTextToolCall.js";
import { XIAOZHUOBAN_REALTIME_MODEL } from "../../src/assistant/realtimeSessionConfig.js";

type JsonBody = Record<string, unknown>;

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

function parseRequestBody(value: unknown): RealtimeTextToolCallRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.input !== "string" || !isRecord(value.context) || !Array.isArray(value.tools)) return null;
  return {
    input: value.input,
    context: value.context as unknown as RealtimeTextToolCallRequest["context"],
    tools: value.tools as RealtimeTextToolCallRequest["tools"]
  };
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      sendJson(response, 503, { error: "OPENAI_API_KEY_MISSING" });
      return;
    }

    let body: RealtimeTextToolCallRequest | null;
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
    const model = process.env.XIAOZHUOBAN_TEXT_TOOL_MODEL || XIAOZHUOBAN_REALTIME_MODEL;
    const selectionResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(createToolSelectionPayload(body, { model }))
    });

    if (!selectionResponse.ok) {
      let upstream: unknown = null;
      try {
        upstream = await selectionResponse.json();
      } catch {
        // Keep the structured status without leaking raw text.
      }
      sendJson(response, 502, {
        error: "TEXT_TOOL_SELECTION_FAILED",
        model,
        status: selectionResponse.status,
        upstream
      });
      return;
    }

    const selectionPayload = await selectionResponse.json();
    const selection = extractToolSelectionFromResponsesPayload(selectionPayload, allowedToolNames);
    if (!selection) {
      sendJson(response, 200, { call: null, selection: null });
      return;
    }

    const toolCallResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(createScopedToolCallPayload(body, selection, { model }))
    });

    if (!toolCallResponse.ok) {
      let upstream: unknown = null;
      try {
        upstream = await toolCallResponse.json();
      } catch {
        // Keep the structured status without leaking raw text.
      }
      sendJson(response, 502, {
        error: "TEXT_TOOL_CALL_FAILED",
        model,
        status: toolCallResponse.status,
        upstream
      });
      return;
    }

    const payload = await toolCallResponse.json();
    sendJson(response, 200, {
      selection,
      call: extractAssistantToolCallFromResponsesPayload(payload, allowedToolNames)
    });
  } catch (error) {
    sendJson(response, 500, {
      error: "TEXT_TOOL_CALL_UNHANDLED",
      message: error instanceof Error ? error.message : "Unknown realtime text tool-call error"
    });
  }
}
