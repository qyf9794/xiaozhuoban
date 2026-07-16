import {
  REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD,
  type CommandPlan,
  type CommandPlanStep
} from "./realtimeConfig";
import type { AssistantToolCall, AssistantToolSpec, IntentShortcutContext } from "./index";
import type { WidgetAssistantModule, WidgetAssistantRegistry } from "./moduleRegistry";

export interface CandidateModuleScore {
  type: string;
  score: number;
  reason: string;
}

export interface CandidateModuleResult {
  normalizedText: string;
  candidates: CandidateModuleScore[];
}

export interface CommandSegment {
  id: string;
  text: string;
  connector: "start" | "sequential" | "parallel";
}

export interface PlanValidationError {
  commandId: string;
  code: "UNKNOWN_TOOL" | "INVALID_ARGUMENTS" | "EXTRA_ARGUMENTS" | "DISABLED_MODULE" | "TOOL_MODULE_MISMATCH";
  message: string;
}

export interface PlanValidationResult {
  ok: boolean;
  plan: CommandPlan;
  errors: PlanValidationError[];
}

export interface PlanValidatorOptions {
  tools: AssistantToolSpec[];
  moduleRegistry?: WidgetAssistantRegistry;
  allowedArgumentKeysByTool?: Record<string, string[]>;
}

const FILLER_WORDS = /(帮我|请|麻烦你?|一下|啊|嗯|呃|那个|这个|就是|吧)/g;
const SEQUENTIAL_CONNECTOR = /(?:然后|接着|随后|再|最后)/;
const PARALLEL_CONNECTOR = /(?:同时|与此同时|顺便)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatSchemaError(error: unknown): string {
  if (!isRecord(error)) return "参数校验失败";
  const issues = Array.isArray(error.issues) ? error.issues : [];
  if (issues.length > 0) {
    return issues
      .map((issue) => (isRecord(issue) && typeof issue.message === "string" ? issue.message : "参数校验失败"))
      .join("; ");
  }
  return typeof error.message === "string" ? error.message : "参数校验失败";
}

function readStringValues(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return [];
}

function mergeStringAlias(args: Record<string, unknown>, allowedKeys: string[], targetKey: string, aliases: string[]): Record<string, unknown> {
  if (!allowedKeys.includes(targetKey)) return args;
  const values = [args[targetKey], ...aliases.map((key) => args[key])].flatMap(readStringValues);
  const uniqueValues = Array.from(new Set(values));
  if (!uniqueValues.length) return args;
  const next = { ...args, [targetKey]: uniqueValues.join(" ") };
  for (const alias of aliases) {
    if (!allowedKeys.includes(alias)) delete next[alias];
  }
  return next;
}

function mergeNumberAlias(args: Record<string, unknown>, allowedKeys: string[], targetKey: string, aliases: string[]): Record<string, unknown> {
  if (!allowedKeys.includes(targetKey) || typeof args[targetKey] === "number") return args;
  const alias = aliases.find((key) => typeof args[key] === "number" && Number.isFinite(args[key]));
  if (!alias) return args;
  const next = { ...args, [targetKey]: args[alias] };
  if (!allowedKeys.includes(alias)) delete next[alias];
  return next;
}

