import type { AssistantActionRisk } from "./index";
import type { RealtimeScopedModuleContext, WidgetAssistantModule, WidgetAssistantRegistry } from "./moduleRegistry";

export type WidgetModuleCoverageCategory =
  | "singleTool"
  | "noisySpeech"
  | "missingArgs"
  | "realtimeFallback"
  | "crossTool"
  | "windowControl"
  | "permissionOrAuth"
  | "learningRegression"
  | "scopedContextRedaction"
  | "auditRedaction"
  | "mountedCapability";

export interface WidgetModuleTestCase {
  id: string;
  input: string;
  expected: {
    module: string;
    tool?: string;
    risk?: AssistantActionRisk;
    needsRealtime?: boolean;
    needsConfirmation?: boolean;
  };
  coverage?: {
    categories?: WidgetModuleCoverageCategory[];
    actions?: string[];
    risks?: AssistantActionRisk[];
    contextFields?: string[];
  };
  failure?: {
    reason: string;
    regressionCandidate?: boolean;
  };
}

export interface WidgetModuleTestReport {
  module: string;
  ok: boolean;
  issues: string[];
  coveredActions: string[];
  uncoveredActions: string[];
  risks: AssistantActionRisk[];
  coveredRisks: AssistantActionRisk[];
  uncoveredRisks: AssistantActionRisk[];
  scopedContextFields: string[];
  coveredContextFields: string[];
  uncoveredContextFields: string[];
  coveredCategories: WidgetModuleCoverageCategory[];
  missingCoverageCategories: WidgetModuleCoverageCategory[];
  regressionCandidates: Array<{ id: string; input: string; reason: string }>;
}

function contextKeys(context: RealtimeScopedModuleContext): string[] {
  return Object.keys(context).sort();
}

const baseCoverageCategories: WidgetModuleCoverageCategory[] = [
  "singleTool",
  "noisySpeech",
  "missingArgs",
  "realtimeFallback",
  "crossTool",
  "windowControl",
  "permissionOrAuth",
  "learningRegression",
  "scopedContextRedaction",
  "auditRedaction"
];

const mediaCoverageCategories: WidgetModuleCoverageCategory[] = ["mountedCapability"];

export function getRequiredCoverageCategories(module: WidgetAssistantModule): WidgetModuleCoverageCategory[] {
  const categories = [...baseCoverageCategories];
  if (["music", "recorder", "tv"].includes(module.type)) {
    categories.push(...mediaCoverageCategories);
  }
  return categories;
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

export function validateWidgetModuleCompleteness(module: WidgetAssistantModule): string[] {
  const issues: string[] = [];
  if (!module.type) issues.push("missing type");
  if (!module.definition?.name) issues.push("missing definition.name");
  if (module.aliases.length === 0) issues.push("missing aliases");
  if (module.shortcuts.length === 0) issues.push("missing shortcuts");
  if (module.tools.length === 0) issues.push("missing tools");
  if (!module.actionSpecs || module.actionSpecs.length === 0) issues.push("missing actionSpecs");
  for (const action of module.tools) {
    if (!action.spec.parameters) issues.push(`missing args schema for ${action.spec.name}`);
    if (!action.spec.argumentKeys) issues.push(`missing argument keys for ${action.spec.name}`);
    if (!action.spec.resultSchema) issues.push(`missing result schema for ${action.spec.name}`);
    if (!action.spec.examples || action.spec.examples.length < 3) issues.push(`missing examples for ${action.spec.name}`);
  }
  for (const spec of module.actionSpecs ?? []) {
    if (!spec.argsSchema) issues.push(`missing action spec args schema for ${spec.name}`);
    if (!spec.resultSchema) issues.push(`missing action spec result schema for ${spec.name}`);
    if (spec.examples.length < 3) issues.push(`missing action spec examples for ${spec.name}`);
  }
  if (!module.context.maxRealtimeContextTokens) issues.push("missing maxRealtimeContextTokens");
  if (!module.context.redactContext) issues.push("missing redactContext");
  if (!module.executionPolicy.defaultMode) issues.push("missing executionPolicy.defaultMode");
  return issues;
}

export function runWidgetModuleStaticChecks(
  registry: WidgetAssistantRegistry,
  module: WidgetAssistantModule,
  testCases: WidgetModuleTestCase[] = []
): WidgetModuleTestReport {
  const issues = validateWidgetModuleCompleteness(module);
  const catalog = registry.getRealtimeCatalog().find((item) => item.type === module.type);
  if (!catalog) issues.push("module missing from realtime catalog");
  const context = registry.getScopedContextForModule(module.type, {
    userText: "test",
    compactContext: { widgetCountsByType: {}, widgets: [] }
  });
  if (!context) {
    issues.push("module missing scoped context");
  }
  const coveredActions = uniqueSorted(
    testCases.flatMap((item) => [...(item.expected.tool ? [item.expected.tool] : []), ...(item.coverage?.actions ?? [])])
  );
  const actionNames = module.tools.map((action) => action.spec.name);
  const uncoveredActions = actionNames.filter((name) => !coveredActions.includes(name));
  const risks = uniqueSorted(module.tools.map((action) => action.spec.risk ?? "safe"));
  const coveredRisks = uniqueSorted(
    testCases.flatMap((item) => [...(item.expected.risk ? [item.expected.risk] : []), ...(item.coverage?.risks ?? [])])
  );
  const uncoveredRisks = risks.filter((risk) => !coveredRisks.includes(risk));
  const scopedContextFields = context ? contextKeys(context) : [];
  const coveredContextFields = uniqueSorted(testCases.flatMap((item) => item.coverage?.contextFields ?? []));
  const uncoveredContextFields = scopedContextFields.filter((field) => !coveredContextFields.includes(field));
  const coveredCategories = uniqueSorted(testCases.flatMap((item) => item.coverage?.categories ?? []));
  const missingCoverageCategories = getRequiredCoverageCategories(module).filter((category) => !coveredCategories.includes(category));
  const regressionCandidates = testCases
    .filter((item) => item.failure?.regressionCandidate)
    .map((item) => ({ id: item.id, input: item.input, reason: item.failure?.reason ?? "failed command" }));
  return {
    module: module.type,
    ok: issues.length === 0,
    issues,
    coveredActions,
    uncoveredActions,
    risks,
    coveredRisks,
    uncoveredRisks,
    scopedContextFields,
    coveredContextFields,
    uncoveredContextFields,
    coveredCategories,
    missingCoverageCategories,
    regressionCandidates
  };
}
