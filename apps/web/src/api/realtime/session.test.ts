import type { IncomingHttpHeaders } from "node:http";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { createOpenAISafetyIdentifier } from "../../../api/realtime/session.js";

class MockResponse {
  statusCode = 200;
  body = "";
  headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  end(body: string): void {
    this.body = body;
  }
}

async function callHandler(body = "", headers: IncomingHttpHeaders = { authorization: "Bearer supabase-token" }) {
  const request = Readable.from(body ? [Buffer.from(body)] : []) as Readable & {
    method?: string;
    headers?: IncomingHttpHeaders;
  };
  request.method = "POST";
  request.headers = headers;
  const response = new MockResponse();
  await handler(request as never, response as never);
  return response;
}

function stubSupabaseEnv() {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test");
}

function createSupabaseUserResponse(userId = "user_123") {
  return new Response(JSON.stringify({ id: userId, aud: "authenticated", role: "authenticated" }), { status: 200 });
}

describe("realtime session API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a server-side OpenAI API key", async () => {
    stubSupabaseEnv();
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => createSupabaseUserResponse()));

    const response = await callHandler();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: "OPENAI_API_KEY_MISSING" });
  });

  it("requires a Supabase bearer token before creating a Realtime session", async () => {
    stubSupabaseEnv();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callHandler("", {});

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: "AUTH_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows local E2E Realtime auth bypass without a bearer token outside production", async () => {
    stubSupabaseEnv();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("XIAOZHUOBAN_E2E_REALTIME_AUTH_BYPASS", "true");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: "client-secret" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callHandler("", {});

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ value: "client-secret" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 for expired Supabase tokens and does not call OpenAI", async () => {
    stubSupabaseEnv();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ msg: "JWT expired" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callHandler();

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: "AUTH_INVALID" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hashes the authenticated Supabase user id before sending it to OpenAI", async () => {
    stubSupabaseEnv();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createSupabaseUserResponse("user_123"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "client-secret" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callHandler(JSON.stringify({ safetyIdentifier: " forged_user ", ttlSeconds: 120 }));

    expect(response.statusCode).toBe(200);
    expect(response.headers.get("x-xiaozhuoban-realtime-turn-detection")).toBe("semantic_vad;eagerness=low");
    expect(response.headers.get("x-xiaozhuoban-realtime-parallel-tools")).toBe("true");
    expect(response.headers.get("x-xiaozhuoban-realtime-tool-stage")).toBe("selector-only");
    const [, init] = fetchMock.mock.calls[1] as [RequestInfo | URL, RequestInit];
    expect(init?.headers).toMatchObject({
      authorization: "Bearer sk-test",
      "OpenAI-Safety-Identifier": createOpenAISafetyIdentifier("user_123")
    });
    const safetyIdentifier = createOpenAISafetyIdentifier("user_123");
    expect(safetyIdentifier).not.toContain("user_123");
    expect(safetyIdentifier?.length).toBeLessThanOrEqual(64);
    const payload = JSON.parse(String(init?.body));
    expect(payload.session.model).toBe("gpt-realtime-2");
    expect(payload.session.parallel_tool_calls).toBe(true);
    expect(payload.session.output_modalities).toBeUndefined();
    expect(payload.session.audio.input.turn_detection).toEqual({
      type: "semantic_vad",
      eagerness: "low",
      create_response: true,
      interrupt_response: true
    });
    expect(payload.session.audio.input.transcription).toEqual({ model: "gpt-4o-mini-transcribe" });
    expect(payload.session.tools.every((tool: { name: string }) => /^[a-zA-Z0-9_-]+$/.test(tool.name))).toBe(true);
    expect(payload.session.tools.map((tool: { name: string }) => tool.name)).toEqual(["assistant__dot__select_tool"]);
    expect(JSON.stringify(payload.session.tools[0].parameters)).toContain("board.add_widget");
    expect(JSON.stringify(payload.session.tools[0].parameters)).not.toContain("widgetId");
  });

  it("derives the OpenAI safety identifier from auth even when the request has none", async () => {
    stubSupabaseEnv();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createSupabaseUserResponse("user_123"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "client-secret" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await callHandler(JSON.stringify({}));

    const [, init] = fetchMock.mock.calls[1] as [RequestInfo | URL, RequestInit];
    expect(init?.headers).toMatchObject({
      "OpenAI-Safety-Identifier": createOpenAISafetyIdentifier("user_123")
    });
  });

  it("returns JSON when the OpenAI client secret request fails before a response", async () => {
    stubSupabaseEnv();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(createSupabaseUserResponse()).mockImplementationOnce(async () => {
        throw new Error("network down");
      })
    );

    const response = await callHandler(JSON.stringify({}));

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      error: "OPENAI_REALTIME_SESSION_REQUEST_FAILED",
      message: "network down"
    });
  });

  it("returns structured upstream details when OpenAI rejects the Realtime session", async () => {
    stubSupabaseEnv();
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(createSupabaseUserResponse())
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                type: "invalid_request_error",
                code: "unknown_parameter",
                param: "session.output_modalities",
                message: "Unknown parameter: session.output_modalities."
              }
            }),
            { status: 400 }
          )
        )
    );

    const response = await callHandler(JSON.stringify({}));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "OPENAI_REALTIME_SESSION_CREATE_FAILED",
      status: 400,
      payload: {
        error: {
          type: "invalid_request_error",
          code: "unknown_parameter",
          param: "session.output_modalities",
          message: "Unknown parameter: session.output_modalities."
        }
      }
    });
  });
});
