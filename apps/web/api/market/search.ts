import type { IncomingMessage, ServerResponse } from "node:http";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const MAX_QUERY_LENGTH = 80;

function sendJson(response: ServerResponse, statusCode: number, payload: JsonValue): void {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=1800");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function requestUrl(request: IncomingMessage): URL {
  const host = request.headers.host ?? "localhost";
  return new URL(request.url ?? "/", `http://${host}`);
}

function decodeTencentHintPayload(text: string): string {
  const match = text.match(/v_hint="([\s\S]*)";?$/);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

function decodeTencentField(value: string | undefined): string {
  if (!value) return "";
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value;
  }
}

function marketCode(market: string, symbol: string): string | undefined {
  const normalizedMarket = market.trim().toLowerCase();
  const normalizedSymbol = symbol.trim();
  if (!normalizedMarket || !normalizedSymbol) return undefined;
  if (normalizedMarket === "us") return `us${normalizedSymbol.split(".")[0].toUpperCase()}`;
  if (normalizedMarket === "hk") return `hk${normalizedSymbol.padStart(5, "0")}`;
  if (normalizedMarket === "sh" || normalizedMarket === "sz") return `${normalizedMarket}${normalizedSymbol}`;
  return undefined;
}

function marketDisplaySymbol(code: string): string {
  return code.replace(/^us/, "").replace(/^hk/, "").replace(/^sh/, "").replace(/^sz/, "");
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
    upstream = await fetch(`https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(query)}&t=all`);
  } catch {
    sendJson(response, 502, { error: "MARKET_SEARCH_UNAVAILABLE" });
    return;
  }

  if (!upstream.ok) {
    sendJson(response, 502, { error: "MARKET_SEARCH_FAILED", status: upstream.status });
    return;
  }

  const payload = decodeTencentHintPayload(await upstream.text());
  const entries = payload
    .split("^")
    .map((entry) => entry.split("~"))
    .filter((fields) => fields.length >= 5);
  const stock = entries.find((fields) => /^GP/.test(fields[4] ?? ""));
  if (!stock) {
    sendJson(response, 404, { error: "MARKET_SYMBOL_NOT_FOUND" });
    return;
  }

  const code = marketCode(stock[0] ?? "", stock[1] ?? "");
  if (!code) {
    sendJson(response, 404, { error: "MARKET_SYMBOL_UNSUPPORTED" });
    return;
  }

  const name = decodeTencentField(stock[2]).trim();
  sendJson(response, 200, {
    code,
    label: name ? `${name} ${marketDisplaySymbol(code)}` : undefined,
    source: "tencent-smartbox"
  });
}
