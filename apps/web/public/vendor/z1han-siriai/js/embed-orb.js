import { SiriRenderer } from "./renderer.js";
import { createSiriState } from "./state.js";

const canvas = document.querySelector("#siri27-canvas");
const status = document.querySelector("#mic-status");
const renderer = new SiriRenderer(canvas, { wavePreset: "bloom", embedded: true });
const siri = createSiriState();

let rafId = 0;
let prevTimestamp = 0;
let mode = "idle";
let targetAudioLevel = 0;
let smoothedAudioLevel = 0;
let targetColorMix = 0;
let smoothedColorMix = 0;

function clampUnit(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function setNeutralBackdrop() {
  const tile = document.createElement("canvas");
  tile.width = 2;
  tile.height = 2;
  const ctx = tile.getContext("2d");
  if (!ctx) return;
  const gradient = ctx.createLinearGradient(0, 0, 0, 2);
  gradient.addColorStop(0, "#f6fbff");
  gradient.addColorStop(1, "#7b8c98");
  ctx.fillStyle = gradient;
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

function syntheticBands(now) {
  if (mode === "thinking") {
    return { low: 0.55 + 0.2 * Math.sin(now * 0.005), mid: 0.46, high: 0.34 };
  }
  if (mode === "listening") {
    const voice = smoothedAudioLevel;
    return {
      low: 0.16 + voice * 0.72 + 0.05 * Math.sin(now * 0.004),
      mid: 0.12 + voice * 0.54 + 0.04 * Math.sin(now * 0.006 + 1.4),
      high: 0.1 + voice * 0.38 + 0.03 * Math.sin(now * 0.008 + 2.2)
    };
  }
  const monoBreath = 0.12 + 0.035 * Math.sin(now * 0.0028);
  return {
    low: monoBreath,
    mid: monoBreath * 0.86,
    high: monoBreath * 0.72
  };
}

function frame(now) {
  const dt = prevTimestamp ? Math.min((now - prevTimestamp) / 1000, 0.1) : 0;
  prevTimestamp = now;
  smoothedAudioLevel += (targetAudioLevel - smoothedAudioLevel) * Math.min(1, dt * 12);
  smoothedColorMix += (targetColorMix - smoothedColorMix) * Math.min(1, dt * 8);
  siri.surface.colorMix = smoothedColorMix;
  const bands = syntheticBands(now);
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
  targetAudioLevel = clampUnit(event.data.audioLevel);
  targetColorMix = event.data.colorMode === "color" ? 1 : 0;
});

if (renderer.error) {
  if (status) status.textContent = renderer.error.message;
} else {
  setNeutralBackdrop();
  select("idle");
  siri.surface.colorMix = 0;
  const initialBands = syntheticBands(0);
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
