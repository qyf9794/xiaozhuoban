#!/usr/bin/env node

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const deployment = args.find((arg) => !arg.startsWith("--")) ?? "xiaozhuoban.bqxb.org";
const since = args.find((arg) => arg.startsWith("--since="))?.slice("--since=".length) ?? "30m";
const limit = args.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? "100";
const trace = args.find((arg) => arg.startsWith("--trace="))?.slice("--trace=".length);
const session = args.find((arg) => arg.startsWith("--session="))?.slice("--session=".length);
const marker = "[assistant-diagnostic]";
const printedKeys = new Set();

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

child.stdout.on("data", handleChunk);
child.stderr.on("data", (chunk) => {
  const text = String(chunk);
  if (!/Fetching|Resolving|Vercel CLI/.test(text)) {
    process.stderr.write(text);
  }
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
