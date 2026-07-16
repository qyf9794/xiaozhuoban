import { useAuthStore } from "../auth/authStore";

export type AssistantDiagnosticEvent = {
  type: string;
  realtimeBatchId?: string;
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
const LOCAL_PENDING_UPLOAD_KEY = "xiaozhuoban.assistant.pendingDiagnosticUploads";
const LOCAL_SEQUENCE_KEY = "xiaozhuoban.assistant.diagnosticSequence";
const MAX_LOCAL_EVENTS = 80;
const MAX_PERSISTENT_EVENTS = 300;
const MAX_PENDING_UPLOAD_EVENTS = 500;
const MAX_UPLOAD_BATCH_EVENTS = 20;
const SENSITIVE_KEY_PATTERN = /(audio|blob|base64|dataurl|data_url|token|secret|password|apikey|api_key|recording|clipboard)/i;

let latestUploadOptions: { accessToken: string; endpoint?: string; fetchImpl?: typeof fetch } | null = null;
let flushPromise: Promise<void> | null = null;
let flushAgainAfterCurrent = false;
let lifecycleFlushInstalled = false;

type RealtimeDiagnosticBatch = {
  id: string;
  startedAt: string;
  startedAtMs: number;
  eventCount: number;
  failureCount: number;
  commandTraceIds: Set<string>;
};

let activeRealtimeBatch: RealtimeDiagnosticBatch | null = null;

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

function createRealtimeBatchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `rtb_${crypto.randomUUID()}`;
  }
  return `rtb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function startsRealtimeBatch(event: AssistantDiagnosticEvent): boolean {
  return event.type === "voice.status" && (event.status === "connecting" || event.status === "connected");
}

function endsRealtimeBatch(event: AssistantDiagnosticEvent): boolean {
  if (event.type === "realtime.runtime.disconnect") return true;
  if (event.type !== "voice.status") return false;
  return ["disconnected", "microphone_denied", "microphone_unavailable", "session_failed"].includes(event.status ?? "");
}

function isCommandEvent(event: AssistantDiagnosticEvent): boolean {
  return [
    "realtime.voice.user_transcript",
    "voice.realtime_text_command.submit",
    "voice.text_command.submit"
  ].includes(event.type);
}

function isFailureEvent(event: AssistantDiagnosticEvent): boolean {
  const status = event.status?.toLowerCase() ?? "";
  return /(failed|error|timed_out|timeout|rejected|invalid|denied|unavailable)/.test(status);
}

function expandRealtimeBatchEvents(event: AssistantDiagnosticEvent): AssistantDiagnosticEvent[] {
  const expanded: AssistantDiagnosticEvent[] = [];

  if (startsRealtimeBatch(event) && !activeRealtimeBatch) {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    activeRealtimeBatch = {
      id: createRealtimeBatchId(),
      startedAt,
      startedAtMs,
      eventCount: 0,
      failureCount: 0,
      commandTraceIds: new Set<string>()
    };
    expanded.push({
      type: "realtime.batch.started",
      realtimeBatchId: activeRealtimeBatch.id,
      status: "started",
      data: { startedAt, trigger: `${event.type}:${event.status}` }
    });
  }

  const batch = activeRealtimeBatch;
  if (!batch) return [event];

  const batchedEvent = { ...event, realtimeBatchId: batch.id };
  expanded.push(batchedEvent);
  batch.eventCount += 1;
  if (isFailureEvent(event)) batch.failureCount += 1;
  if (isCommandEvent(event) && event.commandTraceId) batch.commandTraceIds.add(event.commandTraceId);

  if (endsRealtimeBatch(event)) {
    const endedAtMs = Date.now();
    const endedAt = new Date(endedAtMs).toISOString();
    expanded.push({
      type: "realtime.batch.ended",
      realtimeBatchId: batch.id,
      status: "ended",
      data: {
        startedAt: batch.startedAt,
        endedAt,
        durationMs: Math.max(0, endedAtMs - batch.startedAtMs),
        reason: event.status ?? event.type,
        eventCount: batch.eventCount,
        commandCount: batch.commandTraceIds.size,
        failureCount: batch.failureCount
      }
    });
    activeRealtimeBatch = null;
  }

  return expanded;
}

export function getActiveRealtimeDiagnosticBatchId(): string | undefined {
  return activeRealtimeBatch?.id;
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

function readPendingUploadBuffer(): Record<string, unknown>[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_PENDING_UPLOAD_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

function writePendingUploadBuffer(events: Record<string, unknown>[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_PENDING_UPLOAD_KEY, JSON.stringify(events.slice(-MAX_PENDING_UPLOAD_EVENTS)));
}

function pendingUploadKey(event: Record<string, unknown>): string {
  return [
    typeof event.clientSessionId === "string" ? event.clientSessionId : "",
    typeof event.clientEventIndex === "number" || typeof event.clientEventIndex === "string" ? String(event.clientEventIndex) : "",
    typeof event.type === "string" ? event.type : "",
    typeof event.clientCreatedAt === "string" ? event.clientCreatedAt : ""
  ].join("|");
}

function enqueuePendingUpload(event: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const nextByKey = new Map<string, Record<string, unknown>>();
    [...readPendingUploadBuffer(), event].forEach((item) => {
      nextByKey.set(pendingUploadKey(item), item);
    });
    writePendingUploadBuffer([...nextByKey.values()]);
  } catch {
    // Diagnostics are best-effort only.
  }
}

function removePendingUploads(sentEvents: Record<string, unknown>[]): void {
  if (typeof window === "undefined") return;
  try {
    const sentKeys = new Set(sentEvents.map(pendingUploadKey));
    writePendingUploadBuffer(readPendingUploadBuffer().filter((event) => !sentKeys.has(pendingUploadKey(event))));
  } catch {
    // Diagnostics are best-effort only.
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
    pendingDiagnosticUploads: readPendingUploadBuffer(),
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
    return { events: [], persistentTraceEvents: [], pendingDiagnosticUploads: [], lastHarnessDiagnostics: null };
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
    persistentTraceEvents: readPersistentTraceBuffer(),
    pendingDiagnosticUploads: readPendingUploadBuffer(),
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
    window.localStorage.removeItem(LOCAL_PENDING_UPLOAD_KEY);
  } catch {
    // Local diagnostics are best-effort only.
  }
  latestUploadOptions = null;
  activeRealtimeBatch = null;
  window.__xiaozhuobanAssistantDiagnostics = null;
  publishLocalExports([]);
}

function installLifecycleFlush(): void {
  if (typeof window === "undefined" || lifecycleFlushInstalled) return;
  lifecycleFlushInstalled = true;
  const flushLatest = () => {
    if (!latestUploadOptions) return;
    void flushPendingAssistantDiagnostics(latestUploadOptions);
  };
  window.addEventListener("pagehide", flushLatest);
  window.addEventListener("visibilitychange", () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      flushLatest();
    }
  });
  window.addEventListener("online", flushLatest);
}

export async function flushPendingAssistantDiagnostics(
  options: { accessToken: string; endpoint?: string; fetchImpl?: typeof fetch }
): Promise<void> {
  if (typeof window === "undefined") return;
  const accessToken = options.accessToken.trim();
  if (!accessToken) return;

  if (flushPromise) {
    flushAgainAfterCurrent = true;
    return flushPromise;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  flushPromise = (async () => {
    do {
      flushAgainAfterCurrent = false;
      const pending = readPendingUploadBuffer();
      if (!pending.length) return;
      const batch = pending.slice(0, MAX_UPLOAD_BATCH_EVENTS);
      try {
        const response = await fetchImpl(options.endpoint ?? "/api/assistant/diagnostics", {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ events: batch }),
          keepalive: true
        });
        if (!response.ok) return;
        removePendingUploads(batch);
      } catch {
        return;
      }
    } while (readPendingUploadBuffer().length > 0 || flushAgainAfterCurrent);
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

export async function recordAssistantDiagnostic(
  event: AssistantDiagnosticEvent,
  options: { accessToken?: string; endpoint?: string; fetchImpl?: typeof fetch } = {}
): Promise<void> {
  if (typeof window === "undefined") return;
  const payloads = expandRealtimeBatchEvents(event)
    .map((expandedEvent) => appendLocalAssistantDiagnostic(expandedEvent))
    .filter((payload): payload is Record<string, unknown> => Boolean(payload));
  const accessToken = options.accessToken?.trim();
  if (!accessToken) return;
  if (!payloads.length) return;

  latestUploadOptions = { accessToken, endpoint: options.endpoint, fetchImpl: options.fetchImpl };
  installLifecycleFlush();
  payloads.forEach(enqueuePendingUpload);
  await flushPendingAssistantDiagnostics(latestUploadOptions);
}

export function recordAuthenticatedAssistantDiagnostic(event: AssistantDiagnosticEvent): void {
  void recordAssistantDiagnostic(event, {
    accessToken: useAuthStore.getState().session?.access_token
  });
}
