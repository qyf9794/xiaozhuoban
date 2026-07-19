#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const defaultReportPath = path.join(repoRoot, "docs/realtime-live-voice-smoke-report.md");
const defaultOutputRoot = path.join(repoRoot, "output/playwright/realtime-live-voice-smoke");
const defaultAudioRoot = path.join(repoRoot, "tests/audio/realtime-live-smoke");
const defaultPlaybackAudio = path.join(repoRoot, "apps/web/public/media/dial-clock-hourly.m4a");

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
    casesFile: "",
    playbackAudio: defaultPlaybackAudio,
    sessionAudio: "",
    respectAutoplayPolicy: false,
    simulateAutoplayBlockOnce: false,
    simulateMusicKitMobile: false
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
    else if (item === "--playback-audio") options.playbackAudio = path.resolve(argv[++index]);
    else if (item.startsWith("--playback-audio=")) options.playbackAudio = path.resolve(item.slice("--playback-audio=".length));
    else if (item === "--session-audio") options.sessionAudio = path.resolve(argv[++index]);
    else if (item.startsWith("--session-audio=")) options.sessionAudio = path.resolve(item.slice("--session-audio=".length));
    else if (item === "--respect-autoplay-policy") options.respectAutoplayPolicy = true;
    else if (item === "--simulate-autoplay-block-once") options.simulateAutoplayBlockOnce = true;
    else if (item === "--simulate-musickit-mobile") options.simulateMusicKitMobile = true;
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
    if (testCase.requirePlaybackVerified && (typeof testCase.title !== "string" || !testCase.title.trim())) {
      throw new Error(`Case ${testCase.id} requires a title when playback verification is enabled`);
    }
    if (testCase.effect && !["playing", "paused"].includes(testCase.effect.state)) {
      if (testCase.effect.kind === "music" || testCase.effect.kind === "tv") {
        throw new Error(`Case ${testCase.id} effect.state must be playing or paused`);
      }
    }
    if (!testCase.effect || typeof testCase.effect.kind !== "string") {
      throw new Error(`Case ${testCase.id} must declare an authoritative observable effect`);
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

function installAutoplayBlockSimulationScript() {
  const originalPlay = HTMLMediaElement.prototype.play;
  const blockedElements = new WeakSet();
  HTMLMediaElement.prototype.play = function simulatedPolicyPlay() {
    if (this instanceof HTMLVideoElement && !this.muted && !blockedElements.has(this)) {
      blockedElements.add(this);
      return Promise.reject(new DOMException("play() failed because the user did not interact with the document first", "NotAllowedError"));
    }
    return originalPlay.call(this);
  };
}

function installMusicKitMobileSimulationScript() {
  let playbackStartedAt = 0;
  let pausedAt = 0;
  const instance = {
    isAuthorized: true,
    storefrontId: "cn",
    currentPlaybackDuration: 30,
    get currentPlaybackTime() {
      return playbackStartedAt > 0 ? pausedAt + (performance.now() - playbackStartedAt) / 1000 : pausedAt;
    },
    get currentPlaybackProgress() {
      return Math.min(1, this.currentPlaybackTime / this.currentPlaybackDuration);
    },
    authorize() {
      this.isAuthorized = true;
      return Promise.resolve("simulated-user-token");
    },
    async setQueue(descriptor) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      this.queueDescriptor = descriptor;
      playbackStartedAt = 0;
      pausedAt = 0;
    },
    play() {
      if (navigator.userActivation && navigator.userActivation.isActive !== true) {
        const error = new Error("Playback requires a user gesture on mobile");
        error.name = "NotAllowedError";
        return Promise.reject(error);
      }
      playbackStartedAt = performance.now();
      return Promise.resolve();
    },
    pause() {
      if (playbackStartedAt > 0) {
        pausedAt += (performance.now() - playbackStartedAt) / 1000;
        playbackStartedAt = 0;
      }
      return Promise.resolve();
    },
    api: {
      async search(term) {
        const compactTerm = String(term || "").replace(/\s+/g, "");
        const title = compactTerm.includes("红豆") ? "红豆" : compactTerm || "测试歌曲";
        return {
          songs: {
            data: [
              {
                id: "simulated-mobile-song",
                type: "songs",
                attributes: {
                  name: title,
                  artistName: compactTerm.includes("王菲") ? "王菲" : "测试歌手"
                }
              }
            ]
          }
        };
      }
    }
  };
  window.MusicKit = {
    configure: () => instance,
    getInstance: () => instance
  };
  window.__xiaozhuobanSimulatedMusicKit = instance;
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

async function startDevServerIfNeeded(site, enabled, options) {
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
      XIAOZHUOBAN_E2E_REALTIME_AUTH_BYPASS: "true",
      ...(options.simulateMusicKitMobile ? { VITE_APPLE_MUSIC_DEVELOPER_TOKEN: "e2e-simulated-developer-token" } : {})
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

async function installExternalMocks(page, testCaseOrCases, playbackAudioPath) {
  const playbackAudio = fs.readFileSync(playbackAudioPath);
  const playbackContentType = playbackAudioPath.endsWith(".wav")
    ? "audio/wav"
    : playbackAudioPath.endsWith(".mp4")
      ? "video/mp4"
      : "application/octet-stream";
  const musicCases = Array.isArray(testCaseOrCases) ? testCaseOrCases : [testCaseOrCases];
  const tvCases = musicCases.filter((candidate) => typeof candidate.channelName === "string" && candidate.channelName.trim());
  const tvPlaylist = [
    "#EXTM3U",
    ...tvCases.flatMap((candidate) => [
      `#EXTINF:-1,${candidate.channelName.trim()}`,
      `https://example.test/tv-${encodeURIComponent(candidate.id)}.wav`
    ])
  ].join("\n");
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
    const requestUrl = new URL(route.request().url());
    const term = normalizedText(requestUrl.searchParams.get("term") || "");
    const matchedCase = musicCases.find((candidate) => {
      const title = typeof candidate.title === "string" ? normalizedText(candidate.title) : "";
      const artist = typeof candidate.artist === "string" ? normalizedText(candidate.artist) : "";
      return (title && term.includes(title)) || (artist && term.includes(artist));
    });
    const testCase = matchedCase ?? musicCases[0];
    const caseNumber = Number(String(testCase.id).replace(/\D/g, "")) || 1;
    const title = typeof testCase.title === "string" && testCase.title.trim() ? testCase.title.trim() : "红豆";
    const artist = typeof testCase.artist === "string" && testCase.artist.trim() ? testCase.artist.trim() : "王菲";
    const queue = Array.isArray(testCase.queue) && testCase.queue.length
      ? testCase.queue.filter((item) => item && typeof item.title === "string" && item.title.trim())
      : [{ title, artist }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCount: queue.length,
        results: queue.map((item, index) => ({
            wrapperType: "track",
            kind: "song",
            trackId: 10000 + caseNumber * 10 + index,
            trackName: item.title,
            artistName: typeof item.artist === "string" && item.artist.trim() ? item.artist.trim() : artist,
            collectionName: "测试歌单",
            artworkUrl100: "https://example.test/music.jpg",
            previewUrl: `https://example.test/music-${encodeURIComponent(testCase.id)}-${index}.wav`,
            trackViewUrl: `https://example.test/music-${encodeURIComponent(testCase.id)}-${index}`
          }))
      })
    });
  });
  await page.route("https://raw.githubusercontent.com/YueChan/Live/refs/heads/main/Global.m3u", async (route) => {
    await route.fulfill({ status: 200, contentType: "audio/x-mpegurl", body: tvPlaylist });
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
    await route.fulfill({ status: 200, contentType: playbackContentType, body: playbackAudio });
  });
}

