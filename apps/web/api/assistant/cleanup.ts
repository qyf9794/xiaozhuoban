import type { IncomingMessage, ServerResponse } from "node:http";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;

function sendJson(response: ServerResponse, statusCode: number, payload: JsonValue): void {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function requestUrl(request: IncomingMessage): URL {
  const host = request.headers.host ?? "localhost";
  return new URL(request.url ?? "/", `http://${host}`);
}

function authorizationHeader(request: IncomingMessage): string {
  const value = request.headers.authorization;
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isAuthorized(request: IncomingMessage): boolean {
  const authHeader = authorizationHeader(request);
  const allowedSecrets = [process.env.CRON_SECRET, process.env.ASSISTANT_LOG_CLEANUP_SECRET]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  return allowedSecrets.length > 0 && allowedSecrets.some((secret) => authHeader === `Bearer ${secret}`);
}

function parseRetentionDays(value: string | null | undefined): number {
  const parsed = Number.parseInt(value || process.env.ASSISTANT_LOG_RETENTION_DAYS || "", 10);
  const raw = Number.isFinite(parsed) ? parsed : DEFAULT_RETENTION_DAYS;
  return Math.max(MIN_RETENTION_DAYS, Math.min(MAX_RETENTION_DAYS, raw));
}

function cutoffIso(retentionDays: number): string {
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function supabaseRestBaseUrl(): string {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  return url ? `${url}/rest/v1` : "";
}

function parseContentRangeCount(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\/(\d+)$/);
  if (!match) return null;
  const count = Number.parseInt(match[1], 10);
  return Number.isFinite(count) ? count : null;
}

async function countOldAssistantLogs(restBaseUrl: string, serviceRoleKey: string, cutoff: string): Promise<number | null> {
  const response = await fetch(
    `${restBaseUrl}/assistant_command_logs?select=id&created_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        prefer: "count=exact",
        range: "0-0"
      }
    }
  );
  if (!response.ok) {
    throw new Error(`SUPABASE_COUNT_FAILED_${response.status}`);
  }
  return parseContentRangeCount(response.headers.get("content-range"));
}

async function deleteOldAssistantLogs(restBaseUrl: string, serviceRoleKey: string, cutoff: string): Promise<void> {
  const response = await fetch(
    `${restBaseUrl}/assistant_command_logs?created_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        prefer: "return=minimal"
      }
    }
  );
  if (!response.ok) {
    throw new Error(`SUPABASE_DELETE_FAILED_${response.status}`);
  }
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("allow", "GET, POST");
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "UNAUTHORIZED" });
    return;
  }

  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const restBaseUrl = supabaseRestBaseUrl();
  if (!restBaseUrl || !serviceRoleKey) {
    sendJson(response, 500, { error: "SUPABASE_CLEANUP_CONFIG_MISSING" });
    return;
  }

  const url = requestUrl(request);
  const retentionDays = parseRetentionDays(url.searchParams.get("days"));
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const cutoff = cutoffIso(retentionDays);

  try {
    const matchedRows = await countOldAssistantLogs(restBaseUrl, serviceRoleKey, cutoff);
    if (!dryRun && matchedRows !== 0) {
      await deleteOldAssistantLogs(restBaseUrl, serviceRoleKey, cutoff);
    }
    sendJson(response, 200, {
      ok: true,
      dryRun,
      table: "assistant_command_logs",
      retentionDays,
      cutoff,
      matchedRows,
      deletedRows: dryRun ? 0 : matchedRows
    });
  } catch (error) {
    sendJson(response, 502, {
      error: "ASSISTANT_LOG_CLEANUP_FAILED",
      message: error instanceof Error ? error.message : "Assistant log cleanup failed"
    });
  }
}
