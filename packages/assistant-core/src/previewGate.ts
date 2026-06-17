import type { CommandPlan, CommandPlanStep } from "./realtimeConfig";
import type { WidgetAssistantRegistry } from "./moduleRegistry";

export type PreviewRisk = "safe" | "confirm" | "destructive";

export interface PlanPreviewCommand {
  id: string;
  module: string;
  tool: string;
  args: Record<string, unknown>;
  risk: PreviewRisk;
  reversible: boolean;
  impact: string;
}

export interface PlanPreview {
  id: string;
  planId: string;
  commands: PlanPreviewCommand[];
  requiresConfirmation: boolean;
  reason: string;
  recovery: string;
}

export interface PreviewGateOptions {
  moduleRegistry?: WidgetAssistantRegistry;
  alwaysPreviewTools?: string[];
}

const defaultPreviewTools = new Set([
  "board.auto_align",
  "board.rename",
  "clipboard.clear",
  "note.clear",
  "todo.delete_item",
  "todo.clear_completed",
  "aiModule.install",
  "widget.bulk_remove"
]);

function commandNeedsPreview(command: CommandPlanStep, options: PreviewGateOptions): boolean {
  if (command.risk === "confirm" || command.risk === "destructive") return true;
  if (defaultPreviewTools.has(command.tool)) return true;
  if (options.alwaysPreviewTools?.includes(command.tool)) return true;
  const module = options.moduleRegistry?.get(command.module);
  return Boolean(module?.executionPolicy.requiresConfirmation?.includes(command.tool));
}

export function createPlanPreview(plan: CommandPlan, options: PreviewGateOptions = {}): PlanPreview {
  const commands = plan.commands.map((command): PlanPreviewCommand => ({
    id: command.id,
    module: command.module,
    tool: command.tool,
    args: command.args,
    risk: command.risk,
    reversible: command.risk === "safe" && command.tool !== "board.auto_align",
    impact: commandNeedsPreview(command, options) ? `将执行高风险或需确认操作 ${command.tool}` : `将执行 ${command.tool}`
  }));
  const requiresConfirmation = commands.some((command) =>
    commandNeedsPreview(plan.commands.find((item) => item.id === command.id)!, options)
  );
  return {
    id: `preview_${plan.id}`,
    planId: plan.id,
    commands,
    requiresConfirmation,
    reason: requiresConfirmation ? "计划包含需要预览或确认的操作" : "计划可直接执行",
    recovery: requiresConfirmation ? "取消后不会执行相关依赖链；失败时保留审计日志" : "失败时只影响对应命令"
  };
}

export function requiresPlanPreview(plan: CommandPlan, options: PreviewGateOptions = {}): boolean {
  return createPlanPreview(plan, options).requiresConfirmation;
}