function normalizePlanCommandArgs(args: Record<string, unknown>, allowedKeys?: string[]): Record<string, unknown> {
  if (!allowedKeys?.length) return args;
  let next = args;
  next = mergeStringAlias(next, allowedKeys, "query", [
    "q",
    "keyword",
    "keywords",
    "term",
    "search",
    "artist",
    "artistName",
    "singer",
    "song",
    "songName",
    "songHint",
    "title",
    "track",
    "trackName",
    "musicHint",
    "targetHint",
    "text",
    "content"
  ]);
  next = mergeStringAlias(next, allowedKeys, "channelName", ["channel", "channelTitle", "station", "stationName", "channelHint", "targetHint", "name"]);
  next = mergeStringAlias(next, allowedKeys, "city", ["location", "cityName", "place", "targetHint", "query"]);
  next = mergeStringAlias(next, allowedKeys, "text", ["content", "title", "task", "todo", "item", "targetHint", "query"]);
  next = mergeStringAlias(next, allowedKeys, "content", ["text", "note", "body", "targetHint", "query"]);
  next = mergeNumberAlias(next, allowedKeys, "resultIndex", ["index", "position", "trackIndex"]);
  return next;
}

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[，。！？、,.!?；;]/g, " ")
    .replace(FILLER_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function segmentCommandText(input: string): CommandSegment[] {
  const normalized = input.trim();
  if (!normalized) return [];
  const parts = normalized.split(/(然后|接着|随后|再|最后|同时|与此同时|顺便)/).filter((part) => part.trim());
  const segments: CommandSegment[] = [];
  let connector: CommandSegment["connector"] = "start";
  for (const part of parts) {
    if (SEQUENTIAL_CONNECTOR.test(part)) {
      connector = "sequential";
      continue;
    }
    if (PARALLEL_CONNECTOR.test(part)) {
      connector = "parallel";
      continue;
    }
    segments.push({
      id: `segment_${segments.length + 1}`,
      text: part.replace(/^[，,。；;\s]+|[，,。；;\s]+$/g, "").trim(),
      connector
    });
    connector = "sequential";
  }
  return segments.filter((segment) => segment.text);
}

export function scoreCandidates(
  input: string,
  modules: WidgetAssistantModule[],
  context: IntentShortcutContext = {}
): CandidateModuleResult {
  const normalizedText = normalizeText(input);
  const focusedType = context.focusedWidget?.type;
  const candidates = modules
    .map((module): CandidateModuleScore => {
      const aliasHit = module.aliases.some((alias) => normalizedText.includes(alias.toLowerCase()));
      const exampleHit = module.shortcuts.some((shortcut) =>
        shortcut.examples.some((example) => normalizeText(example) && normalizedText.includes(normalizeText(example)))
      );
      const actionHit = module.shortcuts.some((shortcut) =>
        [...(shortcut.actions ?? []), shortcut.intent].some((action) => normalizedText.includes(action.toLowerCase()))
      );
      const focusBoost = focusedType === module.type ? 0.08 : 0;
      const score = Math.min(0.99, (aliasHit ? 0.55 : 0) + (exampleHit ? 0.24 : 0) + (actionHit ? 0.18 : 0) + focusBoost);
      const reasons = [
        aliasHit ? "alias" : "",
        exampleHit ? "shortcut_example" : "",
        actionHit ? "action_word" : "",
        focusBoost ? "focused_widget" : ""
      ].filter(Boolean);
      return { type: module.type, score, reason: reasons.join("+") || "no_signal" };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return { normalizedText, candidates };
}

export function createCommandPlanFromToolCalls(input: string, calls: AssistantToolCall[]): CommandPlan {
  const normalizedText = normalizeText(input);
  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceText: input,
    normalizedText,
    commands: calls.map((call, index) => ({
      id: call.id || `command_${index + 1}`,
      module: call.name.split(".")[0] ?? "unknown",
      tool: call.name,
      args: isRecord(call.arguments) ? call.arguments : {},
      risk: "safe",
      confidence: call.source === "shortcut" ? 0.95 : REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD,
      source: call.source,
      requiresHarnessValidation: true
    })),
    dependencies: [],
    executionGroups: [
      {
        id: "group_1",
        mode: calls.length > 1 ? "parallel" : "sequential",
        commandIds: calls.map((call, index) => call.id || `command_${index + 1}`)
      }
    ],
    confidence: calls.every((call) => call.source === "shortcut") ? 0.95 : REALTIME_TOOL_SELECTION_CONFIDENCE_THRESHOLD,
    needsConfirmation: false,
    createdBy:
      calls[0]?.source === "shortcut"
        ? "local"
        : calls[0]?.source === "text"
          ? "text-llm"
          : calls[0]?.source === "learned"
            ? "learned"
            : "realtime-2",
    requiresHarnessValidation: true
  };
}

export class ShortcutPlanAdapter {
  createPlan(input: string, groups: AssistantToolCall[][]): CommandPlan {
    const flatCalls = groups.flat();
    const plan = createCommandPlanFromToolCalls(input, flatCalls);
    plan.createdBy = "local";
    plan.executionGroups = groups.map((group, index) => ({
      id: `group_${index + 1}`,
      mode: group.length > 1 ? "parallel" : "sequential",
      commandIds: group.map((call) => call.id)
    }));
    return plan;
  }
}

export class RealtimePlanAdapter {
  createPlan(input: string, call: AssistantToolCall): CommandPlan {
    const plan = createCommandPlanFromToolCalls(input, [{ ...call, source: "realtime" }]);
    plan.createdBy = "realtime-2";
    return plan;
  }
}

export class TextFallbackPlanAdapter {
  createPlan(input: string, call: AssistantToolCall): CommandPlan {
    const plan = createCommandPlanFromToolCalls(input, [{ ...call, source: "text" }]);
    plan.createdBy = "text-llm";
    return plan;
  }
}

export function commandPlanToToolCalls(plan: CommandPlan): AssistantToolCall[] {
  return plan.commands.map((command: CommandPlanStep) => ({
    id: command.id,
    name: command.tool,
    arguments: command.args,
    source: command.source
  }));
}

export class PlanValidator {
  private readonly toolsByName: Map<string, AssistantToolSpec>;

  constructor(private readonly options: PlanValidatorOptions) {
    this.toolsByName = new Map(options.tools.map((tool) => [tool.name, tool]));
  }

  validate(plan: CommandPlan): PlanValidationResult {
    const errors: PlanValidationError[] = [];
    const sanitizedCommands = plan.commands.map((command) => {
      const module = this.options.moduleRegistry?.get(command.module);
      const moduleSpec = module?.tools.find((action) => action.spec.name === command.tool)?.spec;
      const spec = moduleSpec ?? this.toolsByName.get(command.tool);
      if (!spec) {
        errors.push({ commandId: command.id, code: "UNKNOWN_TOOL", message: `未知工具：${command.tool}` });
        return command;
      }

      if (module && this.options.moduleRegistry?.status(command.module) === "disabled") {
        errors.push({ commandId: command.id, code: "DISABLED_MODULE", message: `模块已禁用：${command.module}` });
      }
      if (module && !module.tools.some((action) => action.spec.name === command.tool)) {
        errors.push({
          commandId: command.id,
          code: "TOOL_MODULE_MISMATCH",
          message: `工具 ${command.tool} 不属于模块 ${command.module}`
        });
      }

      const allowedKeys = this.options.allowedArgumentKeysByTool?.[command.tool] ?? spec.argumentKeys;
      const normalizedArgs = normalizePlanCommandArgs(command.args, allowedKeys);
      if (allowedKeys) {
        const extraKeys = Object.keys(normalizedArgs).filter((key) => !allowedKeys.includes(key));
        if (extraKeys.length > 0) {
          errors.push({
            commandId: command.id,
            code: "EXTRA_ARGUMENTS",
            message: `工具 ${command.tool} 包含未声明参数：${extraKeys.join(", ")}`
          });
        }
      }

      const parsed = spec.parameters.safeParse(normalizedArgs);
      if (!parsed.success) {
        errors.push({ commandId: command.id, code: "INVALID_ARGUMENTS", message: formatSchemaError(parsed.error) });
        return command;
      }
      return { ...command, args: isRecord(parsed.data) ? parsed.data : command.args };
    });

    return {
      ok: errors.length === 0,
      plan: { ...plan, commands: sanitizedCommands },
      errors
    };
  }
}
