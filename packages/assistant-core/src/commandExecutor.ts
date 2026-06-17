import type { AssistantToolCall, AssistantToolResult } from "./index";
import type { CommandPlan, CommandPlanStep, ExecutionGroup } from "./realtimeConfig";

export type CommandExecutionPhase = "pending" | "running" | "waiting_confirmation" | "success" | "failed" | "cancelled" | "skipped";

export interface CommandExecutionEvent {
  operationId: string;
  commandId: string;
  tool: string;
  module: string;
  phase: CommandExecutionPhase;
  message?: string;
}

export interface CommandExecutionRecord {
  command: CommandPlanStep;
  result: AssistantToolResult;
  phase: CommandExecutionPhase;
  startedAt: number;
  finishedAt: number;
}

export interface CommandExecutionResult {
  planId: string;
  status: "success" | "failed" | "needs_confirmation" | "cancelled";
  records: CommandExecutionRecord[];
}

export interface CommandExecutorOptions {
  execute: (call: AssistantToolCall, command: CommandPlanStep) => Promise<AssistantToolResult> | AssistantToolResult;
  onEvent?: (event: CommandExecutionEvent) => void;
  now?: () => number;
}

function commandToCall(command: CommandPlanStep): AssistantToolCall {
  return {
    id: command.id,
    name: command.tool,
    arguments: command.args,
    source: command.source,
    transcript: command.id
  };
}

function phaseFromResult(result: AssistantToolResult): CommandExecutionPhase {
  if (result.status === "success") return "success";
  if (result.status === "needs_confirmation") return "waiting_confirmation";
  if (result.status === "cancelled") return "cancelled";
  return "failed";
}

export class CommandExecutor {
  constructor(private readonly options: CommandExecutorOptions) {}

  async execute(plan: CommandPlan): Promise<CommandExecutionResult> {
    const records: CommandExecutionRecord[] = [];
    const completed = new Map<string, AssistantToolResult>();
    const commandsById = new Map(plan.commands.map((command) => [command.id, command]));
    for (const group of plan.executionGroups.length ? plan.executionGroups : this.defaultGroups(plan)) {
      const groupRecords = group.mode === "parallel"
        ? await Promise.all(group.commandIds.map((id) => this.executeCommandIfReady(commandsById.get(id), completed)))
        : await this.executeSequential(group, commandsById, completed);
      for (const record of groupRecords.filter(Boolean) as CommandExecutionRecord[]) {
        records.push(record);
        completed.set(record.command.id, record.result);
      }
      if (groupRecords.some((record) => record?.result.status === "needs_confirmation")) break;
    }
    const blocking = records.find((record) => record.result.status === "needs_confirmation" || record.result.status === "cancelled" || record.result.status === "failed");
    return {
      planId: plan.id,
      status: blocking?.result.status === "needs_confirmation" ? "needs_confirmation" : blocking ? blocking.result.status === "cancelled" ? "cancelled" : "failed" : "success",
      records
    };
  }

  private async executeSequential(
    group: ExecutionGroup,
    commandsById: Map<string, CommandPlanStep>,
    completed: Map<string, AssistantToolResult>
  ): Promise<CommandExecutionRecord[]> {
    const records: CommandExecutionRecord[] = [];
    for (const id of group.commandIds) {
      const record = await this.executeCommandIfReady(commandsById.get(id), completed);
      if (!record) continue;
      records.push(record);
      completed.set(record.command.id, record.result);
      if (record.result.status !== "success") break;
    }
    return records;
  }

  private async executeCommandIfReady(
    command: CommandPlanStep | undefined,
    completed: Map<string, AssistantToolResult>
  ): Promise<CommandExecutionRecord | null> {
    if (!command) return null;
    const dependencyFailed = (command.dependsOn ?? []).some((id) => completed.get(id)?.status !== "success");
    if (dependencyFailed) {
      return this.record(command, { status: "failed", message: "依赖命令未成功，已跳过", errorCode: "DEPENDENCY_FAILED" }, "skipped");
    }
    this.emit(command, "running");
    const result = await this.options.execute(commandToCall(command), command);
    return this.record(command, result, phaseFromResult(result));
  }

  private record(command: CommandPlanStep, result: AssistantToolResult, phase: CommandExecutionPhase): CommandExecutionRecord {
    const now = this.options.now?.() ?? Date.now();
    this.emit(command, phase, result.message);
    return { command, result, phase, startedAt: now, finishedAt: now };
  }

  private emit(command: CommandPlanStep, phase: CommandExecutionPhase, message?: string) {
    this.options.onEvent?.({
      operationId: command.id,
      commandId: command.id,
      tool: command.tool,
      module: command.module,
      phase,
      message
    });
  }

  private defaultGroups(plan: CommandPlan): ExecutionGroup[] {
    return [{ id: "group_1", mode: "sequential", commandIds: plan.commands.map((command) => command.id) }];
  }
}
