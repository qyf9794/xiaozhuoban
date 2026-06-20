import { SiriRenderer } from "./renderer.js?v=20260620-orb-mono-rim-refraction";
import { createSiriState } from "./state.js?v=20260620-orb-mono-rim-refraction";

const canvas = document.querySelector("#siri27-canvas");
const status = document.querySelector("#mic-status");
const renderer = new SiriRenderer(canvas, { wavePreset: "bloom", embedded: true });
const siri = createSiriState();

let rafId = 0;
let prevTimestamp = 0;
let mode = "idle";
let colorMode = "mono";

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

function syntheticBands(now) {
  if (mode === "thinking") {
    return { low: 0.55 + 0.2 * Math.sin(now * 0.005), mid: 0.46, high: 0.34 };
  }
  if (mode === "listening") {
    return {
      low: 0.28 + 0.16 * Math.sin(now * 0.004),
      mid: 0.18 + 0.1 * Math.sin(now * 0.006 + 1.4),
      high: 0.16 + 0.08 * Math.sin(now * 0.008 + 2.2)
    };
  }
  return {
    low: 0.34 + 0.08 * Math.sin(now * 0.00085),
    mid: 0.24 + 0.05 * Math.sin(now * 0.0011 + 1.2),
    high: 0.16 + 0.035 * Math.sin(now * 0.00135 + 2.1)
  };
}

function frame(now) {
  const dt = prevTimestamp ? Math.min((now - prevTimestamp) / 1000, 0.1) : 0;
  prevTimestamp = now;
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
  selectColorMode(event.data.colorMode || "mono");
});

if (renderer.error) {
  if (status) status.textContent = renderer.error.message;
} else {
  setNeutralBackdrop();
  selectColorMode("mono");
  select("idle");
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
