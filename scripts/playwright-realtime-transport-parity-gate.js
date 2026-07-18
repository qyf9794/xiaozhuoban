#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const site = process.env.XIAOZHUOBAN_PARITY_SITE || "http://127.0.0.1:5177/app";

function requirePlaywright() {
  for (const candidate of ["playwright", "/tmp/xz-playwright-runner/node_modules/playwright"]) {
    try {
      return require(candidate);
    } catch {
      // Try the next configured Playwright installation.
    }
  }
  throw new Error("Playwright is not available");
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // Retry while Vite starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

async function startDevServer() {
  const url = new URL(site);
  const viteBin = path.join(repoRoot, "apps/web/node_modules/vite/bin/vite.js");
  if (!fs.existsSync(viteBin)) throw new Error(`Vite binary not found: ${viteBin}`);
  const child = spawn(process.execPath, [viteBin, "--host", url.hostname, "--port", url.port], {
    cwd: path.join(repoRoot, "apps/web"),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CI: process.env.CI || "true",
      VITE_XIAOZHUOBAN_E2E_AUTH_BYPASS: "true",
      XIAOZHUOBAN_E2E_REALTIME_AUTH_BYPASS: "true"
    }
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
  await waitForServer(site, 30_000);
  return child;
}

async function main() {
  const dev = await startDevServer();
  let browser;
  try {
    const { chromium } = requirePlaywright();
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ permissions: ["microphone"] });
    const page = await context.newPage();
    await page.goto(site, { waitUntil: "domcontentloaded", timeout: 20_000 });

    const result = await page.evaluate(async () => {
      const diagnostics = [];
      const statuses = [];
      let getUserMediaCount = 0;
      const mediaDevices = navigator.mediaDevices;
      const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        value: (...args) => {
          getUserMediaCount += 1;
          return originalGetUserMedia(...args);
        }
      });

      const { OpenAIRealtimeWebRtcAdapter } = await import("/src/assistant/openaiRealtimeAdapter.ts");
      const adapter = new OpenAIRealtimeWebRtcAdapter({
        webrtcTransport: "agents_sdk",
        onDiagnostic: (event) => diagnostics.push(event),
        onStatusChange: (status) => statuses.push(status)
      });

      await adapter.connectTextOnly();
      adapter.disconnect();
      await adapter.connectTextOnly();
      adapter.disconnect();

      const originalPermissionQuery = navigator.permissions.query.bind(navigator.permissions);
      Object.defineProperty(navigator.permissions, "query", {
        configurable: true,
        value: async (descriptor) =>
          descriptor && descriptor.name === "microphone" ? { state: "denied" } : originalPermissionQuery(descriptor)
      });
      let deniedError = "";
      const deniedDiagnostics = [];
      const deniedAdapter = new OpenAIRealtimeWebRtcAdapter({
        webrtcTransport: "agents_sdk",
        onDiagnostic: (event) => deniedDiagnostics.push(event)
      });
      try {
        await deniedAdapter.connect();
      } catch (error) {
        deniedError = error instanceof Error ? error.message : String(error);
      }

      return {
        getUserMediaCount,
        statuses,
        textReadyCount: diagnostics.filter((event) => event.type === "realtime.session.created_ready").length,
        textClassicTransportCount: diagnostics.filter(
          (event) => event.type === "realtime.transport.selected" && event.status === "classic" && event.data?.mode === "text"
        ).length,
        deniedError,
        deniedSessionRequestCount: deniedDiagnostics.filter((event) => event.type === "realtime.session.request").length
      };
    });

    const passed =
      result.getUserMediaCount === 0 &&
      result.textReadyCount === 2 &&
      result.textClassicTransportCount === 2 &&
      result.deniedError === "MICROPHONE_DENIED" &&
      result.deniedSessionRequestCount === 0;
    console.log(JSON.stringify({ passed, ...result }, null, 2));
    await context.close();
    if (!passed) process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    dev.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
