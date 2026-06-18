import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../");
const reportPath = path.join(repoRoot, "docs/realtime-voice-scenario-catalog-simulation-report.md");
const executionGroupsPath = path.join(repoRoot, "docs/realtime-voice-scenario-execution-groups.md");

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
    expect(summary.lanes["shortcut-local"]).toBeGreaterThan(0);
    expect(summary.lanes["realtime-2-required"]).toBeGreaterThan(0);

    const report = fs.readFileSync(reportPath, "utf8");
    expect([...report.matchAll(/^\d{3}\. \[pass\]/gm)]).toHaveLength(700);
    expect(report).toContain("060. [pass] route=realtime-2-required");
    expect(report).toContain("061. [pass] route=realtime-2-required");
    expect(report).toContain("062. [pass] route=realtime-2-required");
    expect(report).toContain("070. [pass] route=shortcut-local");
    expect(report).toContain("095. [pass] route=shortcut-local");

    const executionGroups = fs.readFileSync(executionGroupsPath, "utf8");
    expect(executionGroups).toContain("## Shortcut-Local Commands");
    expect(executionGroups).toContain("## Realtime-2-Required Commands");
    expect(executionGroups).toContain("060. tools=music.play; reason=semantic music requests must be parsed by Realtime-2");
  });
});
