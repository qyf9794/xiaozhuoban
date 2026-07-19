import type { IncomingHttpHeaders } from "node:http";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import tasksHandler from "../../../api/workbench/tasks.js";
import webhookHandler from "../../../api/workbench/openai-webhook.js";

class MockResponse {
  statusCode = 200;
  body = "";
  headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  end(body = ""): void {
    this.body = body;
  }
}

async function invoke(
  handler: (request: never, response: never) => Promise<void>,
  options: { method?: string; body?: string; headers?: IncomingHttpHeaders } = {}
) {
  const request = Readable.from(options.body ? [Buffer.from(options.body)] : []) as Readable & {
    method?: string;
    headers?: IncomingHttpHeaders;
  };
  request.method = options.method ?? "POST";
  request.headers = options.headers ?? {};
  const response = new MockResponse();
  await handler(request as never, response as never);
  return response;
}

describe("workbench API boundaries", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed when the server feature flag is disabled", async () => {
    vi.stubEnv("WORKBENCH_ENABLED", "false");
    const response = await invoke(tasksHandler as never, { body: JSON.stringify({ prompt: "分析材料" }) });
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "WORKBENCH_DISABLED" });
  });

  it("requires the existing Supabase bearer authentication", async () => {
    vi.stubEnv("WORKBENCH_ENABLED", "true");
    const response = await invoke(tasksHandler as never, { body: JSON.stringify({ prompt: "分析材料" }) });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: "AUTH_REQUIRED" });
  });

  it("rejects an invalid OpenAI webhook signature before database access", async () => {
    vi.stubEnv("WORKBENCH_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_WEBHOOK_SECRET", "test-secret");
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await invoke(webhookHandler as never, {
      body: JSON.stringify({ id: "evt_1", type: "response.completed", data: { id: "resp_1" } }),
      headers: {
        "webhook-id": "evt_1",
        "webhook-timestamp": timestamp,
        "webhook-signature": "v1,aW52YWxpZA=="
      }
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "OPENAI_WEBHOOK_SIGNATURE_INVALID" });
  });
});
