import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../");
const reportPath = path.join(repoRoot, "docs/realtime-voice-scenario-catalog-simulation-report.md");

describe("700 voice scenario catalog simulation", () => {
  it("classifies every catalog command without unknown intents or high-risk misroutes", () => {
    const output = execFileSync("node", ["scripts/simulate-voice-scenario-catalog.mjs"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    const summary = JSON.parse(output);

    expect(summary.commands).toBe(700);
    expect(summary.classified).toBe(700);
    expect(summary.needsReview).toBe(0);
    expect(summary.unknown).toBe(0);
    expect(summary.hazards).toBe(0);

    const report = fs.readFileSync(reportPath, "utf8");
    expect([...report.matchAll(/^\d{3}\. \[pass\]/gm)]).toHaveLength(700);
  });
});
