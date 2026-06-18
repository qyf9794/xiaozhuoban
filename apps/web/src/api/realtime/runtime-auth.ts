import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { createClient } from "@supabase/supabase-js";

export interface RealtimeAuthenticatedUser {
  id: string;
}

export type RealtimeAuthResult =
  | { ok: true; token: string; user: RealtimeAuthenticatedUser }
  | { ok: false; status: 401 | 500; error: string };

type SupabaseAuthWithJwt = {
  getUser: (jwt?: string) => Promise<{ data: { user: { id?: string } | null }; error: unknown }>;
};

function readHeader(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

export function extractBearerToken(headers: IncomingHttpHeaders): string {
  const authorization = readHeader(headers, "authorization").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function getSupabaseServerConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
  };
}

function isLocalE2ERealtimeAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.XIAOZHUOBAN_E2E_REALTIME_AUTH_BYPASS === "true";
}

export async function authenticateRealtimeRequest(request: IncomingMessage): Promise<RealtimeAuthResult> {
  const token = extractBearerToken(request.headers);
  if (!token) {
    if (isLocalE2ERealtimeAuthBypassEnabled()) {
      return { ok: true, token: "e2e-local-realtime-auth-bypass", user: { id: "e2e-local-user" } };
    }
    return { ok: false, status: 401, error: "AUTH_REQUIRED" };
  }

  const { url, anonKey } = getSupabaseServerConfig();
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: "SUPABASE_SERVER_CONFIG_MISSING" };
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const { data, error } = await (supabase.auth as SupabaseAuthWithJwt).getUser(token);
    if (error || !data.user?.id) {
      return { ok: false, status: 401, error: "AUTH_INVALID" };
    }
    return { ok: true, token, user: { id: data.user.id } };
  } catch {
    return { ok: false, status: 401, error: "AUTH_INVALID" };
  }
}
