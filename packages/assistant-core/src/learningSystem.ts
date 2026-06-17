import type { AssistantActionRisk, AssistantToolCall, AssistantToolResult } from "./index";
import type { CommandPlan } from "./realtimeConfig";

export type LearningCandidateType = "shortcut_alias" | "module_alias" | "parameter_default" | "macro" | "negative_example";
export type LearningCandidateStatus = "candidate" | "confirmed" | "rejected";

export interface LearningCandidate {
  id: string;
  type: LearningCandidateType;
  module: string;
  rawText: string;
  normalizedText: string;
  intent: string;
  tool: string;
  args: Record<string, unknown>;
  risk: AssistantActionRisk;
  confidence: number;
  source: "realtime-success" | "text-success" | "user-correction";
  status: LearningCandidateStatus;
  createdAt: string;
  regressionCase?: Record<string, unknown>;
}

export interface LearnedCommandStoreSnapshot {
  shortcuts: LearningCandidate[];
  aliases: LearningCandidate[];
  macros: LearningCandidate[];
  defaults: LearningCandidate[];
  negativeExamples: LearningCandidate[];
}

export interface LearnedCommandStorage {
  load: () => Promise<LearnedCommandStoreSnapshot> | LearnedCommandStoreSnapshot;
  save: (snapshot: LearnedCommandStoreSnapshot) => Promise<void> | void;
}

export class InMemoryLearnedCommandStorage implements LearnedCommandStorage {
  private snapshot: LearnedCommandStoreSnapshot = {
    shortcuts: [],
    aliases: [],
    macros: [],
    defaults: [],
    negativeExamples: []
  };

  load(): LearnedCommandStoreSnapshot {
    return this.clone();
  }

  save(snapshot: LearnedCommandStoreSnapshot): void {
    this.snapshot = {
      shortcuts: [...snapshot.shortcuts],
      aliases: [...snapshot.aliases],
      macros: [...snapshot.macros],
      defaults: [...snapshot.defaults],
      negativeExamples: [...snapshot.negativeExamples]
    };
  }

  private clone(): LearnedCommandStoreSnapshot {
    return {
      shortcuts: [...this.snapshot.shortcuts],
      aliases: [...this.snapshot.aliases],
      macros: [...this.snapshot.macros],
      defaults: [...this.snapshot.defaults],
      negativeExamples: [...this.snapshot.negativeExamples]
    };
  }
}

export function canAutoLearn(candidate: Pick<LearningCandidate, "risk" | "type" | "args">): boolean {
  if (candidate.risk !== "safe") return false;
  if (candidate.type === "macro" || candidate.type === "parameter_default") return false;
  const joinedArgs = JSON.stringify(candidate.args).toLowerCase();
  return !/(token|password|secret|密码|口令|密钥)/.test(joinedArgs);
}

export function createLearningCandidate(input: {
  rawText: string;
  normalizedText: string;
  plan: CommandPlan;
  call: AssistantToolCall;
  result: AssistantToolResult;
  now?: () => string;
}): LearningCandidate | null {
  if (input.result.status !== "success") return null;
  const command = input.plan.commands.find((item) => item.tool === input.call.name) ?? input.plan.commands[0];
  if (!command || command.confidence < 0.65) return null;
  return {
    id: `learn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: input.plan.commands.length > 1 ? "macro" : "shortcut_alias",
    module: command.module,
    rawText: input.rawText,
    normalizedText: input.normalizedText,
    intent: command.tool,
    tool: command.tool,
    args: command.args,
    risk: command.risk,
    confidence: command.confidence,
    source: input.plan.createdBy === "text-llm" ? "text-success" : "realtime-success",
    status: canAutoLearn({ type: "shortcut_alias", risk: command.risk, args: command.args }) ? "candidate" : "candidate",
    createdAt: input.now?.() ?? new Date().toISOString(),
    regressionCase: {
      input: input.rawText,
      expected: {
        module: command.module,
        tool: command.tool,
        args: command.args
      }
    }
  };
}

export class LearnedCommandStore {
  constructor(private readonly storage: LearnedCommandStorage = new InMemoryLearnedCommandStorage()) {}

  async addCandidate(candidate: LearningCandidate): Promise<void> {
    const snapshot = await this.storage.load();
    const bucket = this.bucket(snapshot, candidate.type);
    if (bucket.some((item) => item.normalizedText === candidate.normalizedText && item.tool !== candidate.tool)) {
      throw new Error("学习规则与已有规则冲突");
    }
    bucket.push(candidate);
    await this.storage.save(snapshot);
  }

  async confirm(id: string): Promise<boolean> {
    const snapshot = await this.storage.load();
    const all = Object.values(snapshot).flat();
    const candidate = all.find((item) => item.id === id);
    if (!candidate) return false;
    candidate.status = "confirmed";
    await this.storage.save(snapshot);
    return true;
  }

  async match(normalizedText: string): Promise<LearningCandidate | null> {
    const snapshot = await this.storage.load();
    return snapshot.shortcuts.find((item) => item.status === "confirmed" && item.normalizedText === normalizedText) ?? null;
  }

  private bucket(snapshot: LearnedCommandStoreSnapshot, type: LearningCandidateType): LearningCandidate[] {
    if (type === "module_alias") return snapshot.aliases;
    if (type === "macro") return snapshot.macros;
    if (type === "parameter_default") return snapshot.defaults;
    if (type === "negative_example") return snapshot.negativeExamples;
    return snapshot.shortcuts;
  }
}
