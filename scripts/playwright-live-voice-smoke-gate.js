#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const defaultReportPath = path.join(repoRoot, "docs/realtime-live-voice-smoke-report.md");
const defaultOutputRoot = path.join(repoRoot, "output/playwright/realtime-live-voice-smoke");
const defaultAudioRoot = path.join(repoRoot, "tests/audio/realtime-live-smoke");

const defaultCases = [
  { id: "01", command: "关闭留言板", audio: "01-vad.wav", expected: ["widget.remove"] },
  { id: "02", command: "打开音乐播放器", audio: "02-vad.wav", expected: ["board.add_widget"] },
  { id: "03", command: "我想听王菲的歌", audio: "03-vad.wav", expected: ["music.search", "music.play"] },
  { id: "04", command: "暂停音乐", audio: "04-vad.wav", expected: ["music.pause"] },
  { id: "05", command: "上海天气", audio: "05-vad.wav", expected: ["weather.set_city", "board.add_widget"] },
  { id: "06", command: "打开便签", audio: "06-vad.wav", expected: ["board.add_widget"] },
  { id: "07", command: "帮我记一下今天测试语音", audio: "07-vad.wav", expected: ["note.write"] },
  { id: "08", command: "十分钟后提醒我", audio: "08-vad.wav", expected: ["countdown.set", "todo.add_item"] },
  { id: "09", command: "打开电视然后全屏", audio: "09-vad.wav", expected: ["board.add_widget", "tv.fullscreen", "widget.fullscreen_focus"] },
  { id: "10", command: "关闭所有小工具", audio: "10-vad.wav", expected: ["widget.remove"] }
];

function parseArgs(argv) {
  const options = {
    site: "http://127.0.0.1:5176/app",
    headed: false,
    startDev: true,
    waitMs: 60_000,
    audioRoot: defaultAudioRoot,
    outputRoot: defaultOutputRoot,
    reportPath: defaultReportPath,
    casesFile: ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--site") options.site = argv[++index];
    else if (item.startsWith("--site=")) options.site = item.slice("--site=".length);
    else if (item === "--headed") options.headed = true;
    else if (item === "--no-start-dev") options.startDev = false;
    else if (item === "--wait-ms") options.waitMs = Number(argv[++index]);
    else if (item.startsWith("--wait-ms=")) options.waitMs = Number(item.slice("--wait-ms=".length));
    else if (item === "--audio-root") options.audioRoot = path.resolve(argv[++index]);
    else if (item.startsWith("--audio-root=")) options.audioRoot = path.resolve(item.slice("--audio-root=".length));
    else if (item === "--output-root") options.outputRoot = path.resolve(argv[++index]);
    else if (item.startsWith("--output-root=")) options.outputRoot = path.resolve(item.slice("--output-root=".length));
    else if (item === "--report") options.reportPath = path.resolve(argv[++index]);
    else if (item.startsWith("--report=")) options.reportPath = path.resolve(item.slice("--report=".length));
    else if (item === "--cases-file") options.casesFile = path.resolve(argv[++index]);
    else if (item.startsWith("--cases-file=")) options.casesFile = path.resolve(item.slice("--cases-file=".length));
  }
  return options;
}

