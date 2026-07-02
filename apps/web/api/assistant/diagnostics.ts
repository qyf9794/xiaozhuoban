import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticateRealtimeRequest } from "../../src/api/realtime/runtime-auth.js";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS = 20;
const SENSITIVE_KEY_PATTERN = /(audio|blob|base64|dataurl|data_url|token|secret|password|apikey|api_key|recording|clipboard)/i;

function sendJson(response: ServerResponse, statusCode: number, payload: JsonValue): void {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error("BODY_TOO_LARGE"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function truncateText(value: string, maxLength = 240): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => sanitize(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>)
      .slice(0, 32)
      .forEach(([key, item]) => {
        result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitize(item, depth + 1);
      });
    return result;
  }
  return String(value);
}

function parseEvents(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const record = payload as Record<string, unknown>;
  const rawEvents = Array.isArray(record.events) ? record.events : [record];
  return rawEvents
    .filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === "object" && !Array.isArray(event))
    .slice(0, MAX_EVENTS);
}

function traceIdForEvent(event: Record<string, unknown>): string {
  return typeof event.commandTraceId === "string" && event.commandTraceId.trim()
    ? event.commandTraceId.trim()
    : typeof event.clientSessionId === "string" && event.clientSessionId.trim()
      ? event.clientSessionId.trim()
      : "unknown";
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

  let payload: unknown;
  try {
    const raw = await readBody(request);
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    sendJson(response, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, {
      error: error instanceof Error && error.message === "BODY_TOO_LARGE" ? "BODY_TOO_LARGE" : "INVALID_JSON"
    });
    return;
  }

  const events = parseEvents(payload);
  if (!events.length) {
    sendJson(response, 400, { error: "EVENTS_REQUIRED" });
    return;
  }

  const receivedAt = new Date().toISOString();
  const traceIds = [...new Set(events.map(traceIdForEvent))];
  events.forEach((event) => {
    const log = sanitize({
      marker: "xiaozhuoban.assistant.diagnostic",
      receivedAt,
      traceId: traceIdForEvent(event),
      userId: auth.user.id,
      ...event
    });
    console.info("[assistant-diagnostic]", JSON.stringify(log));
  });

  sendJson(response, 200, { ok: true, count: events.length, traceIds });
}
