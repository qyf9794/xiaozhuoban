import { useAuthStore } from "../auth/authStore";

export type AssistantDiagnosticEvent = {
  type: string;
  commandTraceId?: string;
  status?: string;
  source?: string;
  operationId?: string;
  route?: string;
  toolName?: string;
  phase?: string;
  message?: string;
  errorCode?: string;
  durationMs?: number;
  data?: Record<string, unknown>;
};

const SESSION_STORAGE_KEY = "xiaozhuoban.assistant.diagnosticSessionId";
const LOCAL_BUFFER_KEY = "xiaozhuoban.assistant.diagnosticBuffer";
const LOCAL_SNAPSHOT_KEY = "xiaozhuoban.assistant.lastHarnessDiagnostics";
const LOCAL_PERSISTENT_TRACE_KEY = "xiaozhuoban.assistant.traceEvents";
const LOCAL_SEQUENCE_KEY = "xiaozhuoban.assistant.diagnosticSequence";
const MAX_LOCAL_EVENTS = 80;
const MAX_PERSISTENT_EVENTS = 300;
const SENSITIVE_KEY_PATTERN = /(audio|blob|base64|dataurl|data_url|token|secret|password|apikey|api_key|recording|clipboard)/i;

declare global {
  interface Window {
    __xiaozhuobanAssistantDiagnostics?: unknown;
    __xiaozhuobanAssistantDiagnosticEvents?: unknown;
    __xiaozhuobanExportAssistantDiagnostics?: () => unknown;
  }
}

function createDiagnosticSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `diag_${crypto.randomUUID()}`;
  }
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getAssistantDiagnosticSessionId(): string {
  if (typeof window === "undefined") return createDiagnosticSessionId();
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = createDiagnosticSessionId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return createDiagnosticSessionId();
  }
}

function truncateText(value: string, maxLength = 240): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

export function sanitizeAssistantDiagnosticValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => sanitizeAssistantDiagnosticValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>)
      .slice(0, 32)
      .forEach(([key, item]) => {
        result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeAssistantDiagnosticValue(item, depth + 1);
      });
    return result;
  }
  return String(value);
}

function readLocalBuffer(): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(LOCAL_BUFFER_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readPersistentTraceBuffer(): unknown[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_PERSISTENT_TRACE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function nextDiagnosticSequence(): number {
  if (typeof window === "undefined") return 1;
  try {
    const current = Number.parseInt(window.sessionStorage.getItem(LOCAL_SEQUENCE_KEY) || "0", 10);
    const next = Number.isFinite(current) ? current + 1 : 1;
    window.sessionStorage.setItem(LOCAL_SEQUENCE_KEY, String(next));
    return next;
  } catch {
    return Date.now();
  }
}

function getCurrentPageUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return `${window.location.origin}${window.location.pathname}`;
  } catch {
    return undefined;
  }
}

function createDiagnosticPayload(event: AssistantDiagnosticEvent): Record<string, unknown> {
  return sanitizeAssistantDiagnosticValue({
    ...event,
    clientSessionId: getAssistantDiagnosticSessionId(),
    clientEventIndex: nextDiagnosticSequence(),
    clientCreatedAt: new Date().toISOString(),
    pagePath: typeof window === "undefined" ? undefined : window.location.pathname,
    pageUrl: getCurrentPageUrl(),
    visibilityState: typeof document === "undefined" ? undefined : document.visibilityState
  }) as Record<string, unknown>;
}

function publishLocalExports(events: unknown[]): void {
  if (typeof window === "undefined") return;
  window.__xiaozhuobanAssistantDiagnosticEvents = events;
  window.__xiaozhuobanExportAssistantDiagnostics = () => ({
    sessionId: getAssistantDiagnosticSessionId(),
    exportedAt: new Date().toISOString(),
    events: readLocalBuffer(),
    persistentTraceEvents: readPersistentTraceBuffer(),
    lastHarnessDiagnostics: window.__xiaozhuobanAssistantDiagnostics ?? null
  });
}

export function appendLocalAssistantDiagnostic(event: AssistantDiagnosticEvent): Record<string, unknown> | undefined {
  if (typeof window === "undefined") return undefined;
  const sanitized = createDiagnosticPayload(event);
  try {
    const next = [...readLocalBuffer(), sanitized].slice(-MAX_LOCAL_EVENTS);
    window.sessionStorage.setItem(LOCAL_BUFFER_KEY, JSON.stringify(next));
    window.localStorage.setItem(
      LOCAL_PERSISTENT_TRACE_KEY,
      JSON.stringify([...readPersistentTraceBuffer(), sanitized].slice(-MAX_PERSISTENT_EVENTS))
    );
    publishLocalExports(next);
  } catch {
    publishLocalExports([sanitized]);
  }
  return sanitized;
}

export function publishAssistantHarnessDiagnostics(snapshot: unknown): void {
  if (typeof window === "undefined") return;
  const sanitized = sanitizeAssistantDiagnosticValue(snapshot);
  window.__xiaozhuobanAssistantDiagnostics = sanitized;
  try {
    window.sessionStorage.setItem(LOCAL_SNAPSHOT_KEY, JSON.stringify(sanitized));
  } catch {
    // Local diagnostics are best-effort only.
  }
  publishLocalExports(readLocalBuffer());
}

export function exportLocalAssistantDiagnostics(): unknown {
  if (typeof window === "undefined") {
    return { events: [], lastHarnessDiagnostics: null };
  }
  let lastHarnessDiagnostics: unknown = window.__xiaozhuobanAssistantDiagnostics ?? null;
  if (!lastHarnessDiagnostics) {
    try {
      lastHarnessDiagnostics = JSON.parse(window.sessionStorage.getItem(LOCAL_SNAPSHOT_KEY) || "null");
    } catch {
      lastHarnessDiagnostics = null;
    }
  }
  return {
    sessionId: getAssistantDiagnosticSessionId(),
    exportedAt: new Date().toISOString(),
    events: readLocalBuffer(),
    lastHarnessDiagnostics
  };
}

export function clearLocalAssistantDiagnostics(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(LOCAL_BUFFER_KEY);
    window.sessionStorage.removeItem(LOCAL_SNAPSHOT_KEY);
    window.sessionStorage.removeItem(LOCAL_SEQUENCE_KEY);
    window.localStorage.removeItem(LOCAL_PERSISTENT_TRACE_KEY);
  } catch {
    // Local diagnostics are best-effort only.
  }
  window.__xiaozhuobanAssistantDiagnostics = null;
  publishLocalExports([]);
}

export async function recordAssistantDiagnostic(
  event: AssistantDiagnosticEvent,
  options: { accessToken?: string; endpoint?: string; fetchImpl?: typeof fetch } = {}
): Promise<void> {
  if (typeof window === "undefined") return;
  const payload = appendLocalAssistantDiagnostic(event);
  const accessToken = options.accessToken?.trim();
  if (!accessToken) return;
  if (!payload) return;

  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    await fetchImpl(options.endpoint ?? "/api/assistant/diagnostics", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch {
    // Diagnostics must never affect assistant behavior.
  }
}

export function recordAuthenticatedAssistantDiagnostic(event: AssistantDiagnosticEvent): void {
  void recordAssistantDiagnostic(event, {
    accessToken: useAuthStore.getState().session?.access_token
  });
}
