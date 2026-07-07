import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import {
  OPENAI_REALTIME_CLIENT_SECRET_URL,
  createRealtimeClientSecretPayload,
  createRealtimeTurnDetection,
  type RealtimeReasoningEffort,
  type RealtimeSessionOptions
} from "../../src/api/realtime/runtime-session-config.js";
import { authenticateRealtimeRequest } from "../../src/api/realtime/runtime-auth.js";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
type RealtimeSessionRequestOptions = RealtimeSessionOptions & {
  safetyIdentifier?: string;
};

const realtimeTurnDetection = createRealtimeTurnDetection();
const REALTIME_TURN_DETECTION_HEADER = `${realtimeTurnDetection.type};eagerness=${realtimeTurnDetection.eagerness}`;
const REALTIME_PARALLEL_TOOLS_HEADER = "true";
const REALTIME_TOOL_STAGE_HEADER = "selector-only";

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
        : undefined,
    highAccuracy: record.highAccuracy === true
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

  const auth = await authenticateRealtimeRequest(request);
  if (auth.ok === false) {
    sendJson(response, auth.status, { error: auth.error });
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
  const safetyIdentifier = createOpenAISafetyIdentifier(auth.user.id);
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
