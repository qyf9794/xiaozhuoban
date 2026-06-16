import { EventEmitter } from "node:events";
import type { IncomingHttpHeaders } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { createOpenAISafetyIdentifier } from "./session.js";

class MockRequest extends EventEmitter {
  method = "POST";
  headers: IncomingHttpHeaders = {};

  constructor(private readonly body = "") {
    super();
    queueMicrotask(() => {
      if (this.body) {
        this.emit("data", Buffer.from(this.body));
      }
      this.emit("end");
    });
  }
}

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

async function callHandler(body = "") {
  const request = new MockRequest(body);
  const response = new MockResponse();
  await handler(request as never, response as never);
  return response;
}

describe("realtime session API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a server-side OpenAI API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await callHandler();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: "OPENAI_API_KEY_MISSING" });
  });

  it("hashes the user safety identifier before sending it to OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ value: "client-secret" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callHandler(JSON.stringify({ safetyIdentifier: " user_123 ", ttlSeconds: 120 }));

    expect(response.statusCode).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(init?.headers).toMatchObject({
      authorization: "Bearer sk-test",
      "OpenAI-Safety-Identifier": createOpenAISafetyIdentifier("user_123")
    });
    const safetyIdentifier = createOpenAISafetyIdentifier("user_123");
    expect(safetyIdentifier).not.toContain("user_123");
    expect(safetyIdentifier?.length).toBeLessThanOrEqual(64);
    const payload = JSON.parse(String(init?.body));
    expect(payload.session.model).toBe("gpt-realtime-2");
    expect(payload.session.tools.every((tool: { name: string }) => /^[a-zA-Z0-9_-]+$/.test(tool.name))).toBe(true);
    expect(payload.session.tools.map((tool: { name: string }) => tool.name)).toContain("board__dot__add_widget");
  });

  it("does not send an OpenAI safety identifier when the request has none", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ value: "client-secret" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await callHandler(JSON.stringify({}));

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(init?.headers).not.toHaveProperty("OpenAI-Safety-Identifier");
  });

  it("returns JSON when the OpenAI client secret request fails before a response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
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
});
