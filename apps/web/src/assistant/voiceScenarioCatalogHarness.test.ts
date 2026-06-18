import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  ContextSummarizer,
  ToolScopeManager,
  WidgetTargetResolver,
  IntentShortcutRouter,
  createCommandPlanFromToolCalls,
  type AssistantAction,
  type AssistantToolCall,
  type AssistantToolResult,
  type CommandPlan,
  type ContextSummarizerInput
} from "@xiaozhuoban/assistant-core";
import { AssistantHarness, type AssistantRealtimeAdapter } from "./AssistantHarness";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");
const simulationReportPath = path.join(repoRoot, "docs/realtime-voice-scenario-catalog-simulation-report.md");
const harnessReportPath = path.join(repoRoot, "docs/realtime-voice-scenario-catalog-harness-report.md");
const NOW = "2026-06-18T11:40:00.000Z";

type CatalogCase = {
  id: number;
  text: string;
  tools: string[];
};

const widgetTypes = [
  "calculator",
  "clipboard",
  "converter",
  "countdown",
  "dialClock",
  "headline",
  "market",
  "messageBoard",
  "music",
  "note",
  "recorder",
  "todo",
  "translate",
  "tv",
  "weather",
  "worldClock"
];

function parseSimulationReport(): CatalogCase[] {
  const text = fs.readFileSync(simulationReportPath, "utf8");
  return [...text.matchAll(/^(\d{3})\. \[pass\] route=[^;]+; tools=([^;]+); command=(.+)$/gm)].map((match) => ({
    id: Number(match[1]),
    tools: match[2].split(",").map((item) => item.trim()).filter(Boolean),
    text: match[3]
  }));
}

function createLooseAction(name: string): AssistantAction<Record<string, unknown>> {
  return {
    spec: {
      name,
      description: `Catalog simulation action for ${name}`,
      parameters: { safeParse: (value) => ({ success: true, data: (value ?? {}) as Record<string, unknown> }) },
      risk: "safe",
      scope: name.startsWith("app.") || name.startsWith("board.") || name.startsWith("assistant.") ? "desktop" : "widget-detail",
      widgetType: widgetTypes.find((type) => name.toLowerCase().includes(type.toLowerCase()))
    },
    execute(args) {
      return {
        status: "success",
        message: `simulated ${name}`,
        data: { args }
      };
    }
  };
}

function createPlan(text: string, tools: string[]): CommandPlan {
  const calls: AssistantToolCall[] = tools.map((name, index) => ({
    id: `catalog_call_${index + 1}`,
    name,
    arguments: {},
    source: "realtime",
    transcript: text
  }));
  const plan = createCommandPlanFromToolCalls(text, calls);
  plan.createdBy = "realtime-2";
  plan.commands = plan.commands.map((command) => ({ ...command, source: "realtime", confidence: 0.91 }));
  plan.executionGroups = calls.map((call, index) => ({
    id: `catalog_group_${index + 1}`,
    mode: "sequential",
    commandIds: [call.id]
  }));
  return plan;
}

function createHarnessForCatalogCase(testCase: CatalogCase) {
  const registry = new ActionRegistry();
  for (const tool of testCase.tools) {
    if (!registry.get(tool)) registry.register(createLooseAction(tool));
  }

  const sentResults: Array<{ call: AssistantToolCall; result: AssistantToolResult }> = [];
  const shortcutRouter = new IntentShortcutRouter([]);
  const realtime: AssistantRealtimeAdapter = {
    updateTools() {},
    updateContext() {},
    sendToolResult(call, result) {
      sentResults.push({ call, result });
    },
    requestCommandPlan(input) {
      return input === testCase.text ? createPlan(testCase.text, testCase.tools) : null;
    },
    requestToolCall() {
      return null;
    }
  };
  const getContextInput = (): ContextSummarizerInput => ({
    boardId: "board_1",
    boardName: "模拟测试桌板",
    availableBoards: [{ boardId: "board_1", name: "模拟测试桌板", active: true }],
    availableDefinitions: widgetTypes.map((type) => ({ definitionId: `wd_${type}`, type, name: type })),
    widgets: widgetTypes.map((type, index) => ({
      widgetId: `wi_${type}`,
      definitionId: `wd_${type}`,
      type,
      name: type,
      order: index + 1,
      state: {}
    }))
  });

  return {
    harness: new AssistantHarness({
      registry,
      shortcutRouter,
      targetResolver: new WidgetTargetResolver(),
      toolScopeManager: new ToolScopeManager(registry.list()),
      contextSummarizer: new ContextSummarizer(),
      realtime,
      getContextInput,
      now: () => NOW
    }),
    sentResults
  };
}

describe("700 voice scenario catalog through AssistantHarness simulation", () => {
  it("executes every catalog command as a validated Realtime plan", async () => {
    const cases = parseSimulationReport();
    expect(cases).toHaveLength(700);

    const rows: string[] = [
      "# Realtime Voice Scenario Catalog Harness Report",
      "",
      "Every row below was sent through `AssistantHarness.handleUserInput` with a deterministic Realtime command plan and simulated tool registry.",
      ""
    ];
    const failures: string[] = [];

    for (const testCase of cases) {
      const { harness, sentResults } = createHarnessForCatalogCase(testCase);
      await harness.initialize();
      const response = await harness.handleUserInput(testCase.text, { commandTraceId: `catalog_${String(testCase.id).padStart(3, "0")}` });
      const diagnostics = harness.getLastDiagnostics();
      const actualTools = sentResults.map((item) => item.call.name);
      const missing = testCase.tools.filter((tool) => !actualTools.includes(tool));
      const ok = response.result.status === "success" && missing.length === 0 && diagnostics?.usedRealtime === true;
      rows.push(`${String(testCase.id).padStart(3, "0")}. [${ok ? "pass" : "fail"}] tools=${actualTools.join(",") || "NONE"}; command=${testCase.text}`);
      if (!ok) {
        failures.push(`${String(testCase.id).padStart(3, "0")} ${testCase.text}: status=${response.result.status}; missing=${missing.join(",")}; actual=${actualTools.join(",")}; message=${response.result.message}`);
      }
    }

    fs.writeFileSync(harnessReportPath, `${rows.join("\n")}\n`, "utf8");
    expect(failures).toEqual([]);
  });
});
