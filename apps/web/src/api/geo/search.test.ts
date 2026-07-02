import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/geo/search.js";

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

describe("geo search API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves city coordinates and timezone online", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            {
              id: 5809844,
              name: "西雅图",
              latitude: 47.60621,
              longitude: -122.33207,
              timezone: "America/Los_Angeles",
              country: "美国",
              admin1: "华盛顿州"
            }
          ]
        })
      )
    );

    const response = await callHandler("/api/geo/search?q=%E8%A5%BF%E9%9B%85%E5%9B%BE");

    expect(response.statusCode).toBe(200);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("geocoding-api.open-meteo.com"));
    expect(JSON.parse(response.body)).toEqual({
      cityCode: "geo:5809844",
      name: "西雅图",
      label: "西雅图 (华盛顿州 · 美国)",
      latitude: 47.60621,
      longitude: -122.33207,
      timezone: "America/Los_Angeles",
      worldClockZone: "America/Los_Angeles|geo-5809844",
      source: "open-meteo-geocoding"
    });
  });

  it("rejects empty queries", async () => {
    const response = await callHandler("/api/geo/search?q=");

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "QUERY_REQUIRED" });
  });
});
