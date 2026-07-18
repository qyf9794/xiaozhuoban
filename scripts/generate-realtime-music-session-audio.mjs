#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
function parseArgs(argv) {
  const options = {
    casesPath: path.join(repoRoot, "tests/realtime-live-music-session-cases.json"),
    outputDir: path.join(repoRoot, "tests/audio/realtime-live-music-session"),
    gapMs: 12_000
  };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--cases") options.casesPath = path.resolve(argv[++index]);
    else if (item.startsWith("--cases=")) options.casesPath = path.resolve(item.slice("--cases=".length));
    else if (item === "--output") options.outputDir = path.resolve(argv[++index]);
    else if (item.startsWith("--output=")) options.outputDir = path.resolve(item.slice("--output=".length));
    else if (item === "--gap-ms") options.gapMs = Number(argv[++index]);
    else if (item.startsWith("--gap-ms=")) options.gapMs = Number(item.slice("--gap-ms=".length));
  }
  if (!Number.isFinite(options.gapMs) || options.gapMs < 3_000) {
    throw new Error("--gap-ms must be at least 3000");
  }
  return options;
}

const options = parseArgs(process.argv);
const casesPath = options.casesPath;
const outputDir = options.outputDir;
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function probeDuration(filePath) {
  return Number(
    run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath])
  );
}

fs.mkdirSync(outputDir, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xiaozhuoban-music-voice-"));

try {
  const voiceFiles = [];
  for (const testCase of cases) {
    const aiffPath = path.join(tempDir, `${testCase.id}.aiff`);
    const rawWavPath = path.join(tempDir, `${testCase.id}-raw.wav`);
    const wavPath = path.join(outputDir, `${testCase.id}.wav`);
    run("say", ["-v", "Tingting", "-r", "175", "-o", aiffPath, testCase.command]);
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", aiffPath, "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", rawWavPath]);
    run("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      rawWavPath,
      "-af",
      "adelay=2000:all=1,apad=pad_dur=3",
      "-ar",
      "24000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      wavPath
    ]);
    voiceFiles.push({ path: rawWavPath, durationSeconds: probeDuration(rawWavPath) });
  }

  const inputs = [];
  const filters = [];
  let offsetMs = 2_000;
  voiceFiles.forEach((voice, index) => {
    inputs.push("-i", voice.path);
    filters.push(`[${index}:a]adelay=${Math.round(offsetMs)}:all=1[v${index}]`);
    offsetMs += Math.ceil(voice.durationSeconds * 1_000) + options.gapMs;
  });
  filters.push(`${voiceFiles.map((_, index) => `[v${index}]`).join("")}amix=inputs=${voiceFiles.length}:duration=longest:normalize=0,apad=pad_dur=30[voice]`);
  run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[voice]",
    "-ar",
    "24000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    path.join(outputDir, "music-session-10-commands.wav")
  ]);

  const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46, 523.25, 659.25, 783.99, 1046.5];
  const melodyInputs = [];
  notes.forEach((frequency) => {
    melodyInputs.push("-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=44100:duration=0.5`);
  });
  run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...melodyInputs,
    "-filter_complex",
    `${notes.map((_, index) => `[${index}:a]`).join("")}concat=n=${notes.length}:v=0:a=1,aloop=loop=-1:size=264600,atrim=duration=210,afade=t=in:st=0:d=0.03,afade=t=out:st=209.7:d=0.25[melody]`,
    "-map",
    "[melody]",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    path.join(outputDir, "playback-melody.wav")
  ]);

  run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=duration=30:size=320x180:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=659.25:sample_rate=44100:duration=30",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    "-shortest",
    path.join(outputDir, "playback-tv.mp4")
  ]);

  const manifest = {
    generatedAt: new Date().toISOString(),
    voice: "macOS Tingting",
    commandGapMs: options.gapMs,
    reconnectFixtureLeadingSilenceMs: 2_000,
    reconnectFixtureTrailingSilenceMs: 3_000,
    commands: cases.map(({ id, command, artist, title }) => ({ id, command, artist, title })),
    sessionAudio: "music-session-10-commands.wav",
    playbackAudio: "playback-melody.wav",
    tvPlaybackVideo: "playback-tv.mp4"
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outputDir, sessionDurationSeconds: probeDuration(path.join(outputDir, "music-session-10-commands.wav")), commands: cases.length }, null, 2));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