function loadCases(casesFile) {
  if (!casesFile) return defaultCases;
  const parsed = JSON.parse(fs.readFileSync(casesFile, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`Cases file must contain an array: ${casesFile}`);
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Invalid case at index ${index}`);
    const testCase = item;
    if (typeof testCase.id !== "string" || typeof testCase.command !== "string" || typeof testCase.audio !== "string") {
      throw new Error(`Case ${index} must include id, command, and audio`);
    }
    if (!Array.isArray(testCase.expected) || !testCase.expected.every((value) => typeof value === "string")) {
      throw new Error(`Case ${testCase.id} must include expected tool names`);
    }
    return testCase;
  });
}

function requirePlaywright() {
  const candidates = ["playwright", "/tmp/xz-playwright-runner/node_modules/playwright"];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("Playwright is not available. Install it or create /tmp/xz-playwright-runner/node_modules/playwright.");
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return true;
    } catch {
      // Wait and retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function startDevServerIfNeeded(site, enabled) {
  if (!enabled) return null;
  if (await waitForServer(site, 1_000)) return null;
  const url = new URL(site);
  const localViteBin = path.join(repoRoot, "apps/web/node_modules/vite/bin/vite.js");
  const command = fs.existsSync(localViteBin) ? process.execPath : "pnpm";
  const args = fs.existsSync(localViteBin)
    ? [localViteBin, "--host", url.hostname, "--port", url.port || "5176"]
    : ["--dir", "apps/web", "exec", "vite", "--host", url.hostname, "--port", url.port || "5176"];
  const child = spawn(command, args, {
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
  if (!(await waitForServer(site, 30_000))) {
    child.kill("SIGTERM");
    throw new Error(`Dev server did not start at ${site}`);
  }
  return child;
}

async function installExternalMocks(page) {
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 22, weather_code: 3, is_day: 1, wind_speed_10m: 8 },
        daily: {
          time: ["2026-06-30", "2026-07-01", "2026-07-02"],
          weather_code: [3, 2, 0],
          temperature_2m_max: [26, 27, 28],
          temperature_2m_min: [18, 19, 20]
        }
      })
    });
  });
  await page.route("https://itunes.apple.com/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCount: 1,
        results: [
          {
            wrapperType: "track",
            kind: "song",
            trackId: 10001,
            trackName: "红豆",
            artistName: "王菲",
            collectionName: "测试歌单",
            artworkUrl100: "https://example.test/music.jpg",
            previewUrl: "https://example.test/music.m4a",
            trackViewUrl: "https://example.test/music"
          }
        ]
      })
    });
  });
  await page.route("https://example.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith(".jpg")) {
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><rect width=\"64\" height=\"64\" fill=\"#0f172a\"/><circle cx=\"32\" cy=\"32\" r=\"20\" fill=\"#38bdf8\"/></svg>"
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "audio/mp4", body: "" });
  });
}

async function clearAllAppState(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const databases = await indexedDB.databases?.();
    await Promise.all(
      (databases ?? [])
        .map((database) => database.name)
        .filter(Boolean)
        .map(
          (name) =>
            new Promise((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
            })
        )
    );
  });
}

async function clearCaseEvidence(page) {
  await page.evaluate(() => {
    localStorage.setItem("xiaozhuoban.assistant.auditLogs", "[]");
    sessionStorage.removeItem("xiaozhuoban.assistant.diagnosticBuffer");
    sessionStorage.removeItem("xiaozhuoban.assistant.lastHarnessDiagnostics");
    window.__xiaozhuobanAssistantDiagnostics = null;
    window.__xiaozhuobanAssistantDiagnosticEvents = [];
  });
}

async function waitForAppReady(page) {
  await page
    .waitForFunction(
      () =>
        Boolean(document.querySelector('[data-testid="voice-assistant-dock"]')) &&
        !document.body.innerText.includes("页面加载中...") &&
        document.body.innerText.includes("桌板"),
      null,
      { timeout: 20_000 }
    )
    .catch(() => undefined);
  await page.waitForTimeout(500);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => ({
      id: element.getAttribute("data-widget-id") || "",
      text: element.innerText,
      className: String(element.className || "")
    }));
    return {
      bodyText: document.body.innerText,
      widgets,
      auditLogs: JSON.parse(localStorage.getItem("xiaozhuoban.assistant.auditLogs") || "[]"),
      diagnostics: {
        ...(window.__xiaozhuobanExportAssistantDiagnostics?.() ?? {}),
        events:
          Array.isArray(window.__xiaozhuobanLiveVoiceDiagnosticEvents) && window.__xiaozhuobanLiveVoiceDiagnosticEvents.length
            ? window.__xiaozhuobanLiveVoiceDiagnosticEvents
            : window.__xiaozhuobanExportAssistantDiagnostics?.()?.events ?? []
      }
    };
  });
}

async function waitForPersistedWidgetCount(page, expectedCount) {
  await page
    .waitForFunction(
      async (count) => {
        const request = indexedDB.open("xiaozhuoban");
        const db = await new Promise((resolve, reject) => {
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
          request.onupgradeneeded = () => resolve(request.result);
        });
        if (!db.objectStoreNames.contains("widgetInstances")) {
          db.close();
          return count === 0;
        }
        const transaction = db.transaction("widgetInstances", "readonly");
        const store = transaction.objectStore("widgetInstances");
        const countRequest = store.count();
        const persistedCount = await new Promise((resolve, reject) => {
          countRequest.onerror = () => reject(countRequest.error);
          countRequest.onsuccess = () => resolve(countRequest.result);
        });
        db.close();
        return persistedCount === count;
      },
      expectedCount,
      { timeout: 6_000 }
    )
    .catch(() => undefined);
}

function eventTypes(events, type) {
  return events.filter((event) => event.type === type);
}

function eventIndex(events, predicate) {
  return events.findIndex(predicate);
}

function eventData(event) {
  return event && typeof event.data === "object" && event.data !== null ? event.data : {};
}

function executedToolNames(snapshotAfter, events) {
  const fromAudit = (snapshotAfter.auditLogs ?? []).map((log) => log.toolName).filter(Boolean);
  const fromEvents = events.map((event) => event.toolName).filter(Boolean);
  return [...new Set([...fromAudit, ...fromEvents])];
}

function stringValuesFromEventData(events, keys) {
  const values = [];
  for (const event of events) {
    const data = eventData(event);
    for (const key of keys) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) values.push(value.trim());
    }
    const args = eventData({ data: data.args });
    for (const key of keys) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) values.push(value.trim());
    }
    const requestedArgs = eventData({ data: data.requestedArgs });
    for (const key of keys) {
      const value = requestedArgs[key];
      if (typeof value === "string" && value.trim()) values.push(value.trim());
    }
  }
  return [...new Set(values)];
}

function collectStringValuesFromObject(value, keys, values = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectStringValuesFromObject(item, keys, values);
    return values;
  }
  if (!value || typeof value !== "object") return values;
  for (const [key, nestedValue] of Object.entries(value)) {
    if (keys.includes(key) && typeof nestedValue === "string" && nestedValue.trim()) {
      values.push(nestedValue.trim());
    }
    collectStringValuesFromObject(nestedValue, keys, values);
  }
  return values;
}

function stringValuesFromAuditLogs(auditLogs, keys) {
  const values = [];
  for (const log of auditLogs ?? []) {
    collectStringValuesFromObject(log, keys, values);
  }
  return [...new Set(values)];
}

function expectedTextHit(values, expectedParts) {
  if (!Array.isArray(expectedParts) || expectedParts.length === 0) return true;
  const compactValues = values.map((value) => value.replace(/\s+/g, "").toLowerCase());
  return expectedParts.every((part) => {
    const compactPart = String(part).replace(/\s+/g, "").toLowerCase();
    return compactValues.some((value) => value.includes(compactPart));
  });
}

function analyzeDetailedChecks(testCase, before, after, events) {
  const exposurePlans = eventTypes(events, "realtime.tool_exposure.plan");
  const exposureData = exposurePlans.map((event) => eventData(event));
  const exposedModules = [
    ...new Set(exposureData.flatMap((data) => (Array.isArray(data.selectedModules) ? data.selectedModules : [])).filter(Boolean))
  ];
  const exposedTools = [
    ...new Set(exposureData.flatMap((data) => (Array.isArray(data.exposedTools) ? data.exposedTools : [])).filter(Boolean))
  ];
  const functionToolCalls = eventTypes(events, "realtime.function_call.tool");
  const functionToolNames = functionToolCalls.map((event) => event.toolName).filter(Boolean);
  const queryValues = [
    ...new Set([...stringValuesFromEventData(events, ["query"]), ...stringValuesFromAuditLogs(after.auditLogs, ["query"])])
  ];
  const channelValues = [
    ...new Set([
      ...stringValuesFromEventData(events, ["channelName", "selectedChannelName"]),
      ...stringValuesFromAuditLogs(after.auditLogs, ["channelName", "selectedChannelName"])
    ])
  ];
  const widgetIds = [
    ...new Set([...stringValuesFromEventData(events, ["widgetId"]), ...stringValuesFromAuditLogs(after.auditLogs, ["widgetId"])])
  ];
  const musicEvents = events.filter((event) => typeof event.type === "string" && event.type.startsWith("music."));
  const tvEvents = events.filter((event) => typeof event.type === "string" && event.type.startsWith("tv."));
  const musicPlayback = musicEvents
    .filter((event) => event.type === "music.play.result" || event.type === "music.play.start" || event.type === "music.search.result")
    .map((event) => {
      const data = eventData(event);
      return [
        event.type,
        event.status,
        typeof data.source === "string" ? `source=${data.source}` : "",
        typeof data.musicKitAvailable === "boolean" ? `musicKit=${data.musicKitAvailable}` : "",
        typeof data.musicKitAuthorized === "boolean" ? `authorized=${data.musicKitAuthorized}` : "",
        typeof data.hasPreview === "boolean" ? `preview=${data.hasPreview}` : "",
        typeof data.errorCode === "string" ? `error=${data.errorCode}` : ""
      ]
        .filter(Boolean)
        .join(" ");
    });
  const tvOperationEvents = events.filter((event) => {
    if (typeof event.toolName === "string" && event.toolName.startsWith("tv.")) return true;
    if (event.toolName === "board.add_widget" && typeof event.message === "string" && /电视|频道/.test(event.message)) return true;
    return false;
  });
  const tvPlayback = [...tvEvents, ...tvOperationEvents]
    .map((event) => {
      const data = eventData(event);
      return [
        event.type,
        event.status,
        event.toolName ? `tool=${event.toolName}` : "",
        typeof event.message === "string" ? event.message : "",
        typeof data.channelName === "string" ? `channel=${data.channelName}` : "",
        typeof data.selectedChannelName === "string" ? `selected=${data.selectedChannelName}` : "",
        typeof data.errorCode === "string" ? `error=${data.errorCode}` : ""
      ]
        .filter(Boolean)
        .join(" ");
    })
    .slice(-5);
  const expectedModulesOk = expectedTextHit(exposedModules, testCase.expectedModules);
  const expectedQueryOk = expectedTextHit(queryValues, testCase.expectedQueryIncludes);
  const expectedChannelOk = expectedTextHit(channelValues, testCase.expectedChannelIncludes);
  return {
    exposedModules,
    exposedTools,
    functionToolNames,
    queryValues,
    channelValues,
    widgetIds,
    expectedModulesOk,
    expectedQueryOk,
    expectedChannelOk,
    musicPlayback,
    tvPlayback,
    uiBeforeWidgetCount: before.widgets.length,
    uiAfterWidgetCount: after.widgets.length
  };
}

function analyzeRealtimeToolPath(events) {
  const exposurePlans = eventTypes(events, "realtime.tool_exposure.plan");
  const selectionSuccess = events.find((event) => event.type === "realtime.tool_selection.success");
  const localShortcutEvent = events.find(
    (event) =>
      event.type === "realtime.tool_selection.local_bulk_shortcut" ||
      event.type === "realtime.tool_selection.local_add_widget_shortcut"
  );
  const selectedTool = selectionSuccess?.toolName || localShortcutEvent?.toolName || "";
  const matchingExposurePlan = exposurePlans.find((event) => {
    const exposedTools = eventData(event).exposedTools;
    return Array.isArray(exposedTools) && (!selectedTool || exposedTools.includes(selectedTool));
  });
  const selectionIndex = eventIndex(events, (event) => event.type === "realtime.function_call.selection");
  const selectionSuccessIndex = eventIndex(events, (event) => event.type === "realtime.tool_selection.success");
  const resultDeferredIndex = eventIndex(events, (event) => event.type === "realtime.tool_selection.result_deferred");
  const resultSentIndex = eventIndex(events, (event) => event.type === "realtime.tool_selection.result_send_after_session_update");
  const sessionUpdatedAfterSelection = events.some(
    (event, index) =>
      event.type === "realtime.session.updated" &&
      event.status === "connected" &&
      index > Math.max(selectionSuccessIndex, resultDeferredIndex)
  );
  const localShortcut = Boolean(localShortcutEvent);
  const fallbackExecuteCommand = events.some(
    (event) =>
      event.toolName === "assistant.execute_command" ||
      event.toolName === "assistant__dot__execute_command" ||
      (event.type === "realtime.function_call.tool" && event.toolName === "assistant.execute_command")
  );
  const selectedToolExposed = Boolean(selectedTool && matchingExposurePlan);
  return {
    exposurePlan: exposurePlans.length > 0,
    selectedTool,
    selectedToolExposed,
    scopedSessionUpdated: resultSentIndex >= 0 && sessionUpdatedAfterSelection,
    localShortcut,
    fallbackExecuteCommand,
    selectionIndex,
    selectionSuccessIndex,
    resultSentIndex,
    exposedTools: Array.isArray(eventData(matchingExposurePlan).exposedTools)
      ? eventData(matchingExposurePlan).exposedTools
      : []
  };
}

function classifyFailure({ events, expected, uiChanged }) {
  const realtimePath = analyzeRealtimeToolPath(events);
  if (
    !eventTypes(events, "realtime.microphone.stream").some((event) => event.status === "success") &&
    !eventTypes(events, "realtime.voice.speech_started").length
  ) {
    return "audio_permission_denied";
  }
  if (!eventTypes(events, "realtime.voice.speech_started").length) return "vad_not_triggered";
  if (!eventTypes(events, "realtime.voice.speech_stopped").length) return "vad_not_committed";
  if (!eventTypes(events, "realtime.voice.user_transcript").some((event) => event.status === "success")) return "transcript_empty";
  if (!eventTypes(events, "realtime.session.updated").some((event) => event.status === "connected")) return "session_update_missing";
  if (!events.some((event) => event.type === "realtime.function_call.selection" || event.type === "realtime.function_call.tool")) return "function_call_missing";
  if (!realtimePath.exposurePlan) return "tool_exposure_missing";
  if (realtimePath.selectedTool && !realtimePath.selectedToolExposed) return "selected_tool_not_exposed";
  if (!realtimePath.localShortcut && realtimePath.resultSentIndex < 0) return "scoped_session_update_timeout";
  if (realtimePath.fallbackExecuteCommand) return "fallback_execute_command_used";
  if (!events.some((event) => event.type === "assistant.operation" && event.status === "success")) return "harness_rejected";
  const tools = executedToolNames({ auditLogs: [] }, events);
  if (!expected.some((name) => tools.includes(name))) return "tool_execution_failed";
  if (!uiChanged) return "ui_state_not_changed";
  return "";
}

function assertCase(testCase, before, after) {
  const events = after.diagnostics?.events ?? [];
  const tools = executedToolNames(after, events);
  const speechStarted = eventTypes(events, "realtime.voice.speech_started").length;
  const speechStopped = eventTypes(events, "realtime.voice.speech_stopped").length;
  const transcript = eventTypes(events, "realtime.voice.user_transcript").find((event) => event.status === "success")?.data?.transcript ?? "";
  const functionCalls = events.filter((event) => event.type === "realtime.function_call.selection" || event.type === "realtime.function_call.tool");
  const operationSuccess = events.some((event) => event.type === "assistant.operation" && event.status === "success");
  const expectedHit = testCase.expected.some((name) => tools.includes(name));
  const uiChanged = before.bodyText !== after.bodyText || before.widgets.length !== after.widgets.length;
  const realtimePath = analyzeRealtimeToolPath(events);
  const detailed = analyzeDetailedChecks(testCase, before, after, events);
  const failure = classifyFailure({ events, expected: testCase.expected, uiChanged });
  const detailFailure =
    !failure && !detailed.expectedModulesOk
      ? "expected_module_not_exposed"
      : !failure && !detailed.expectedQueryOk
        ? "query_missing_or_wrong"
        : !failure && !detailed.expectedChannelOk
          ? "channel_missing_or_wrong"
          : failure;
  return {
    passed: !detailFailure && operationSuccess && expectedHit && uiChanged,
    failure: detailFailure,
    transcript,
    speechStarted,
    speechStopped,
    functionCallCount: functionCalls.length,
    operationSuccess,
    expectedHit,
    uiChanged,
    tools,
    exposurePlan: realtimePath.exposurePlan,
    selectedTool: realtimePath.selectedTool,
    selectedToolExposed: realtimePath.selectedToolExposed,
    scopedSessionUpdated: realtimePath.scopedSessionUpdated,
    localShortcut: realtimePath.localShortcut,
    fallbackExecuteCommand: realtimePath.fallbackExecuteCommand,
    exposedTools: realtimePath.exposedTools,
    detailed
  };
}

async function runCase(playwright, options, runDir, userDataDir, testCase, isFirstCase) {
  const caseDir = path.join(runDir, testCase.id);
  fs.mkdirSync(caseDir, { recursive: true });
  const audioPath = path.join(options.audioRoot, testCase.audio);
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Missing audio fixture: ${audioPath}`);
  }
  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: !options.headed,
    viewport: { width: 1280, height: 820 },
    permissions: ["microphone"],
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${audioPath}`,
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
  await context.addInitScript(() => {
    window.__xiaozhuobanLiveVoiceDiagnosticEvents = [];
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "xiaozhuoban.assistant.diagnosticBuffer") {
        try {
          const parsed = JSON.parse(String(value));
          if (Array.isArray(parsed)) {
            const existing = Array.isArray(window.__xiaozhuobanLiveVoiceDiagnosticEvents)
              ? window.__xiaozhuobanLiveVoiceDiagnosticEvents
              : [];
            const seen = new Set(existing.map((event) => JSON.stringify(event)));
            for (const event of parsed) {
              const serialized = JSON.stringify(event);
              if (!seen.has(serialized)) {
                existing.push(event);
                seen.add(serialized);
              }
            }
            window.__xiaozhuobanLiveVoiceDiagnosticEvents = existing;
          }
        } catch {
          // Diagnostics capture must not alter app behavior.
        }
      }
      return originalSetItem.apply(this, arguments);
    };
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installExternalMocks(page);
  await page.goto(options.site, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await waitForAppReady(page);
  if (isFirstCase) {
    await clearAllAppState(page);
    await page.goto(options.site, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForAppReady(page);
  }
  await clearCaseEvidence(page);
  await waitForAppReady(page);
  const before = await snapshot(page);
  await page.screenshot({ path: path.join(caseDir, "before.png"), fullPage: false });
  await page.getByTestId("voice-assistant-dock").locator(".voice-assistant-dock__orb").click({ force: true });
  await page
    .waitForFunction(
      () => {
        const events = window.__xiaozhuobanExportAssistantDiagnostics?.()?.events || [];
        return (
          events.some((event) => event.type === "assistant.operation" && event.status === "success") ||
          events.some((event) => event.type === "assistant.operation" && event.status === "failed") ||
          events.some((event) => event.type === "realtime.event.error")
        );
      },
      null,
      { timeout: options.waitMs }
    )
    .catch(() => undefined);
  await page.waitForTimeout(1_500);
  const after = await snapshot(page);
  await page.screenshot({ path: path.join(caseDir, "after.png"), fullPage: false }).catch(() => undefined);
  await waitForPersistedWidgetCount(page, after.widgets.length);
  fs.writeFileSync(
    path.join(caseDir, "trace.json"),
    JSON.stringify({ id: testCase.id, command: testCase.command, before, after, consoleErrors }, null, 2)
  );
  const assertion = assertCase(testCase, before, after);
  await context.close();
  return { ...testCase, ...assertion, consoleErrors, evidenceDir: path.relative(repoRoot, caseDir) };
}

function writeReport(runId, results, options) {
  const passed = results.filter((item) => item.passed).length;
  const functionCallCount = results.filter((item) => item.functionCallCount > 0).length;
  const exposurePlanCount = results.filter((item) => item.exposurePlan).length;
  const selectedToolExposedCount = results.filter((item) => item.selectedToolExposed).length;
  const scopedSessionUpdateCount = results.filter((item) => item.scopedSessionUpdated).length;
  const localShortcutCount = results.filter((item) => item.localShortcut).length;
  const fallbackExecuteCommandCount = results.filter((item) => item.fallbackExecuteCommand).length;
  const rows = results
    .map((item) => {
      const screenshots = `[before](${item.evidenceDir}/before.png) / [after](${item.evidenceDir}/after.png) / [trace](${item.evidenceDir}/trace.json)`;
      const path = [
        item.exposurePlan ? "exposure" : "no_exposure",
        item.selectedToolExposed ? "selected_exposed" : "selected_unchecked",
        item.scopedSessionUpdated ? "scoped_updated" : item.localShortcut ? "local_shortcut" : "no_scoped_update"
      ].join(" / ");
      return `| ${item.id} | ${item.passed ? "pass" : "fail"} | ${item.command} | ${String(item.transcript).replace(/\|/g, "/")} | ${item.detailed.exposedModules.join(", ") || "-"} | ${item.detailed.exposedTools.join(", ") || "-"} | ${item.selectedTool || "-"} | ${item.detailed.functionToolNames.join(", ") || "-"} | ${item.detailed.queryValues.join(", ") || "-"} | ${item.detailed.channelValues.join(", ") || "-"} | ${item.detailed.widgetIds.join(", ") || "-"} | ${item.detailed.musicPlayback.join("<br>") || "-"} | ${item.detailed.tvPlayback.join("<br>") || "-"} | ${item.uiChanged ? "yes" : "no"} (${item.detailed.uiBeforeWidgetCount}->${item.detailed.uiAfterWidgetCount}) | ${path} | ${item.failure || "-"} | ${screenshots} |`;
    })
    .join("\n");
  const relativeAudioRoot = path.relative(repoRoot, options.audioRoot) || ".";
  const relativeOutputRoot = path.relative(repoRoot, options.outputRoot) || ".";
  const body = `# Realtime Live Voice Smoke Report