async function seedTvAssistantChannelCatalog(page, testCaseOrCases) {
  const cases = Array.isArray(testCaseOrCases) ? testCaseOrCases : [testCaseOrCases];
  const channels = cases
    .filter((candidate) => typeof candidate.channelName === "string" && candidate.channelName.trim())
    .map((candidate, index) => ({
      id: `voice_gate_tv_${candidate.id || index}`,
      name: candidate.channelName.trim(),
      url: `https://example.test/tv-${encodeURIComponent(candidate.id || index)}.wav`
    }));
  if (channels.length === 0) return;
  await page.evaluate((catalogChannels) => {
    localStorage.setItem(
      "xiaozhuoban.tv.assistantChannelCatalog.v1",
      JSON.stringify({
        channelNames: catalogChannels.map((channel) => channel.name),
        channels: catalogChannels,
        channelCount: catalogChannels.length,
        updatedAt: new Date().toISOString()
      })
    );
  }, channels);
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
    window.__xiaozhuobanLiveVoiceDiagnosticEvents = [];
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

async function ensureMusicWidgetMounted(page) {
  const heading = page.getByRole("heading", { name: "音乐播放器", exact: true });
  if ((await heading.count()) > 0) return;
  await page.getByRole("button", { name: "添加 Widget", exact: true }).click();
  await page.getByRole("button", { name: "音乐播放器", exact: true }).click();
  await heading.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(300);
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const widgets = Array.from(document.querySelectorAll("[data-widget-id]")).map((element) => ({
      id: element.getAttribute("data-widget-id") || "",
      text: element.innerText,
      formValues: Array.from(element.querySelectorAll("input, textarea, select"))
        .map((control) => control.value)
        .filter(Boolean),
      className: String(element.className || "")
    }));
    const musicInput = document.querySelector('input[aria-label="音乐搜索"]');
    const musicWidget = musicInput?.closest("[data-widget-id]");
    const musicProgressElement = musicWidget?.querySelector('[role="progressbar"][aria-label="音乐播放进度"]');
    const musicControl = musicWidget?.querySelector('button[title="暂停"], button[title="播放"]');
    const artwork = musicWidget?.querySelector("img[alt]");
    const musicWidgetId = musicWidget?.getAttribute("data-widget-id") || "";
    const musicAudio = Array.from(document.querySelectorAll("audio[data-music-widget-id]"))
      .find((audio) => audio.dataset.musicWidgetId === musicWidgetId);
    const musicState = musicWidget
      ? {
          title: artwork?.getAttribute("alt") || "",
          control: musicControl?.getAttribute("title") || "",
          progress: Number(musicProgressElement?.getAttribute("aria-valuenow") || "0"),
          currentTime: Number(musicAudio?.currentTime || 0),
          paused: musicAudio ? musicAudio.paused : true,
          readyState: musicAudio?.readyState ?? 0,
          networkState: musicAudio?.networkState ?? 0,
          currentSrc: musicAudio?.currentSrc || musicAudio?.getAttribute("src") || "",
          recoveryVisible: Boolean(
            musicWidget?.querySelector('button[aria-label^="播放"]:not([aria-label="播放音乐"])')
          )
        }
      : null;
    const exportedAppState = window.__xiaozhuobanExportAppState?.();
    const indexedDbWidgets = await new Promise((resolve) => {
      const request = indexedDB.open("xiaozhuoban");
      request.onerror = () => resolve([]);
      request.onupgradeneeded = () => resolve([]);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("widgetInstances") || !db.objectStoreNames.contains("widgetDefs")) {
          db.close();
          resolve([]);
          return;
        }
        const transaction = db.transaction(["widgetInstances", "widgetDefs"], "readonly");
        const instanceRequest = transaction.objectStore("widgetInstances").getAll();
        const definitionRequest = transaction.objectStore("widgetDefs").getAll();
        transaction.onerror = () => {
          db.close();
          resolve([]);
        };
        transaction.oncomplete = () => {
          const definitions = new Map(
            (definitionRequest.result || []).map((definition) => [definition.id, definition])
          );
          const rows = (instanceRequest.result || []).map((instance) => ({
            ...instance,
            definitionType: definitions.get(instance.definitionId)?.type || "",
            definitionName: definitions.get(instance.definitionId)?.name || ""
          }));
          db.close();
          resolve(rows);
        };
      };
    });
    const persistedWidgets = Array.isArray(exportedAppState?.persistedWidgets)
      ? exportedAppState.persistedWidgets
      : indexedDbWidgets;
    const tvVideo = document.querySelector(".tv-video-box video");
    const tvWidget = tvVideo?.closest("[data-widget-id]");
    const activeTvChannel = tvWidget?.querySelector(".tv-channel-item.is-active span");
    const tvState = tvVideo
      ? {
          widgetId: tvWidget?.getAttribute("data-widget-id") || "",
          channel: activeTvChannel?.textContent?.trim() || "",
          currentTime: Number(tvVideo.currentTime || 0),
          paused: tvVideo.paused,
          muted: tvVideo.muted,
          ended: tvVideo.ended,
          readyState: tvVideo.readyState,
          networkState: tvVideo.networkState,
          currentSrc: tvVideo.currentSrc || tvVideo.getAttribute("src") || "",
          videoWidth: tvVideo.videoWidth,
          videoHeight: tvVideo.videoHeight,
          playbackError: tvWidget?.querySelector(".tv-video-overlay-error")?.textContent?.trim() || "",
          unlockVisible: Boolean(tvWidget?.querySelector('button[aria-label="开启电视声音"]'))
        }
      : null;
    return {
      bodyText: document.body.innerText,
      widgets,
      persistedWidgets,
      musicState,
      tvState,
      musicProgress: Array.from(document.querySelectorAll('[role="progressbar"][aria-label="音乐播放进度"]'))
        .map((element) => Number(element.getAttribute("aria-valuenow") || "0"))
        .filter(Number.isFinite),
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

function minimumPlaybackAdvance(testCase) {
  const configured = Number(testCase.effect?.minimumAdvanceSeconds);
  return Number.isFinite(configured) && configured > 0 ? configured : 0.05;
}

function executedToolNames(snapshotAfter, events) {
  const fromAudit = (snapshotAfter.auditLogs ?? []).map((log) => log.toolName).filter(Boolean);
  const fromEvents = events
    .filter((event) => event.type === "realtime.function_call.tool" || event.type === "assistant.operation")
    .map((event) => event.toolName)
    .filter(Boolean);
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
  const compactValues = values.map(normalizedText);
  return expectedParts.every((part) => {
    const compactPart = normalizedText(part);
    return compactValues.some((value) => value.includes(compactPart) || approximatelyIncludes(value, compactPart));
  });
}

function editDistanceAtMostOne(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + (leftIndex < left.length || rightIndex < right.length ? 1 : 0) <= 1;
}

function approximatelyIncludes(value, expected) {
  if (expected.length < 3 || value.length < expected.length - 1) return false;
  for (let size = Math.max(1, expected.length - 1); size <= expected.length + 1; size += 1) {
    for (let index = 0; index + size <= value.length; index += 1) {
      if (editDistanceAtMostOne(value.slice(index, index + size), expected)) return true;
    }
  }
  return false;
}

function findPersistedWidget(snapshotValue, definitionType) {
  return (snapshotValue.persistedWidgets ?? []).find((widget) => widget.definitionType === definitionType);
}

function normalizedJsonContains(value, expected) {
  return normalizedText(JSON.stringify(value ?? null)).includes(normalizedText(expected));
}

function observableValueMatches(actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((expectedItem) => actual.some((actualItem) => observableValueMatches(actualItem, expectedItem)));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    return Object.entries(expected).every(([key, value]) => observableValueMatches(actual[key], value));
  }
  if (typeof expected === "string") return normalizedText(actual) === normalizedText(expected);
  return Object.is(actual, expected);
}

