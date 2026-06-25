import { SiriRenderer } from "./renderer.js?v=20260625-edge-highlight";
import { createSiriState } from "./state.js?v=20260625-edge-highlight";

const canvas = document.querySelector("#siri27-canvas");
const status = document.querySelector("#mic-status");
const renderer = new SiriRenderer(canvas, { wavePreset: "bloom", embedded: true });
const siri = createSiriState();

let rafId = 0;
let prevTimestamp = 0;
let mode = "idle";
let colorMode = "mono";
let audioLevel = 0;
let audioPeak = 0;

function clampAudioLevel(value) {
  const level = Number(value);
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(1, level));
}

function setNeutralBackdrop() {
  const tile = document.createElement("canvas");
  tile.width = 2;
  tile.height = 2;
  const ctx = tile.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, 2, 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fillRect(0, 0, 2, 2);
  renderer.setBackgroundImage(tile);
}

function select(nextMode) {
  mode = nextMode;
  if (mode === "thinking") {
    siri.select("thinking");
  } else if (mode === "listening") {
    siri.select("listening");
  } else {
    siri.select("idle");
  }
}

function selectColorMode(nextColorMode) {
  colorMode = nextColorMode === "color" ? "color" : "mono";
  renderer.setColorMode(colorMode);
}

function syntheticBands(now, voiceDrive = 0) {
  if (mode === "thinking") {
    return {
      low: Math.min(1, 0.55 + 0.16 * Math.sin(now * 0.0028) + voiceDrive * 0.38),
      mid: Math.min(1, 0.46 + voiceDrive * 0.3),
      high: Math.min(1, 0.34 + voiceDrive * 0.2)
    };
  }
  if (mode === "listening") {
    return {
      low: Math.min(1, 0.28 + 0.12 * Math.sin(now * 0.0022) + voiceDrive * 0.68),
      mid: Math.min(1, 0.18 + 0.075 * Math.sin(now * 0.0032 + 1.4) + voiceDrive * 0.48),
      high: Math.min(1, 0.16 + 0.055 * Math.sin(now * 0.0042 + 2.2) + voiceDrive * 0.32)
    };
  }
  return {
    low: Math.min(1, 0.34 + 0.055 * Math.sin(now * 0.00055) + voiceDrive * 0.24),
    mid: Math.min(1, 0.24 + 0.035 * Math.sin(now * 0.0007 + 1.2) + voiceDrive * 0.17),
    high: Math.min(1, 0.16 + 0.025 * Math.sin(now * 0.00085 + 2.1) + voiceDrive * 0.12)
  };
}

function frame(now) {
  const dt = prevTimestamp ? Math.min((now - prevTimestamp) / 1000, 0.1) : 0;
  prevTimestamp = now;
  audioPeak = Math.max(audioLevel, audioPeak * Math.exp(-dt * 3.4));
  const bands = syntheticBands(now, audioPeak);
  siri.tick(dt, bands);
  renderer.render({ surface: siri.surface, progress: siri.progress, bands, sizes: siri.sizes, dt });
  rafId = requestAnimationFrame(frame);
}

canvas.addEventListener("siri-render-error", (event) => {
  if (status) {
    status.textContent = event.detail?.message || "WebGL renderer failed.";
  }
});

window.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "z1han-siri-orb-state") return;
  select(event.data.mode || "idle");
  selectColorMode(event.data.colorMode || "mono");
  audioLevel = clampAudioLevel(event.data.audioLevel);
  audioPeak = Math.max(audioPeak, audioLevel);
});

if (renderer.error) {
  if (status) status.textContent = renderer.error.message;
} else {
  setNeutralBackdrop();
  selectColorMode("mono");
  select("idle");
  const initialBands = syntheticBands(0, 0);
  siri.tick(0, initialBands);
  renderer.render({ surface: siri.surface, progress: siri.progress, bands: initialBands, sizes: siri.sizes, dt: 0 });
  rafId = requestAnimationFrame(frame);
}

window.addEventListener(
  "pagehide",
  () => {
    cancelAnimationFrame(rafId);
    renderer.dispose();
  },
  { once: true }
);