- Run: ${runId}
- Model: gpt-realtime-2
- Transport: Chrome fake microphone -> WebRTC Realtime session -> data channel
- Total: ${results.length}
- Passed: ${passed}
- Failed: ${results.length - passed}
- Function-call commands: ${functionCallCount}/${results.length}
- Tool exposure traces: ${exposurePlanCount}/${results.length}
- Selected tools inside exposedTools: ${selectedToolExposedCount}/${results.length}
- Scoped session.updated closures: ${scopedSessionUpdateCount}/${results.length}
- Local shortcut closures after selection: ${localShortcutCount}/${results.length}
- Fallback execute_command uses: ${fallbackExecuteCommandCount}
- Audio fixtures: ${relativeAudioRoot}
- Evidence root: ${relativeOutputRoot}/${runId}
- Secret handling: Realtime credentials are never written to this report.

| id | result | spoken command | transcript | exposed modules | exposed tools | selected tool | function tools | query args | channel args | widgetIds | music playback/token | tv playback | UI changed | realtime path | failure | evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows}
`;
  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.writeFileSync(options.reportPath, body);
}

async function main() {
  const options = parseArgs(process.argv);
  const testCases = loadCases(options.casesFile);
  const playwright = requirePlaywright();
  const devServer = await startDevServerIfNeeded(options.site, options.startDev);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(options.outputRoot, runId);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `xiaozhuoban-live-voice-${runId}-`));
  fs.mkdirSync(runDir, { recursive: true });
  const results = [];
  try {
    for (const [index, testCase] of testCases.entries()) {
      const result = await runCase(playwright, options, runDir, userDataDir, testCase, index === 0);
      results.push(result);
      console.log(`${result.passed ? "pass" : "fail"} ${result.id} ${result.command}${result.failure ? ` (${result.failure})` : ""}`);
    }
  } finally {
    devServer?.kill("SIGTERM");
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // Temporary Chrome profile cleanup is best-effort.
    }
  }
  writeReport(runId, results, options);
  const passed = results.filter((item) => item.passed).length;
  console.log(JSON.stringify({ runId, total: results.length, passed, failed: results.length - passed, reportPath: options.reportPath }, null, 2));
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
