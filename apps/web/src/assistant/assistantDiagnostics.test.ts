import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalAssistantDiagnostics,
  exportLocalAssistantDiagnostics,
  publishAssistantHarnessDiagnostics,
  recordAssistantDiagnostic,
  sanitizeAssistantDiagnosticValue
} from "./assistantDiagnostics";

afterEach(() => {
  vi.restoreAllMocks();
  clearLocalAssistantDiagnostics();
  vi.unstubAllGlobals();
});

function installBrowserGlobals() {
  const sessionStore = new Map<string, string>();
  const localStore = new Map<string, string>();
  const createStorage = (store: Map<string, string>) => ({
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    }
  });
  vi.stubGlobal("window", {
    location: { origin: "https://xiaozhuoban.bqxb.org", pathname: "/app" },
    sessionStorage: createStorage(sessionStore),
    localStorage: createStorage(localStore),
    addEventListener: vi.fn()
  });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.stubGlobal("crypto", { randomUUID: () => "test-session" });
  return { sessionStore, localStore };
}

describe("assistant diagnostics", () => {
  it("redacts sensitive fields and truncates large values", () => {
    const sanitized = sanitizeAssistantDiagnosticValue({
      token: "secret",
      nested: { apiKey: "secret", message: "x".repeat(260) },
      events: Array.from({ length: 20 }, (_, index) => ({ index }))
    }) as Record<string, unknown>;

    expect(sanitized.token).toBe("[redacted]");
    expect(sanitized.nested).toMatchObject({ apiKey: "[redacted]" });
    expect(JSON.stringify(sanitized)).not.toContain("secret");
    expect(((sanitized.events as unknown[]) ?? [])).toHaveLength(12);
    expect(JSON.stringify(sanitized)).toContain("...");
  });

  it("does not send diagnostics without an access token", async () => {
    const fetchImpl = vi.fn();

    await recordAssistantDiagnostic({ type: "voice.status", status: "connected" }, { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps a local redacted diagnostic buffer even without an access token", async () => {
    const { localStore } = installBrowserGlobals();
    const fetchImpl = vi.fn();

    await recordAssistantDiagnostic(
      {
        type: "realtime.session.failed",
        commandTraceId: "trace_diag_1",
        status: "400",
        data: { token: "secret", message: "bad session" }
      },
      { fetchImpl }
    );
    publishAssistantHarnessDiagnostics({ rawInput: "打开音乐", dataUrl: "private" });

    const exported = exportLocalAssistantDiagnostics() as {
      events: Array<Record<string, unknown>>;
      lastHarnessDiagnostics: Record<string, unknown>;
    };
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(exported.events).toHaveLength(1);
    expect(exported.events[0]).toMatchObject({ type: "realtime.session.failed", commandTraceId: "trace_diag_1", status: "400" });
    expect(JSON.stringify(exported)).toContain("bad session");
    expect(JSON.stringify(exported)).not.toContain("secret");
    expect(JSON.stringify(exported)).not.toContain("private");
    expect(exported.lastHarnessDiagnostics.rawInput).toBe("打开音乐");
    expect(localStore.get("xiaozhuoban.assistant.traceEvents")).toContain("trace_diag_1");
  });

  it("sends the same trace payload to the backend batch while keeping persistent local trace", async () => {
    const { localStore } = installBrowserGlobals();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await recordAssistantDiagnostic(
      {
        type: "realtime.function_call.tool",
        commandTraceId: "voice_trace_1",
        status: "received",
        toolName: "music.play",
        data: { query: "王菲", apiKey: "secret" }
      },
      { accessToken: "user-token", fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [unknown, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      type: "realtime.function_call.tool",
      commandTraceId: "voice_trace_1",
      clientSessionId: "diag_test-session",
      clientEventIndex: 1,
      pageUrl: "https://xiaozhuoban.bqxb.org/app"
    });
    expect(body.events[0].data).toMatchObject({ query: "王菲", apiKey: "[redacted]" });
    const persistent = JSON.parse(localStore.get("xiaozhuoban.assistant.traceEvents") || "[]");
    expect(persistent).toHaveLength(1);
    expect(persistent[0]).toMatchObject({ commandTraceId: "voice_trace_1", clientEventIndex: 1 });
    expect(JSON.parse(localStore.get("xiaozhuoban.assistant.pendingDiagnosticUploads") || "[]")).toHaveLength(0);
  });

  it("keeps failed uploads pending and resends them with the next diagnostic batch", async () => {
    const { localStore } = installBrowserGlobals();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await recordAssistantDiagnostic({ type: "realtime.voice.user_transcript", status: "success" }, { accessToken: "user-token", fetchImpl });
    expect(JSON.parse(localStore.get("xiaozhuoban.assistant.pendingDiagnosticUploads") || "[]")).toHaveLength(1);

    await recordAssistantDiagnostic({ type: "realtime.function_call.selection", status: "received" }, { accessToken: "user-token", fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, retryInit] = fetchImpl.mock.calls[1] as unknown as [unknown, RequestInit];
    const retryBody = JSON.parse(String(retryInit.body));
    expect(retryBody.events.map((event: Record<string, unknown>) => event.type)).toEqual([
      "realtime.voice.user_transcript",
      "realtime.function_call.selection"
    ]);
    expect(JSON.parse(localStore.get("xiaozhuoban.assistant.pendingDiagnosticUploads") || "[]")).toHaveLength(0);
  });

  it("groups diagnostics from one realtime connection into a searchable batch", async () => {
    installBrowserGlobals();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const options = { accessToken: "user-token", fetchImpl };

    await recordAssistantDiagnostic({ type: "voice.status", status: "connecting" }, options);
    await recordAssistantDiagnostic(
      { type: "realtime.voice.user_transcript", commandTraceId: "voice_trace_batch_1", status: "success" },
      options
    );
    await recordAssistantDiagnostic(
      { type: "realtime.function_call.tool", commandTraceId: "voice_trace_batch_1", status: "failed" },
      options
    );
    await recordAssistantDiagnostic({ type: "realtime.runtime.disconnect", status: "manual" }, options);

    const requests = fetchImpl.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const events = requests.flatMap(([, init]) =>
      JSON.parse(String(init.body)).events as Array<Record<string, unknown>>
    );
    expect(events.map((event) => event.type)).toEqual([
      "realtime.batch.started",
      "voice.status",
      "realtime.voice.user_transcript",
      "realtime.function_call.tool",
      "realtime.runtime.disconnect",
      "realtime.batch.ended"
    ]);
    expect(new Set(events.map((event) => event.realtimeBatchId))).toEqual(new Set(["rtb_test-session"]));
    expect(events.at(-1)).toMatchObject({
      type: "realtime.batch.ended",
      realtimeBatchId: "rtb_test-session",
      data: {
        reason: "manual",
        eventCount: 4,
        commandCount: 1,
        failureCount: 1
      }
    });
  });

  it("closes a realtime batch when the connection fails before becoming ready", async () => {
    installBrowserGlobals();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const options = { accessToken: "user-token", fetchImpl };

    await recordAssistantDiagnostic({ type: "voice.status", status: "connecting" }, options);
    await recordAssistantDiagnostic({ type: "voice.status", status: "session_failed" }, options);

    const requests = fetchImpl.mock.calls as unknown as Array<[unknown, RequestInit]>;
    const events = requests.flatMap(([, init]) =>
      JSON.parse(String(init.body)).events as Array<Record<string, unknown>>
    );
    expect(events.at(-1)).toMatchObject({
      type: "realtime.batch.ended",
      realtimeBatchId: "rtb_test-session",
      data: { reason: "session_failed", eventCount: 2, commandCount: 0, failureCount: 1 }
    });
  });

  it("starts a fallback batch when the first observed status is already connected", async () => {
    installBrowserGlobals();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await recordAssistantDiagnostic(
      { type: "voice.status", status: "connected" },
      { accessToken: "user-token", fetchImpl }
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [unknown, RequestInit];
    const events = JSON.parse(String(init.body)).events as Array<Record<string, unknown>>;
    expect(events).toMatchObject([
      { type: "realtime.batch.started", realtimeBatchId: "rtb_test-session" },
      { type: "voice.status", status: "connected", realtimeBatchId: "rtb_test-session" }
    ]);
  });
});
