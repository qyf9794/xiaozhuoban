#!/usr/bin/env node

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const deployment = args.find((arg) => !arg.startsWith("--")) ?? "xiaozhuoban.bqxb.org";
const since = args.find((arg) => arg.startsWith("--since="))?.slice("--since=".length) ?? "30m";
const limit = args.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "100";
const trace = args.find((arg) => arg.startsWith("--trace="))?.slice("--trace=".length);
const session = args.find((arg) => arg.startsWith("--session="))?.slice("--session=".length);
const costSummary = args.includes("--cost-summary");
const marker = "[assistant-diagnostic]";
const printedKeys = new Set();
const costEvents = [];

const child = spawn(
  "pnpm",
  ["dlx", "vercel", "logs", deployment, "--since", since, "--limit", limit, "--query", "assistant-diagnostic", "--json"],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  }
);

function handleChunk(chunk) {
  String(chunk)
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        return;
      }
      const messages = [];
      if (typeof row.message === "string") messages.push(row.message);
      if (Array.isArray(row.logs)) {
        row.logs.forEach((log) => {
          if (typeof log?.message === "string") messages.push(log.message);
        });
      }
      messages.forEach((message) => {
        if (!message.includes(marker) && !message.includes("assistant.diagnostic")) return;
        const jsonStart = message.indexOf("{");
        if (jsonStart < 0) return;
        try {
          const event = JSON.parse(message.slice(jsonStart));
          if (trace && event.commandTraceId !== trace && event.traceId !== trace) {
            return;
          }
          if (session && event.clientSessionId !== session) {
            return;
          }
          const key = [
            event.traceId,
            event.clientSessionId,
            event.clientEventIndex,
            event.type,
            event.clientCreatedAt
          ].join("|");
          if (printedKeys.has(key)) return;
          printedKeys.add(key);
          if (event.type === "openai.usage.cost_estimate") {
            costEvents.push(event);
          }
          console.log(
            JSON.stringify(
              {
                receivedAt: event.receivedAt,
                traceId: event.traceId,
                clientEventIndex: event.clientEventIndex,
                clientCreatedAt: event.clientCreatedAt,
                type: event.type,
                status: event.status,
                route: event.route,
                toolName: event.toolName,
                operationId: event.operationId,
                errorCode: event.errorCode,
                message: event.message,
                clientSessionId: event.clientSessionId,
                visibilityState: event.visibilityState,
                data: event.data
              },
              null,
              2
            )
          );
        } catch {
          // Ignore malformed log rows.
        }
      });
    });
}

function printCostSummary() {
  if (!costSummary) return;
  const groups = new Map();
  let estimatedTotal = 0;
  let usageOnlyCount = 0;
  for (const event of costEvents) {
    const data = event.data && typeof event.data === "object" ? event.data : {};
    const model = typeof data.model === "string" ? data.model : "unknown-model";
    const stage = typeof data.stage === "string" ? data.stage : "unknown-stage";
    const source = typeof data.source === "string" ? data.source : "unknown-source";
    const key = `${source}|${model}|${stage}`;
    const current = groups.get(key) ?? {
      source,
      model,
      stage,
      events: 0,
      estimatedCostUsd: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      textInputTokens: 0,
      audioInputTokens: 0,
      textOutputTokens: 0,
      audioOutputTokens: 0,
      usageOnly: 0
    };
    current.events += 1;
    for (const field of [
      "inputTokens",
      "cachedInputTokens",
      "outputTokens",
      "textInputTokens",
      "audioInputTokens",
      "textOutputTokens",
      "audioOutputTokens"
    ]) {
      if (typeof data[field] === "number") current[field] += data[field];
    }
    if (typeof data.estimatedCostUsd === "number") {
      current.estimatedCostUsd += data.estimatedCostUsd;
      estimatedTotal += data.estimatedCostUsd;
    } else {
      current.usageOnly += 1;
      usageOnlyCount += 1;
    }
    groups.set(key, current);
  }
  console.log(
    JSON.stringify(
      {
        type: "openai.usage.cost_summary",
        eventCount: costEvents.length,
        estimatedCostUsd: Math.round(estimatedTotal * 1_000_000_000) / 1_000_000_000,
        usageOnlyCount,
        groups: [...groups.values()].map((group) => ({
          ...group,
          estimatedCostUsd: Math.round(group.estimatedCostUsd * 1_000_000_000) / 1_000_000_000
        }))
      },
      null,
      2
    )
  );
}

child.stdout.on("data", handleChunk);
child.stderr.on("data", (chunk) => {
  const text = String(chunk);
  if (!/Fetching|Resolving|Vercel CLI/.test(text)) {
    process.stderr.write(text);
  }
});
child.on("exit", (code) => {
  printCostSummary();
  process.exitCode = code ?? 0;
});
