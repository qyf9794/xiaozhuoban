#!/usr/bin/env node

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const deployment = args.find((arg) => !arg.startsWith("--")) ?? "xiaozhuoban.bqxb.org";
const since = args.find((arg) => arg.startsWith("--since="))?.slice("--since=".length) ?? "30m";
const trace = args.find((arg) => arg.startsWith("--trace="))?.slice("--trace=".length);
const session = args.find((arg) => arg.startsWith("--session="))?.slice("--session=".length);
const marker = "[assistant-diagnostic]";

const child = spawn(
  "pnpm",
  ["dlx", "vercel", "logs", deployment, "--since", since],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  }
);

function handleChunk(chunk) {
  String(chunk)
    .split(/\r?\n/)
    .filter((line) => line.includes(marker) || line.includes("assistant.diagnostic"))
    .forEach((line) => {
      const jsonStart = line.indexOf("{");
      if (jsonStart < 0) {
        console.log(line);
        return;
      }
      try {
        const event = JSON.parse(line.slice(jsonStart));
        if (trace && event.commandTraceId !== trace && event.traceId !== trace) {
          return;
        }
        if (session && event.clientSessionId !== session) {
          return;
        }
        console.log(
          JSON.stringify(
            {
              receivedAt: event.receivedAt,
              traceId: event.traceId,
              clientEventIndex: event.clientEventIndex,
              type: event.type,
              status: event.status,
              route: event.route,
              toolName: event.toolName,
              operationId: event.operationId,
              errorCode: event.errorCode,
              message: event.message,
              clientSessionId: event.clientSessionId,
              data: event.data
            },
            null,
            2
          )
        );
      } catch {
        console.log(line);
      }
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
