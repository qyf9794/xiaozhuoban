import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/market/search.js";

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

async function callHandler(url: string, method = "GET") {
  const request = Readable.from([]) as Readable & {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  };
  request.method = method;
  request.url = url;
  request.headers = { host: "localhost" };
  const response = new MockResponse();
  await handler(request as never, response as never);
  return response;
}

describe("market search API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves stock names with Tencent smartbox", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('v_hint="us~aapl.oq~\\u82f9\\u679c~pg~GP"')));

    const response = await callHandler("/api/market/search?q=%E8%8B%B9%E6%9E%9C");

    expect(response.statusCode).toBe(200);
    expect(fetch).toHaveBeenCalledWith("https://smartbox.gtimg.cn/s3/?q=%E8%8B%B9%E6%9E%9C&t=all");
    expect(JSON.parse(response.body)).toEqual({
      code: "usAAPL",
      label: "苹果 AAPL",
      source: "tencent-smartbox"
    });
  });

  it("rejects empty queries", async () => {
    const response = await callHandler("/api/market/search?q=");

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "QUERY_REQUIRED" });
  });
});
