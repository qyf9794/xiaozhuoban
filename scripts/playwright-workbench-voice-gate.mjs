#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(path.join(repoRoot, "tests/realtime-live-workbench-cases.json"), "utf8"));
const outputRoot = path.join(repoRoot, "output/playwright/workbench-voice-gate");
const audioPath = path.join(outputRoot, "workbench-session.wav");
const site = "http://127.0.0.1:5177/app";

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
}

function generateSessionAudio() {
  mkdirSync(outputRoot, { recursive: true });
  const temp = mkdtempSync(path.join(os.tmpdir(), "xiaozhuoban-workbench-voice-"));
  try {
    const inputs = [];
    const filters = [];
    let offsetMs = 5_000;
    cases.forEach((testCase, index) => {
      const aiff = path.join(temp, `${testCase.id}.aiff`);
      const wav = path.join(temp, `${testCase.id}.wav`);
      run("say", ["-v", "Tingting", "-r", "170", "-o", aiff, testCase.command]);
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
      inputs.push("-i", wav);
      filters.push(`[${index}:a]adelay=${offsetMs}:all=1[v${index}]`);
      const duration = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", wav], { encoding: "utf8" }).stdout.trim());
      offsetMs += Math.ceil(duration * 1_000) + 12_000;
    });
    filters.push(`${cases.map((_, index) => `[v${index}]`).join("")}amix=inputs=${cases.length}:duration=longest:normalize=0,apad=pad_dur=8[out]`);
    run("ffmpeg", [
      "-y", "-loglevel", "error", ...inputs,
      "-filter_complex", filters.join(";"), "-map", "[out]",
      "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", audioPath
    ]);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(site);
      if (response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("WORKBENCH_VOICE_DEV_SERVER_TIMEOUT");
}

function startServer() {
  const child = spawn("pnpm", ["--filter", "@xiaozhuoban/web", "dev", "--host", "127.0.0.1", "--port", "5177"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CI: "true",
      VITE_XIAOZHUOBAN_E2E_AUTH_BYPASS: "true",
      XIAOZHUOBAN_E2E_REALTIME_AUTH_BYPASS: "true",
      VITE_WORKBENCH_ENABLED: "true",
      WORKBENCH_ENABLED: "true"
    }
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[vite] ${chunk}`));
  return child;
}

function installCapture() {
  window.__xiaozhuobanLiveVoiceDiagnosticEvents = [];
  window.__xiaozhuobanGetUserMediaCount = 0;
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItem(key, value) {
    if (key === "xiaozhuoban.assistant.diagnosticBuffer") {
      try {
        const parsed = JSON.parse(String(value));
        const target = window.__xiaozhuobanLiveVoiceDiagnosticEvents;
        const seen = new Set(target.map((event) => JSON.stringify(event)));
        for (const event of Array.isArray(parsed) ? parsed : []) {
          const serialized = JSON.stringify(event);
          if (!seen.has(serialized)) target.push(event);
        }
      } catch {
        // Diagnostics capture must not change application behavior.
      }
    }
    return originalSetItem.apply(this, arguments);
  };
  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices?.getUserMedia) {
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = (...args) => {
      window.__xiaozhuobanGetUserMediaCount += 1;
      return originalGetUserMedia(...args);
    };
  }
}

async function main() {
  generateSessionAudio();
  const server = startServer();
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "xiaozhuoban-workbench-browser-"));
  let context;
  try {
    await waitForServer();
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: true,
      viewport: { width: 1280, height: 820 },
      permissions: ["microphone"],
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${audioPath}%noloop`
      ]
    });
    await context.addInitScript(installCapture);
    const page = context.pages()[0] ?? await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(site, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByRole("button", { name: "连接语音", exact: true }).waitFor({ timeout: 20_000 });
    await page.screenshot({ path: path.join(outputRoot, "before.png") });
    await page.getByRole("button", { name: "连接语音", exact: true }).click({ force: true });
    await page.waitForFunction(
      () => window.__xiaozhuobanLiveVoiceDiagnosticEvents.some((event) => event.type === "realtime.session.created_ready" && event.status === "connected"),
      null,
      { timeout: 30_000 }
    );

    let opened = false;
    let closedAfterOpen = false;
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && !closedAfterOpen) {
      const visible = await page.locator(".workbench-root").count() > 0;
      if (visible && !opened) {
        opened = true;
        await page.screenshot({ path: path.join(outputRoot, "opened.png") });
      }
      if (opened && !visible) {
        closedAfterOpen = true;
        await page.screenshot({ path: path.join(outputRoot, "closed.png") });
      }
      await page.waitForTimeout(200);
    }

    const beforeDisconnect = await page.evaluate(() => ({
      events: window.__xiaozhuobanLiveVoiceDiagnosticEvents,
      getUserMediaCount: window.__xiaozhuobanGetUserMediaCount,
      workbenchOpen: Boolean(document.querySelector(".workbench-root"))
    }));
    const connectedCount = beforeDisconnect.events.filter((event) => event.type === "realtime.session.created_ready" && event.status === "connected").length;
    const midSessionDisconnects = beforeDisconnect.events.filter(
      (event) => event.type === "realtime.runtime.disconnect" && event.data?.connected === true
    ).length;
    const transcripts = beforeDisconnect.events
      .filter((event) => event.type === "realtime.voice.user_transcript" && event.status === "success")
      .map((event) => String(event.data?.transcript || ""));
    const workbenchOperations = beforeDisconnect.events.filter(
      (event) => event.type === "assistant.operation" && event.toolName === "app.workbench.set" && event.status === "success"
    );

    await page.getByRole("button", { name: "断开 Realtime", exact: true }).click({ force: true });
    await page.waitForFunction(
      () => window.__xiaozhuobanLiveVoiceDiagnosticEvents.some((event) => event.type === "voice.status" && event.status === "disconnected"),
      null,
      { timeout: 10_000 }
    ).catch(() => undefined);
    const report = {
      passed: opened && closedAfterOpen && connectedCount === 1 && midSessionDisconnects === 0 && beforeDisconnect.getUserMediaCount === 1 && workbenchOperations.length >= 2 && pageErrors.length === 0,
      opened,
      closedAfterOpen,
      connectedCount,
      midSessionDisconnects,
      getUserMediaCount: beforeDisconnect.getUserMediaCount,
      workbenchOperationCount: workbenchOperations.length,
      transcripts,
      pageErrors,
      cases
    };
    writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    await context?.close().catch(() => undefined);
    server.kill("SIGTERM");
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

await main();
