#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const site = process.env.XIAOZHUOBAN_SDK_ONLY_SITE || "http://127.0.0.1:5177/app";

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
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    await page.goto(site, { waitUntil: "domcontentloaded", timeout: 20_000 });

    const result = await page.evaluate(async () => {
      const transportModule = await import("/src/assistant/realtimeTransport.ts");
      const adapterModule = await import("/src/assistant/openaiRealtimeAdapter.ts");
      const runtimeModule = await import("/src/assistant/createRealtimeAssistantRuntime.ts");
      const diagnostics = [];
      const adapter = {
        connect: async () => undefined,
        disconnect: () => undefined,
        updateTools: () => undefined,
        sendToolResult: () => undefined
      };
      const runtime = runtimeModule.createRealtimeAssistantRuntime({
        adapterFactory: () => adapter,
        adapterOptions: { onDiagnostic: (event) => diagnostics.push(event) }
      });

      const originalPermissionQuery = navigator.permissions.query.bind(navigator.permissions);
      Object.defineProperty(navigator.permissions, "query", {
        configurable: true,
        value: async (descriptor) =>
          descriptor && descriptor.name === "microphone" ? { state: "denied" } : originalPermissionQuery(descriptor)
      });
      let deniedError = "";
      let sessionRequestCount = 0;
      const deniedAdapter = new adapterModule.OpenAIRealtimeWebRtcAdapter({
        onDiagnostic: (event) => {
          if (event.type === "realtime.session.request") sessionRequestCount += 1;
        }
      });
      try {
        await deniedAdapter.connect();
      } catch (error) {
        deniedError = error instanceof Error ? error.message : String(error);
      }

      return {
        hasClassicTransportExport:
          "ClassicRealtimeTransport" in transportModule || "createClassicRealtimeTransport" in transportModule,
        hasTextOnlyAdapterConnect: typeof adapterModule.OpenAIRealtimeWebRtcAdapter.prototype.connectTextOnly === "function",
        hasTextOnlyRuntimeConnect: typeof runtime.connectTextOnly === "function",
        hasRealtimeTextSender: typeof runtime.sendRealtimeTextCommand === "function",
        selectedSdkCount: diagnostics.filter(
          (event) => event.type === "realtime.runtime.adapter_selected" && event.status === "sdk_webrtc_transport"
        ).length,
        deniedError,
        deniedSessionRequestCount: sessionRequestCount
      };
    });

    const passed =
      !result.hasClassicTransportExport &&
      !result.hasTextOnlyAdapterConnect &&
      !result.hasTextOnlyRuntimeConnect &&
      !result.hasRealtimeTextSender &&
      result.selectedSdkCount === 1 &&
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
