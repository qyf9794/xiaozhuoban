import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");
const holdoutPath = path.join(repoRoot, "docs/realtime-voice-scenario-holdout.md");

describe("Realtime voice holdout catalog", () => {
  it("keeps blind commands free of expected tool labels", () => {
    const text = fs.readFileSync(holdoutPath, "utf8");
    const commands = [...text.matchAll(/^(\d{3})\. (.+)$/gm)];

    expect(commands.length).toBeGreaterThanOrEqual(20);
    expect(new Set(commands.map((match) => match[1])).size).toBe(commands.length);
    expect(text).not.toMatch(/tools=|expected|must=|anyOf=|forbid=|route=/i);
  });
});