function verifyObservableEffect(testCase, before, after) {
  const effect = testCase.effect ?? {};
  if (effect.kind === "music" || effect.kind === "tv") {
    return { verified: true, failure: "", observed: effect.kind === "music" ? after.musicState : after.tvState };
  }
  if (effect.kind === "widget_absent") {
    const beforeWidget = findPersistedWidget(before, effect.widgetType);
    const afterWidget = findPersistedWidget(after, effect.widgetType);
    const preserved = !effect.preserveOtherWidgets || (before.persistedWidgets ?? [])
      .filter((widget) => widget.definitionType !== effect.widgetType)
      .every((widget) => (after.persistedWidgets ?? []).some((candidate) => candidate.id === widget.id));
    const verified = Boolean(beforeWidget) && !afterWidget && preserved;
    return {
      verified,
      failure: verified ? "" : !beforeWidget ? "observable_precondition_missing" : afterWidget ? "ui_or_state_effect_missing" : "unrelated_widget_changed",
      observed: {
        beforeWidgetId: beforeWidget?.id ?? "",
        afterWidgetId: afterWidget?.id ?? "",
        preserved
      }
    };
  }
  if (effect.kind === "widget_state") {
    const widget = findPersistedWidget(after, effect.widgetType);
    const beforeWidget = findPersistedWidget(before, effect.widgetType);
    const stateMatches = widget && observableValueMatches(widget.state ?? {}, effect.state ?? {});
    const visibleWidget = widget ? (after.widgets ?? []).find((candidate) => candidate.id === widget.id) : undefined;
    const visibleIncludes = Array.isArray(effect.visibleIncludes) ? effect.visibleIncludes : [];
    const visibleSurface = [visibleWidget?.text ?? "", ...(visibleWidget?.formValues ?? [])].join("\n");
    const visibleMatches = visibleIncludes.every((part) => normalizedJsonContains(visibleSurface, part));
    const stateExcludes = Array.isArray(effect.stateExcludes) ? effect.stateExcludes : [];
    const excludesMatch = stateExcludes.every((part) => !normalizedJsonContains(widget?.state ?? {}, part));
    const stateChanged = !effect.requireStateChange || JSON.stringify(beforeWidget?.state ?? null) !== JSON.stringify(widget?.state ?? null);
    const verified = Boolean(widget && stateMatches && visibleMatches && excludesMatch && stateChanged);
    return {
      verified,
      failure: verified ? "" : !widget ? "ui_or_state_effect_missing" : !stateMatches ? "authoritative_state_wrong" : !visibleMatches ? "visible_ui_effect_missing" : !excludesMatch ? "authoritative_state_wrong" : "authoritative_state_unchanged",
      observed: {
        widgetId: widget?.id ?? "",
        definitionType: widget?.definitionType ?? "",
        state: widget?.state ?? null,
        visibleText: visibleWidget?.text ?? "",
        visibleFormValues: visibleWidget?.formValues ?? []
      }
    };
  }
  return { verified: false, failure: "observable_effect_unsupported", observed: null };
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
        typeof data.playbackVerified === "boolean" ? `verified=${data.playbackVerified}` : "",
        typeof data.playbackMuted === "boolean" ? `muted=${data.playbackMuted}` : "",
        typeof data.usedMutedFallback === "boolean" ? `mutedFallback=${data.usedMutedFallback}` : "",
        typeof data.advancedBy === "number" ? `advanced=${data.advancedBy.toFixed(3)}s` : "",
        typeof data.videoWidth === "number" && typeof data.videoHeight === "number"
          ? `frame=${data.videoWidth}x${data.videoHeight}`
          : "",
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
        typeof data.playbackVerified === "boolean" ? `verified=${data.playbackVerified}` : "",
        typeof data.playbackMuted === "boolean" ? `muted=${data.playbackMuted}` : "",
        typeof data.usedMutedFallback === "boolean" ? `mutedFallback=${data.usedMutedFallback}` : "",
        typeof data.advancedBy === "number" ? `advanced=${data.advancedBy.toFixed(3)}s` : "",
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
  const uiChanged =
    before.bodyText !== after.bodyText ||
    before.widgets.length !== after.widgets.length ||
    JSON.stringify(before.persistedWidgets) !== JSON.stringify(after.persistedWidgets) ||
    JSON.stringify(before.musicState) !== JSON.stringify(after.musicState) ||
    JSON.stringify(before.tvState) !== JSON.stringify(after.tvState);
  const realtimePath = analyzeRealtimeToolPath(events);
  const detailed = analyzeDetailedChecks(testCase, before, after, events);
  const verifiedPlaybackEvents = events.filter(
    (event) =>
      event.type === "music.play.result" &&
      event.status === "success" &&
      eventData(event).playbackVerified === true &&
      Number(eventData(event).advancedBy) >= minimumPlaybackAdvance(testCase)
  );
  const playbackVerified = verifiedPlaybackEvents.length > 0;
  const verifiedTvPlaybackEvents = events.filter(
    (event) =>
      event.type === "tv.play.result" &&
      event.status === "success" &&
      eventData(event).playbackVerified === true &&
      Number(eventData(event).advancedBy) >= minimumPlaybackAdvance(testCase) &&
      Number(eventData(event).videoWidth) > 0 &&
      Number(eventData(event).videoHeight) > 0
  );
  const tvPlaybackVerified = verifiedTvPlaybackEvents.length > 0;
  const expectedTvChannel = testCase.effect?.kind === "tv" ? testCase.effect?.channel ?? testCase.channelName ?? "" : "";
  const tvChannelVisible =
    !expectedTvChannel ||
    normalizedText(after.tvState?.channel).includes(normalizedText(expectedTvChannel)) ||
    normalizedText(after.bodyText).includes(normalizedText(expectedTvChannel));
  const tvPlayerStateVerified =
    !testCase.requireTvPlaybackVerified ||
    (tvPlaybackVerified &&
      Boolean(after.tvState) &&
      after.tvState.paused === false &&
      Number(after.tvState.currentTime) > 0 &&
      Number(after.tvState.videoWidth) > 0 &&
      Number(after.tvState.videoHeight) > 0);
  const expectedTitleVisible = !testCase.title || after.bodyText.includes(testCase.title);
  const playbackProgressVisible = Array.isArray(after.musicProgress) && after.musicProgress.some((value) => value > 0);
  const failure = classifyFailure({ events, expected: testCase.expected, uiChanged });
  const observableEffect = verifyObservableEffect(testCase, before, after);
  let detailFailure = failure;
  if (!detailFailure && !detailed.expectedModulesOk) detailFailure = "expected_module_not_exposed";
  else if (!detailFailure && !detailed.expectedQueryOk) detailFailure = "query_missing_or_wrong";
  else if (!detailFailure && !detailed.expectedChannelOk) detailFailure = "channel_missing_or_wrong";
  else if (!detailFailure && testCase.requirePlaybackVerified && !playbackVerified) detailFailure = "music_playback_not_verified";
  else if (!detailFailure && testCase.requirePlaybackVerified && !expectedTitleVisible) detailFailure = "music_title_not_visible";
  else if (!detailFailure && testCase.requirePlaybackVerified && !playbackProgressVisible) detailFailure = "music_progress_not_visible";
  else if (!detailFailure && testCase.requireTvPlaybackVerified && !tvPlaybackVerified) detailFailure = "tv_playback_not_verified";
  else if (!detailFailure && testCase.requireTvPlaybackVerified && !tvChannelVisible) detailFailure = "tv_channel_not_visible";
  else if (!detailFailure && testCase.requireTvPlaybackVerified && !tvPlayerStateVerified) detailFailure = "tv_player_state_wrong";
  else if (!detailFailure && !observableEffect.verified) detailFailure = observableEffect.failure;
  return {
    passed:
      !detailFailure &&
      operationSuccess &&
      expectedHit &&
      observableEffect.verified &&
      (!testCase.requirePlaybackVerified || (playbackVerified && expectedTitleVisible && playbackProgressVisible)) &&
      (!testCase.requireTvPlaybackVerified || (tvPlaybackVerified && tvChannelVisible && tvPlayerStateVerified)),
    failure: detailFailure,
    transcript,
    speechStarted,
    speechStopped,
    functionCallCount: functionCalls.length,
    operationSuccess,
    expectedHit,
    uiChanged,
    effectVerified: observableEffect.verified,
    observedEffect: observableEffect.observed,
    tools,
    exposurePlan: realtimePath.exposurePlan,
    selectedTool: realtimePath.selectedTool,
    selectedToolExposed: realtimePath.selectedToolExposed,
    scopedSessionUpdated: realtimePath.scopedSessionUpdated,
    localShortcut: realtimePath.localShortcut,
    fallbackExecuteCommand: realtimePath.fallbackExecuteCommand,
    playbackVerified,
    expectedTitleVisible,
    playbackProgressVisible,
    playbackAdvancedBy: verifiedPlaybackEvents.map((event) => Number(eventData(event).advancedBy)),
    tvPlaybackVerified,
    tvPlaybackAdvancedBy: verifiedTvPlaybackEvents.map((event) => Number(eventData(event).advancedBy)),
    tvChannelVisible,
    tvPlayerStateVerified,
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
  if (!fs.existsSync(options.playbackAudio)) {
    throw new Error(`Missing playback audio fixture: ${options.playbackAudio}`);
  }
  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: !options.headed,
    viewport: options.simulateMusicKitMobile ? { width: 390, height: 844 } : { width: 1280, height: 820 },
    isMobile: options.simulateMusicKitMobile,
    hasTouch: options.simulateMusicKitMobile,
    permissions: ["microphone"],
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${audioPath}%noloop`,
      ...(options.respectAutoplayPolicy ? [] : ["--autoplay-policy=no-user-gesture-required"])
    ]
  });
  if (options.simulateAutoplayBlockOnce) {
    await context.addInitScript(installAutoplayBlockSimulationScript);
  }
  if (options.simulateMusicKitMobile) {
    await context.addInitScript(installMusicKitMobileSimulationScript);
  }
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
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleErrors.push(`${message.text()}${location?.url ? ` @ ${location.url}` : ""}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installExternalMocks(page, testCase, options.playbackAudio);
  await page.goto(options.site, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await waitForAppReady(page);
  if (isFirstCase) {
    await clearAllAppState(page);
    await seedTvAssistantChannelCatalog(page, testCase);
    await page.goto(options.site, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await waitForAppReady(page);
  }
  await clearCaseEvidence(page);
  await waitForAppReady(page);
  consoleErrors.length = 0;
  pageErrors.length = 0;
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
  let autoplayRecovery = null;
  let afterUnlock = null;
  if (options.simulateAutoplayBlockOnce && testCase.requireTvPlaybackVerified) {
    const fallbackEvent = (after.diagnostics?.events ?? []).find(
      (event) =>
        event.type === "tv.play.result" &&
        event.status === "success" &&
        event.data?.playbackMuted === true &&
        event.data?.usedMutedFallback === true
    );
    const unlockButton = page.getByRole("button", { name: "开启电视声音", exact: true });
    const fallbackVisible = after.tvState?.muted === true && after.tvState?.unlockVisible === true && Boolean(fallbackEvent);
    if ((await unlockButton.count()) > 0) {
      await unlockButton.click();
      await page.waitForTimeout(500);
      afterUnlock = await snapshot(page);
      await page.screenshot({ path: path.join(caseDir, "after-unlock.png"), fullPage: false }).catch(() => undefined);
    }
    const unlockEvent = (afterUnlock?.diagnostics?.events ?? []).find(
      (event) => event.type === "tv.audio_unlock.result" && event.status === "success"
    );
    autoplayRecovery = {
      fallbackVisible,
      unlockClicked: Boolean(afterUnlock),
      unlockDiagnostic: Boolean(unlockEvent),
      playbackAudible: afterUnlock?.tvState?.muted === false,
      playbackContinues:
        afterUnlock?.tvState?.paused === false &&
        Number(afterUnlock?.tvState?.currentTime ?? 0) > Number(after.tvState?.currentTime ?? 0),
      unlockHidden: afterUnlock?.tvState?.unlockVisible === false
    };
    autoplayRecovery.verified = Object.values(autoplayRecovery).every(Boolean);
  }
  if (options.simulateMusicKitMobile && testCase.requirePlaybackVerified) {
    const initialBlockedEvent = (after.diagnostics?.events ?? []).find(
      (event) =>
        event.type === "music.play.result" &&
        event.status === "failed" &&
        event.data?.errorCode === "BROWSER_PLAYBACK_BLOCKED"
    );
    const recoveryButton = page.locator('button[aria-label^="播放"]:not([aria-label="播放音乐"])');
    const fallbackVisible = after.musicState?.recoveryVisible === true && Boolean(initialBlockedEvent);
    if ((await recoveryButton.count()) > 0) {
      await recoveryButton.first().click();
      await page
        .waitForFunction(
          () => {
            const events = window.__xiaozhuobanExportAssistantDiagnostics?.()?.events || [];
            return events.some(
              (event) =>
                event.type === "music.play.result" &&
                event.status === "success" &&
                event.data?.trigger === "user_gesture" &&
                event.data?.playbackVerified === true &&
                Number(event.data?.advancedBy) > 0
            );
          },
          null,
          { timeout: 10_000 }
        )
        .catch(() => undefined);
      afterUnlock = await snapshot(page);
      await page.screenshot({ path: path.join(caseDir, "after-unlock.png"), fullPage: false }).catch(() => undefined);
    }
    const recoveryEvent = (afterUnlock?.diagnostics?.events ?? []).find(
      (event) =>
        event.type === "music.play.result" &&
        event.status === "success" &&
        event.data?.trigger === "user_gesture" &&
        event.data?.playbackVerified === true &&
        Number(event.data?.advancedBy) > 0
    );
    autoplayRecovery = {
      fallbackVisible,
      unlockClicked: Boolean(afterUnlock),
      unlockDiagnostic: Boolean(recoveryEvent),
      playbackContinues: Number(recoveryEvent?.data?.advancedBy ?? 0) > 0,
      progressVisible: Number(afterUnlock?.musicState?.progress ?? 0) > 0,
      unlockHidden: afterUnlock?.musicState?.recoveryVisible === false
    };
    autoplayRecovery.verified = Object.values(autoplayRecovery).every(Boolean);
  }
  await waitForPersistedWidgetCount(page, after.widgets.length);
  fs.writeFileSync(
    path.join(caseDir, "trace.json"),
    JSON.stringify({ id: testCase.id, command: testCase.command, before, after, afterUnlock, autoplayRecovery, consoleErrors }, null, 2)
  );
  const assertionSnapshot = afterUnlock ?? after;
  const baseAssertion = assertCase(testCase, before, assertionSnapshot);
  let assertion = autoplayRecovery && !autoplayRecovery.verified
    ? { ...baseAssertion, passed: false, failure: "browser_playback_recovery_failed" }
    : baseAssertion;
  if (options.simulateMusicKitMobile && autoplayRecovery?.verified) {
    const recoveryPathPassed =
      baseAssertion.speechStarted > 0 &&
      baseAssertion.speechStopped > 0 &&
      baseAssertion.functionCallCount > 0 &&
      (baseAssertion.expectedHit || testCase.expected.includes(baseAssertion.selectedTool)) &&
      baseAssertion.exposurePlan &&
      baseAssertion.selectedToolExposed &&
      baseAssertion.scopedSessionUpdated &&
      !baseAssertion.fallbackExecuteCommand &&
      baseAssertion.expectedTitleVisible;
    assertion = {
      ...baseAssertion,
      passed: recoveryPathPassed,
      failure: recoveryPathPassed ? "" : baseAssertion.failure || "music_recovery_path_failed",
      playbackVerified: true
    };
  }
  await context.close();
  return {
    ...testCase,
    ...assertion,
    autoplayRecoveryVerified: autoplayRecovery?.verified ?? false,
    consoleErrors,
    evidenceDir: path.relative(repoRoot, caseDir)
  };
}

function installDiagnosticCaptureScript() {
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
}

function readPcmWavDurationMs(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return 0;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    if (chunkId === "fmt " && chunkSize >= 12) byteRate = bytes.readUInt32LE(offset + 16);
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return byteRate > 0 && dataSize > 0 ? Math.ceil((dataSize / byteRate) * 1_000) : 0;
}

function normalizedText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[繼續著剛暫後紅傷這個換聽來幫給請別倫陳傑強鄧劉實孫見電視頻號樂陰最後亞聞]/g, (character) => ({
      繼: "继", 續: "续", 著: "着", 剛: "刚", 暫: "暂", 後: "后", 紅: "红", 傷: "伤",
      這: "这", 個: "个", 換: "换", 聽: "听", 來: "来", 幫: "帮", 給: "给", 請: "请", 別: "别", 倫: "伦", 陳: "陈",
      傑: "杰", 強: "强", 鄧: "邓", 劉: "刘", 實: "实", 孫: "孙", 見: "见", 電: "电", 視: "视", 頻: "频", 號: "号", 樂: "乐", 陰: "阴", 最: "最", 亞: "亚", 聞: "闻"
    })[character] || character)
    .replace(/一手/g, "一首")
    .replace(/[\s，。、“”‘’！？,.!?]/g, "")
    .toLowerCase();
}

function transcriptPreservesIntent(testCase, transcript) {
  const expectedParts = Array.isArray(testCase.transcriptIncludes) ? testCase.transcriptIncludes : [];
  const expectedAlternatives = Array.isArray(testCase.transcriptIncludesAny) ? testCase.transcriptIncludesAny : [];
  const normalizedTranscript = normalizedText(transcript);
  return (
    expectedParts.every((part) => normalizedTranscript.includes(normalizedText(part))) &&
    expectedAlternatives.every(
      (alternatives) =>
        Array.isArray(alternatives) && alternatives.some((part) => normalizedTranscript.includes(normalizedText(part)))
    )
  );
}

function caseEffectCompletionIndex(events, testCase) {
  if (testCase.effect?.kind === "tv" || testCase.requireTvPlaybackVerified) {
    return events.findIndex(
      (event) =>
        event.type === "tv.play.result" &&
        event.status === "success" &&
        (!testCase.effect?.channel || eventData(event).channelName === testCase.effect.channel) &&
        eventData(event).playbackVerified === true &&
        Number(eventData(event).advancedBy) >= minimumPlaybackAdvance(testCase) &&
        Number(eventData(event).videoWidth) > 0 &&
        Number(eventData(event).videoHeight) > 0
    );
  }
  const effectState = testCase.effect?.state ?? (testCase.requirePlaybackVerified ? "playing" : "");
  if (effectState === "paused") {
    return events.findIndex((event) => event.type === "music.tool.pause.result" && event.status === "success");
  }
  if (effectState === "playing") {
    return events.findIndex(
      (event) =>
        event.type === "music.play.result" &&
        event.status === "success" &&
        (!testCase.effect?.title || eventData(event).title === testCase.effect.title) &&
        eventData(event).playbackVerified === true &&
        Number(eventData(event).advancedBy) >= minimumPlaybackAdvance(testCase)
    );
  }
  return events.findIndex((event) => event.type === "assistant.operation" && event.status === "success");
}

function assertContinuousCase(testCase, before, after, events, transcriptEvent) {
  const base = assertCase(testCase, before, {
    ...after,
    auditLogs: [],
    diagnostics: { ...after.diagnostics, events }
  });
  const commandTraceId = transcriptEvent?.commandTraceId;
  const speechStarted = events.some(
    (event) => event.type === "realtime.voice.speech_started" && (!commandTraceId || event.commandTraceId === commandTraceId)
  );
  const speechStopped = events.some(
    (event) => event.type === "realtime.voice.speech_stopped" && (!commandTraceId || event.commandTraceId === commandTraceId)
  );
  const expectedTitle = testCase.effect?.title ?? testCase.title ?? "";
  const effectState = testCase.effect?.state ?? (testCase.requirePlaybackVerified ? "playing" : "");
  const playbackEvent = events.find(
    (event) =>
      event.type === "music.play.result" &&
      event.status === "success" &&
      (!expectedTitle || eventData(event).title === expectedTitle) &&
      eventData(event).playbackVerified === true &&
      Number(eventData(event).advancedBy) >= minimumPlaybackAdvance(testCase)
  );
  const playbackVerified = Boolean(playbackEvent);
  const pauseVerified = events.some((event) => event.type === "music.tool.pause.result" && event.status === "success");
  const expectedTitleVisible = !expectedTitle || after.bodyText.includes(expectedTitle);
  const playbackProgressVisible = Array.isArray(after.musicProgress) && after.musicProgress.some((value) => value > 0);
  const playerStateVerified =
    effectState === "paused"
      ? pauseVerified && after.musicState?.control === "播放" && after.musicState?.paused === true
      : effectState === "playing"
        ? playbackVerified &&
          after.musicState?.control === "暂停" &&
          after.musicState?.paused === false &&
          Number(after.musicState?.currentTime) > 0 &&
          Number(after.musicState?.readyState) >= 2 &&
          playbackProgressVisible
        : true;
  const titleChangedVerified = !testCase.effect?.titleChanged || before.musicState?.title !== after.musicState?.title;
  const transcriptOk = transcriptPreservesIntent(testCase, eventData(transcriptEvent).transcript ?? "");
  const forbiddenTools = Array.isArray(testCase.forbidden) ? testCase.forbidden : [];
  const executed = executedToolNames({ auditLogs: [] }, events);
  const forbiddenToolUsed = forbiddenTools.find((toolName) => executed.includes(toolName)) ?? "";
  const isMusicCase = testCase.effect?.kind === "music";
  const isTvCase = testCase.effect?.kind === "tv" || testCase.requireTvPlaybackVerified;
  const expectedTvChannel = isTvCase ? testCase.effect?.channel ?? testCase.channelName ?? "" : "";
  const tvPlaybackEvent = isTvCase
    ? events.find(
        (event) =>
          event.type === "tv.play.result" &&
          event.status === "success" &&
          (!expectedTvChannel || eventData(event).channelName === expectedTvChannel) &&
          eventData(event).playbackVerified === true &&
          Number(eventData(event).advancedBy) >= minimumPlaybackAdvance(testCase) &&
          Number(eventData(event).videoWidth) > 0 &&
          Number(eventData(event).videoHeight) > 0
      )
    : undefined;
  const tvPlaybackVerified = Boolean(tvPlaybackEvent);
  const tvChannelVisible =
    !expectedTvChannel ||
    normalizedText(after.tvState?.channel).includes(normalizedText(expectedTvChannel)) ||
    normalizedText(after.bodyText).includes(normalizedText(expectedTvChannel));
  const tvPlayerStateVerified =
    !isTvCase ||
    (tvPlaybackVerified &&
      Boolean(after.tvState) &&
      after.tvState.paused === false &&
      Number(after.tvState.currentTime) > 0 &&
      Number(after.tvState.videoWidth) > 0 &&
      Number(after.tvState.videoHeight) > 0);
  const tvChannelChangedVerified =
    !testCase.effect?.channelChanged || normalizedText(before.tvState?.channel) !== normalizedText(after.tvState?.channel);
  let failure = "";
  if (!transcriptEvent) failure = "transcript_empty";
  else if (!speechStarted) failure = "vad_not_triggered";
  else if (!speechStopped) failure = "vad_not_committed";
  else if (!transcriptOk) failure = "transcript_missing_or_wrong";
  else if (base.failure) failure = base.failure;
  else if (forbiddenToolUsed) failure = "tool_selection_wrong";
  else if (isTvCase && !tvPlaybackVerified) failure = "tv_playback_not_verified";
  else if (isTvCase && !tvChannelVisible) failure = "tv_channel_not_visible";
  else if (isTvCase && !tvPlayerStateVerified) failure = "tv_player_state_wrong";
  else if (isTvCase && !tvChannelChangedVerified) failure = "tv_channel_not_changed";
  else if (!isTvCase && effectState === "playing" && !playbackVerified) failure = "music_playback_not_verified";
  else if (!isTvCase && effectState === "paused" && !pauseVerified) failure = "music_pause_not_verified";
  else if (!isTvCase && !expectedTitleVisible) failure = "music_title_not_visible";
  else if (!isTvCase && !playerStateVerified) failure = "music_player_state_wrong";
  else if (!isTvCase && !titleChangedVerified) failure = "music_title_not_changed";
  return {
    ...base,
    passed: !failure,
    failure,
    transcript: transcriptEvent ? eventData(transcriptEvent).transcript ?? "" : "",
    speechStarted: speechStarted ? 1 : 0,
    speechStopped: speechStopped ? 1 : 0,
    operationSuccess: base.operationSuccess && (isTvCase ? tvPlayerStateVerified : playerStateVerified),
    effectVerified: isTvCase ? tvPlayerStateVerified : isMusicCase ? playerStateVerified : base.effectVerified,
    expectedHit: base.expectedHit,
    tools: base.tools,
    playbackVerified,
    pauseVerified,
    playerStateVerified,
    titleChangedVerified,
    transcriptOk,
    forbiddenToolUsed,
    expectedTitleVisible,
    playbackProgressVisible,
    playbackAdvancedBy: playbackEvent ? [Number(eventData(playbackEvent).advancedBy)] : [],
    tvPlaybackVerified,
    tvPlaybackAdvancedBy: tvPlaybackEvent ? [Number(eventData(tvPlaybackEvent).advancedBy)] : [],
    tvChannelVisible,
    tvPlayerStateVerified,
    tvChannelChangedVerified
  };
}

async function runContinuousSession(playwright, options, runDir, userDataDir, testCases) {
  if (!options.sessionAudio || !fs.existsSync(options.sessionAudio)) {
    throw new Error(`Missing continuous session audio fixture: ${options.sessionAudio || "(not provided)"}`);
  }
  if (!fs.existsSync(options.playbackAudio)) {
    throw new Error(`Missing playback audio fixture: ${options.playbackAudio}`);
  }

  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: !options.headed,
    viewport: options.simulateMusicKitMobile ? { width: 390, height: 844 } : { width: 1280, height: 820 },
    isMobile: options.simulateMusicKitMobile,
    hasTouch: options.simulateMusicKitMobile,
    permissions: ["microphone"],
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${options.sessionAudio}%noloop`,
      ...(options.respectAutoplayPolicy ? [] : ["--autoplay-policy=no-user-gesture-required"])
    ]
  });
  if (options.simulateAutoplayBlockOnce) {
    await context.addInitScript(installAutoplayBlockSimulationScript);
  }
  if (options.simulateMusicKitMobile) {
    await context.addInitScript(installMusicKitMobileSimulationScript);
  }
  await context.addInitScript(installDiagnosticCaptureScript);
  const page = context.pages()[0] ?? (await context.newPage());
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleErrors.push(`${message.text()}${location?.url ? ` @ ${location.url}` : ""}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installExternalMocks(page, testCases, options.playbackAudio);
  await page.goto(options.site, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await waitForAppReady(page);
  await clearAllAppState(page);
  await seedTvAssistantChannelCatalog(page, testCases);
  await page.goto(options.site, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await waitForAppReady(page);
  await ensureMusicWidgetMounted(page);
  await clearCaseEvidence(page);
  await waitForAppReady(page);
  consoleErrors.length = 0;
  pageErrors.length = 0;

  const initialSnapshot = await snapshot(page);
  const lifecycleEventOffset = initialSnapshot.diagnostics?.events?.length ?? 0;
  await page.screenshot({ path: path.join(runDir, "session-before.png"), fullPage: false });

  await page.getByRole("button", { name: "连接语音", exact: true }).click({ force: true });
  await page.waitForFunction(
    () => {
      const events = window.__xiaozhuobanLiveVoiceDiagnosticEvents || [];
      return events.some((event) => event.type === "realtime.session.created_ready" && event.status === "connected");
    },
    null,
    { timeout: 30_000 }
  );

  const sessionDurationMs = readPcmWavDurationMs(options.sessionAudio);
  const deadline = Date.now() + (sessionDurationMs > 0 ? Math.min(options.waitMs, sessionDurationMs + 20_000) : options.waitMs);
  const boundaryCaptures = new Map();
  const caseCaptures = new Map();
  while (Date.now() < deadline && caseCaptures.size < testCases.length) {
    const liveEvents = await page.evaluate(() => window.__xiaozhuobanLiveVoiceDiagnosticEvents || []);
    const uniqueSpeechStarts = [];
    const seenSpeechStarts = new Set();
    for (const event of liveEvents) {
      if (event.type !== "realtime.voice.speech_started") continue;
      const key = event.commandTraceId || event.data?.itemId || `speech_${uniqueSpeechStarts.length}`;
      if (seenSpeechStarts.has(key)) continue;
      seenSpeechStarts.add(key);
      uniqueSpeechStarts.push(event);
    }
    for (let index = 0; index < Math.min(testCases.length, uniqueSpeechStarts.length); index += 1) {
      const testCase = testCases[index];
      const caseDir = path.join(runDir, testCase.id);
      fs.mkdirSync(caseDir, { recursive: true });
      if (!boundaryCaptures.has(testCase.id)) {
        const boundaryCapture = await snapshot(page);
        await page.screenshot({ path: path.join(caseDir, "before.png"), fullPage: false }).catch(() => undefined);
        boundaryCaptures.set(testCase.id, boundaryCapture);
        if (index > 0) {
          const previousCase = testCases[index - 1];
          if (!caseCaptures.has(previousCase.id)) {
            caseCaptures.set(previousCase.id, boundaryCapture);
            await page.screenshot({ path: path.join(runDir, previousCase.id, "after.png"), fullPage: false }).catch(() => undefined);
          }
        }
      }
      if (caseCaptures.has(testCase.id)) continue;
      const startIndex = liveEvents.indexOf(uniqueSpeechStarts[index]);
      const nextSpeechStart = uniqueSpeechStarts[index + 1];
      const nextStartIndex = nextSpeechStart ? liveEvents.indexOf(nextSpeechStart) : liveEvents.length;
      const caseEvents = liveEvents.slice(startIndex, nextStartIndex);
      const completionIndex = caseEffectCompletionIndex(caseEvents, testCase);
      const boundaryClosed = Boolean(nextSpeechStart);
      if (completionIndex < 0 && !boundaryClosed) continue;
      await page.waitForTimeout(250);
      const capture = await snapshot(page);
      await page.screenshot({ path: path.join(caseDir, "after.png"), fullPage: false }).catch(() => undefined);
      caseCaptures.set(testCase.id, capture);
    }
    if (caseCaptures.size < testCases.length) await page.waitForTimeout(250);
  }

  const beforeDisconnect = await snapshot(page);
  fs.writeFileSync(path.join(runDir, "session-trace.json"), JSON.stringify(beforeDisconnect, null, 2));
  const allEvents = beforeDisconnect.diagnostics?.events ?? [];
  const uniqueSpeechStartEvents = [];
  const seenSpeechStartItems = new Set();
  for (const event of allEvents) {
    if (event.type !== "realtime.voice.speech_started") continue;
    const key = event.commandTraceId || eventData(event).itemId || `speech_${uniqueSpeechStartEvents.length}`;
    if (seenSpeechStartItems.has(key)) continue;
    seenSpeechStartItems.add(key);
    uniqueSpeechStartEvents.push(event);
  }

  const results = [];
  for (const [index, testCase] of testCases.entries()) {
    const caseDir = path.join(runDir, testCase.id);
    fs.mkdirSync(caseDir, { recursive: true });
    const speechStartEvent = uniqueSpeechStartEvents[index];
    const nextSpeechStartEvent = uniqueSpeechStartEvents[index + 1];
    const startIndex = speechStartEvent ? allEvents.indexOf(speechStartEvent) : allEvents.length;
    const endIndex = nextSpeechStartEvent ? allEvents.indexOf(nextSpeechStartEvent) : allEvents.length;
    const caseEvents = speechStartEvent ? allEvents.slice(startIndex, endIndex) : [];
    const transcriptEvent = caseEvents.find(
      (event) =>
        event.type === "realtime.voice.user_transcript" &&
        event.status === "success" &&
        (!speechStartEvent.commandTraceId || event.commandTraceId === speechStartEvent.commandTraceId)
    ) ?? caseEvents.find((event) => event.type === "realtime.voice.user_transcript" && event.status === "success");
    const caseBefore = boundaryCaptures.get(testCase.id) ?? (index === 0 ? initialSnapshot : caseCaptures.get(testCases[index - 1].id) ?? initialSnapshot);
    const caseAfter = caseCaptures.get(testCase.id) ?? beforeDisconnect;
    if (!boundaryCaptures.has(testCase.id)) {
      await page.screenshot({ path: path.join(caseDir, "before.png"), fullPage: false }).catch(() => undefined);
    }
    if (!caseCaptures.has(testCase.id)) {
      await page.screenshot({ path: path.join(caseDir, "after.png"), fullPage: false }).catch(() => undefined);
    }
    let assertion = assertContinuousCase(testCase, caseBefore, caseAfter, caseEvents, transcriptEvent);
    if (!assertion.failure && (consoleErrors.length > 0 || pageErrors.length > 0)) {
      assertion = { ...assertion, passed: false, failure: "unexpected_browser_error" };
    }
    const traceAfter = { ...caseAfter, diagnostics: { ...caseAfter.diagnostics, events: caseEvents } };
    fs.writeFileSync(
      path.join(caseDir, "trace.json"),
      JSON.stringify({ id: testCase.id, command: testCase.command, before: caseBefore, after: traceAfter, consoleErrors, pageErrors }, null, 2)
    );
    results.push({ ...testCase, ...assertion, consoleErrors, pageErrors, evidenceDir: path.relative(repoRoot, caseDir) });
  }

  const beforeDisconnectEvents = allEvents.slice(lifecycleEventOffset);
  const sessionCreatedCount = beforeDisconnectEvents.filter(
    (event) => event.type === "realtime.session.created_ready" && event.status === "connected"
  ).length;
  const disconnectCountBeforeFinal = beforeDisconnectEvents.filter(
    (event) =>
      (event.type === "realtime.runtime.disconnect" && event.data?.connected === true) ||
      (event.type === "voice.status" && event.status === "disconnected")
  ).length;
  const realtimeBatchIds = [
    ...new Set(
      beforeDisconnectEvents
        .map((event) => event.realtimeBatchId)
        .filter((value) => typeof value === "string" && value.trim())
    )
  ];
  const userTranscriptCount = new Set(
    beforeDisconnectEvents
      .filter((event) => event.type === "realtime.voice.user_transcript" && event.status === "success")
      .map((event) => eventData(event).itemId || event.commandTraceId)
      .filter(Boolean)
  ).size;

  await page.getByRole("button", { name: "断开 Realtime", exact: true }).click({ force: true });
  await page
    .waitForFunction(
      () => {
        const events = window.__xiaozhuobanLiveVoiceDiagnosticEvents || [];
        return events.some((event) => event.type === "voice.status" && event.status === "disconnected");
      },
      null,
      { timeout: 10_000 }
    )
    .catch(() => undefined);
  const afterDisconnect = await snapshot(page);
  await page.screenshot({ path: path.join(runDir, "session-after-disconnect.png"), fullPage: false }).catch(() => undefined);
  const afterDisconnectEvents = (afterDisconnect.diagnostics?.events ?? []).slice(lifecycleEventOffset);
  const manualDisconnectCount = afterDisconnectEvents.filter(
    (event) => event.type === "realtime.runtime.disconnect" && event.status === "manual" && event.data?.connected === true
  ).length;
  const disconnectedStatusCount = afterDisconnectEvents.filter(
    (event) => event.type === "voice.status" && event.status === "disconnected"
  ).length;
  const sessionSummary = {
    sessionCreatedCount,
    disconnectCountBeforeFinal,
    manualDisconnectCount,
    disconnectedStatusCount,
    userTranscriptCount,
    realtimeBatchIds,
    singleConnectionPassed:
      sessionCreatedCount === 1 &&
      disconnectCountBeforeFinal === 0 &&
      manualDisconnectCount === 1 &&
      disconnectedStatusCount === 1 &&
      userTranscriptCount === testCases.length &&
      realtimeBatchIds.length === 1
  };

  await context.close();
  return { results, sessionSummary };
}

function writeReport(runId, results, options, sessionSummary = null) {
  const passed = results.filter((item) => item.passed).length;
  const functionCallCount = results.filter((item) => item.functionCallCount > 0).length;
  const exposurePlanCount = results.filter((item) => item.exposurePlan).length;
  const selectedToolExposedCount = results.filter((item) => item.selectedToolExposed).length;
  const scopedSessionUpdateCount = results.filter((item) => item.scopedSessionUpdated).length;
  const localShortcutCount = results.filter((item) => item.localShortcut).length;
  const fallbackExecuteCommandCount = results.filter((item) => item.fallbackExecuteCommand).length;
  const autoplayRecoveryCount = results.filter((item) => item.autoplayRecoveryVerified).length;
  const rows = results
    .map((item) => {
      const screenshots = `[before](${item.evidenceDir}/before.png) / [after](${item.evidenceDir}/after.png) / [trace](${item.evidenceDir}/trace.json)`;
      const path = [
        item.exposurePlan ? "exposure" : "no_exposure",
        item.selectedToolExposed ? "selected_exposed" : "selected_unchecked",
        item.scopedSessionUpdated ? "scoped_updated" : item.localShortcut ? "local_shortcut" : "no_scoped_update"
      ].join(" / ");
      const actualPlayback = item.tvPlaybackVerified
        ? `TV yes (${item.tvPlaybackAdvancedBy.map((value) => value.toFixed(3)).join(", ")}s)`
        : item.playbackVerified
          ? `music yes (${item.playbackAdvancedBy.map((value) => value.toFixed(3)).join(", ")}s)`
          : "no";
      const authoritativeEffect = `${item.effectVerified ? "verified" : "failed"}: ${JSON.stringify(item.effect ?? {})}`.replace(/\|/g, "/");
      return `| ${item.id} | ${item.passed ? "pass" : "fail"} | ${item.command} | ${String(item.transcript).replace(/\|/g, "/")} | ${item.detailed.exposedModules.join(", ") || "-"} | ${item.detailed.exposedTools.join(", ") || "-"} | ${item.selectedTool || "-"} | ${item.detailed.functionToolNames.join(", ") || "-"} | ${item.detailed.queryValues.join(", ") || "-"} | ${item.detailed.channelValues.join(", ") || "-"} | ${item.detailed.widgetIds.join(", ") || "-"} | ${item.detailed.musicPlayback.join("<br>") || "-"} | ${actualPlayback} | ${item.playbackProgressVisible ? "yes" : "no"} | ${item.detailed.tvPlayback.join("<br>") || "-"} | ${authoritativeEffect} | ${path} | ${item.failure || "-"} | ${screenshots} |`;
    })
    .join("\n");
  const relativeAudioRoot = path.relative(repoRoot, options.audioRoot) || ".";
  const relativeOutputRoot = path.relative(repoRoot, options.outputRoot) || ".";
  const body = `# Realtime Live Voice Smoke Report

- Run: ${runId}
- Model: gpt-realtime-2
- Transport: Chrome fake microphone -> WebRTC Realtime session -> data channel
- Autoplay policy: ${options.respectAutoplayPolicy ? "browser default policy enforced" : "disabled for deterministic media verification"}
- Simulated media autoplay-block recovery: ${options.simulateAutoplayBlockOnce ? `${autoplayRecoveryCount}/${results.length}` : "not requested"}
- Simulated mobile MusicKit recovery: ${options.simulateMusicKitMobile ? `${autoplayRecoveryCount}/${results.length}` : "not requested"}
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
- Playback audio fixture: ${path.relative(repoRoot, options.playbackAudio)}
- Widget success rule: the read-only application-store export must match the declared widget type and state, and the matching widget DOM must expose the expected visible value.
- Music success rule: music.play.result=success, playbackVerified=true, HTMLMediaElement currentTime advanced, paused=false, readyState>=2, title visible, and progress bar above zero.
- TV success rule: tv.play.result=success, playbackVerified=true, channel matches, video is not paused, media clock advanced, and decoded video dimensions are above zero.
- Realtime lifecycle: ${
    sessionSummary
      ? `${sessionSummary.singleConnectionPassed ? "pass" : "fail"}; session.created=${sessionSummary.sessionCreatedCount}; transcripts=${sessionSummary.userTranscriptCount}; disconnects before final=${sessionSummary.disconnectCountBeforeFinal}; manual disconnects=${sessionSummary.manualDisconnectCount}; disconnected statuses=${sessionSummary.disconnectedStatusCount}; batch ids=${sessionSummary.realtimeBatchIds.join(", ") || "-"}`
      : "one Chrome/Realtime session per case"
  }
- Evidence root: ${relativeOutputRoot}/${runId}
- Secret handling: Realtime credentials are never written to this report.

| id | result | spoken command | transcript | exposed modules | exposed tools | selected tool | function tools | query args | channel args | widgetIds | music playback/token | actual playback | progress visible | tv playback | authoritative effect | realtime path | failure | evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows}
`;
  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.writeFileSync(options.reportPath, body);
}

async function main() {
  const options = parseArgs(process.argv);
  const testCases = loadCases(options.casesFile);
  const playwright = requirePlaywright();
  const devServer = await startDevServerIfNeeded(options.site, options.startDev, options);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(options.outputRoot, runId);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `xiaozhuoban-live-voice-${runId}-`));
  fs.mkdirSync(runDir, { recursive: true });
  const results = [];
  let sessionSummary = null;
  try {
    if (options.sessionAudio) {
      const sessionRun = await runContinuousSession(playwright, options, runDir, userDataDir, testCases);
      results.push(...sessionRun.results);
      sessionSummary = sessionRun.sessionSummary;
      for (const result of results) {
        console.log(`${result.passed ? "pass" : "fail"} ${result.id} ${result.command}${result.failure ? ` (${result.failure})` : ""}`);
      }
      console.log(`continuous realtime lifecycle ${sessionSummary.singleConnectionPassed ? "pass" : "fail"}`);
    } else {
      for (const [index, testCase] of testCases.entries()) {
        const result = await runCase(playwright, options, runDir, userDataDir, testCase, index === 0);
        results.push(result);
        console.log(`${result.passed ? "pass" : "fail"} ${result.id} ${result.command}${result.failure ? ` (${result.failure})` : ""}`);
      }
    }
  } finally {
    devServer?.kill("SIGTERM");
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // Temporary Chrome profile cleanup is best-effort.
    }
  }
  writeReport(runId, results, options, sessionSummary);
  const passed = results.filter((item) => item.passed).length;
  console.log(JSON.stringify({ runId, total: results.length, passed, failed: results.length - passed, reportPath: options.reportPath }, null, 2));
  if (passed !== results.length || (sessionSummary && !sessionSummary.singleConnectionPassed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
