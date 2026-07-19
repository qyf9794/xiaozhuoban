import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authenticateRealtimeRequest } from "../realtime/runtime-auth.js";

export type JsonObject = Record<string, unknown>;

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(payload));
}

export function readRawBody(request: IncomingMessage, maxBytes = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
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

export async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  const raw = await readRawBody(request);
  if (!raw.trim()) return {};
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_JSON_OBJECT");
  return value as JsonObject;
}

export function isWorkbenchServerEnabled() {
  return process.env.WORKBENCH_ENABLED === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.VITE_WORKBENCH_ENABLED === "true");
}

export function createWorkbenchAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_WORKBENCH_SERVER_CONFIG_MISSING");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "xiaozhuoban-workbench" } }
  });
}

export async function authenticateWorkbenchRequest(request: IncomingMessage) {
  if (!isWorkbenchServerEnabled()) return { ok: false as const, status: 404, error: "WORKBENCH_DISABLED" };
  return authenticateRealtimeRequest(request);
}

export function readHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}
