import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import {
  OPENAI_REALTIME_CLIENT_SECRET_URL,
  createRealtimeClientSecretPayload,
  type RealtimeSessionOptions
} from "../../src/assistant/realtimeSessionConfig";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
type RealtimeSessionRequestOptions = RealtimeSessionOptions & {
  safetyIdentifier?: string;
};

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

  const upstream = await fetch(OPENAI_REALTIME_CLIENT_SECRET_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(createRealtimeClientSecretPayload(options))
  });

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
