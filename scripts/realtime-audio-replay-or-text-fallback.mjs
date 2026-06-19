import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_AUDIO_FIXTURE_DIR = resolve(ROOT, "tests/audio/realtime");
const HOLDOUT_PATH = resolve(ROOT, "docs/realtime-voice-scenario-holdout.md");
const REPORT_PATH = resolve(ROOT, "docs/realtime-audio-replay-fallback-report.md");
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".ogg", ".webm"]);

function readHoldoutCommands() {
  if (!existsSync(HOLDOUT_PATH)) return [];
  return readFileSync(HOLDOUT_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^(\d{3})\.\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ id: match[1], command: match[2] }));
}

function listAudioFixtures(audioDir) {
  if (!existsSync(audioDir)) return [];
  return readdirSync(audioDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => resolve(audioDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function writeReport({ mode, audioDir, audioFixtures, holdoutCommands }) {
  const lines = [
    "# Realtime Audio Replay Fallback Report",
    "",
    `- mode: ${mode}`,
    `- audioFixtureDir: ${audioDir}`,
    `- audioFixtures: ${audioFixtures.length}`,
    `- holdoutCommands: ${holdoutCommands.length}`,
    `- generatedAt: ${new Date().toISOString()}`,
    "",
    "## Result",
    "",
    audioFixtures.length
      ? "Audio fixtures were detected, but this repository does not yet include an offline Realtime audio decoder/VAD assertion path. The files are listed below so a future runner can bind them to transcript and execution checks."
      : "No audio fixtures were available. The unattended validation path used the holdout text catalog as the fallback input source.",
    "",
    "## Audio Fixtures",
    "",
    ...(audioFixtures.length ? audioFixtures.map((fixture) => `- ${fixture}`) : ["- none"]),
    "",
    "## Text Fallback Commands",
    "",
    ...holdoutCommands.map((item) => `- ${item.id}: ${item.command}`)
  ];
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
}

const audioDir = resolve(process.env.XIAOZHUOBAN_AUDIO_FIXTURE_DIR || DEFAULT_AUDIO_FIXTURE_DIR);
const audioFixtures = listAudioFixtures(audioDir);
const holdoutCommands = readHoldoutCommands();
const mode = audioFixtures.length ? "audio-fixtures-detected-no-offline-decoder" : "text-only-fallback";

writeReport({ mode, audioDir, audioFixtures, holdoutCommands });

console.log(
  JSON.stringify(
    {
      mode,
      audioFixtureDir: audioDir,
      audioFixtures: audioFixtures.length,
      holdoutCommands: holdoutCommands.length,
      reportPath: REPORT_PATH
    },
    null,
    2
  )
);
