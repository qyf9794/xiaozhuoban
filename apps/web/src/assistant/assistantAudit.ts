import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantAuditAdapter, AssistantAuditEvent } from "./AssistantHarness";

export interface AssistantCommandLog {
  id: string;
  userId?: string;
  boardId?: string;
  route: AssistantAuditEvent["route"];
  sourceMode: string;
  transcript?: string;
  toolName?: string;
  sanitizedArgs?: unknown;
  targetWidget?: unknown;
  resultStatus: string;
  resultMessage: string;
  errorCode?: string;
  confirmationState?: string;
  durationMs: number;
  createdAt: string;
}

export interface AssistantAuditContext {
  getUserId?: () => string | undefined;
  getBoardId?: () => string | undefined;
  now?: () => string;
  storageKey?: string;
}

const DEFAULT_STORAGE_KEY = "xiaozhuoban.assistant.auditLogs";
const SENSITIVE_KEY_PATTERN = /(audio|blob|base64|dataurl|data_url|token|secret|password|apikey|api_key|recording|clipboard)/i;

function createId(now: string) {
  const parsed = Date.parse(now);
  const stamp = Number.isFinite(parsed) ? parsed : Date.now();
  return `audit_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

function truncateText(value: string, maxLength = 160) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

export function sanitizeAssistantAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeAssistantAuditValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>)
      .slice(0, 24)
      .forEach(([key, item]) => {
        result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeAssistantAuditValue(item, depth + 1);
      });
    return result;
  }
  return String(value);
}

export function createAssistantCommandLog(event: AssistantAuditEvent, context: AssistantAuditContext = {}): AssistantCommandLog {
  const createdAt = context.now?.() ?? new Date().toISOString();
  const result = event.result;
  const confirmationState =
    result.status === "needs_confirmation"
      ? "pending"
      : result.status === "cancelled"
        ? "cancelled"
        : event.call?.name === "assistant.confirm"
          ? "confirmed"
          : undefined;

  return {
    id: createId(createdAt),
    userId: context.getUserId?.(),
    boardId: context.getBoardId?.(),
    route: event.route,
    sourceMode: event.call?.source ?? event.route,
    transcript: event.call?.transcript ? truncateText(event.call.transcript) : undefined,
    toolName: event.call?.name,
    sanitizedArgs: event.call ? sanitizeAssistantAuditValue(event.call.arguments) : undefined,
    targetWidget: event.result.confirmation?.target ? sanitizeAssistantAuditValue(event.result.confirmation.target) : undefined,
    resultStatus: result.status,
    resultMessage: truncateText(result.message),
    errorCode: result.errorCode,
    confirmationState,
    durationMs: Math.max(0, Math.round(event.durationMs)),
    createdAt
  };
}

export function createLocalAssistantAuditAdapter(context: AssistantAuditContext = {}): AssistantAuditAdapter {
  const storageKey = context.storageKey ?? DEFAULT_STORAGE_KEY;
  const memoryLogs: AssistantCommandLog[] = [];
  return {
    write(event) {
      const log = createAssistantCommandLog(event, context);
      if (typeof window === "undefined" || !window.localStorage) {
        memoryLogs.unshift(log);
        memoryLogs.splice(50);
        return;
      }
      const raw = window.localStorage.getItem(storageKey);
      const current = raw ? (JSON.parse(raw) as AssistantCommandLog[]) : [];
      window.localStorage.setItem(storageKey, JSON.stringify([log, ...current].slice(0, 50)));
    }
  };
}

export function createSupabaseAssistantAuditAdapter(
  client: SupabaseClient,
  context: AssistantAuditContext = {}
): AssistantAuditAdapter {
  return {
    async write(event) {
      const log = createAssistantCommandLog(event, context);
      if (!log.userId) {
        return;
      }
      const { error } = await client.from("assistant_command_logs").insert({
        id: log.id,
        user_id: log.userId,
        board_id: log.boardId ?? null,
        route: log.route,
        source_mode: log.sourceMode,
        transcript: log.transcript ?? null,
        tool_name: log.toolName ?? null,
        sanitized_args: log.sanitizedArgs ?? null,
        target_widget: log.targetWidget ?? null,
        result_status: log.resultStatus,
        result_message: log.resultMessage,
        error_code: log.errorCode ?? null,
        confirmation_state: log.confirmationState ?? null,
        duration_ms: log.durationMs,
        created_at: log.createdAt
      });
      if (error) {
        throw new Error(error.message);
      }
    }
  };
}
