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
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { pathname: "/app" },
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      }
    }
  });
  vi.stubGlobal("document", { visibilityState: "visible" });
  vi.stubGlobal("crypto", { randomUUID: () => "test-session" });
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
    installBrowserGlobals();
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
  });
});
