import type { IncomingMessage, ServerResponse } from "node:http";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const MAX_QUERY_LENGTH = 80;

function sendJson(response: ServerResponse, statusCode: number, payload: JsonValue): void {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "s-maxage=86400, stale-while-revalidate=604800");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function requestUrl(request: IncomingMessage): URL {
  const host = request.headers.host ?? "localhost";
  return new URL(request.url ?? "/", `http://${host}`);
}

function cityCode(id: unknown): string {
  return `geo:${String(id)}`;
}

function zoneValue(timezone: string, id: unknown): string {
  return `${timezone}|geo-${String(id)}`;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const url = requestUrl(request);
  const query = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) {
    sendJson(response, 400, { error: "QUERY_REQUIRED" });
    return;
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=zh&format=json`
    );
  } catch {
    sendJson(response, 502, { error: "GEO_SEARCH_UNAVAILABLE" });
    return;
  }

  if (!upstream.ok) {
    sendJson(response, 502, { error: "GEO_SEARCH_FAILED", status: upstream.status });
    return;
  }

  const payload = (await upstream.json()) as {
    results?: Array<{
      id?: number | string;
      name?: string;
      latitude?: number;
      longitude?: number;
      timezone?: string;
      country?: string;
      admin1?: string;
    }>;
  };
  const hit = payload.results?.find(
    (item) =>
      item.id !== undefined &&
      typeof item.name === "string" &&
      Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude) &&
      typeof item.timezone === "string" &&
      item.timezone.trim()
  );
  if (!hit) {
    sendJson(response, 404, { error: "CITY_NOT_FOUND" });
    return;
  }

  const name = hit.name ?? "";
  const latitude = hit.latitude ?? 0;
  const longitude = hit.longitude ?? 0;
  const timezone = hit.timezone ?? "";
  const admin = [hit.admin1, hit.country].filter(Boolean).join(" · ");
  const label = admin ? `${name} (${admin})` : name;
  sendJson(response, 200, {
    cityCode: cityCode(hit.id),
    name,
    label,
    latitude,
    longitude,
    timezone,
    worldClockZone: zoneValue(timezone, hit.id),
    source: "open-meteo-geocoding"
  });
}
