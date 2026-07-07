import type { IncomingHttpHeaders } from "node:http";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/assistant/cleanup.js";

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

async function callHandler(url = "/api/assistant/cleanup", headers: IncomingHttpHeaders = { authorization: "Bearer cron-test" }) {
  const request = Readable.from([]) as Readable & {
    method?: string;
    url?: string;
    headers?: IncomingHttpHeaders;
  };
  request.method = "GET";
  request.url = url;
  request.headers = { host: "localhost", ...headers };
  const response = new MockResponse();
  await handler(request as never, response as never);
  return response;
}

function stubCleanupEnv() {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
  vi.stubEnv("CRON_SECRET", "cron-test");
}

describe("assistant cleanup API", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a cleanup secret", async () => {
    stubCleanupEnv();

    const response = await callHandler("/api/assistant/cleanup", { authorization: "Bearer wrong" });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: "UNAUTHORIZED" });
  });

  it("counts old assistant logs without deleting them during dry runs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    stubCleanupEnv();
    const fetchMock = vi.fn(async () => new Response("[]", { headers: { "content-range": "0-0/12" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callHandler("/api/assistant/cleanup?dryRun=1&days=14");

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/assistant_command_logs?select=id&created_at=lt.2026-06-21T12%3A00%3A00.000Z",
      expect.objectContaining({ method: "GET" })
    );
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      dryRun: true,
      retentionDays: 14,
      matchedRows: 12,
      deletedRows: 0
    });
  });

  it("deletes old assistant command logs after counting matched rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T12:00:00.000Z"));
    stubCleanupEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("[]", { headers: { "content-range": "0-0/3" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await callHandler();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://project.supabase.co/rest/v1/assistant_command_logs?created_at=lt.2026-06-05T12%3A00%3A00.000Z",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      dryRun: false,
      retentionDays: 30,
      matchedRows: 3,
      deletedRows: 3
    });
  });
});
