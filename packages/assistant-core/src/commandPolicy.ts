import manifest from "./commandPolicyManifest.json";
import type { CommandPlan } from "./realtimeConfig";

export type CommandPolicyManifest = typeof manifest;
export type CommandPolicySemanticRule = CommandPolicyManifest["semanticContractRules"][number];
export type CommandPolicyForbiddenViolation = {
  ruleId: string;
  forbiddenTools: string[];
};

export const commandPolicyManifest: CommandPolicyManifest = manifest;

const nonActionModelTools = new Set(commandPolicyManifest.nonActionModelTools);

export function isNonActionModelTool(toolName: string): boolean {
  return nonActionModelTools.has(toolName);
}

export function getNonActionModelTools(): string[] {
  return [...commandPolicyManifest.nonActionModelTools];
}

export function getCommandPolicyPromptLines(options: { includeSessionOnly?: boolean } = {}): string[] {
  return [
    ...(options.includeSessionOnly ? commandPolicyManifest.promptSnippets.sessionOnly : []),
    ...commandPolicyManifest.promptSnippets.core
  ];
}

function commandMatchesPolicyPattern(input: string, pattern: string): boolean {
  return new RegExp(pattern).test(input);
}

export function getForbiddenToolViolations(input: string, toolNames: string[]): CommandPolicyForbiddenViolation[] {
  const selectedTools = new Set(toolNames);
  return commandPolicyManifest.semanticContractRules
    .filter((rule) => rule.kind === "forbid" && commandMatchesPolicyPattern(input, rule.pattern))
    .map((rule) => ({
      ruleId: rule.id,
      forbiddenTools: rule.tools.filter((tool) => selectedTools.has(tool))
    }))
    .filter((violation) => violation.forbiddenTools.length > 0);
}

export function verifyCommandPlanPolicy(input: string, plan: CommandPlan): {
  ok: boolean;
  forbiddenViolations: CommandPolicyForbiddenViolation[];
  nonActionOnly: boolean;
} {
  const toolNames = plan.commands.map((command) => command.tool);
  const forbiddenViolations = getForbiddenToolViolations(input, toolNames);
  return {
    ok: forbiddenViolations.length === 0,
    forbiddenViolations,
    nonActionOnly: toolNames.length > 0 && toolNames.every(isNonActionModelTool)
  };
}
