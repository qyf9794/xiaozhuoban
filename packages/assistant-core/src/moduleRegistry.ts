import type {
  AssistantAction,
  AssistantActionRisk,
  AssistantToolSpec,
  CompactAssistantContext,
  CompactWidgetSummary
} from "./index";

export interface WidgetAssistantDefinition {
  id: string;
  type: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  multiInstance?: boolean;
}

export interface ShortcutSlot {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  required?: boolean;
  values?: string[];
}

export interface ShortcutRule {
  id: string;
  intent: string;
  actions?: string[];
  targets?: string[];
  patterns?: string[];
  slots?: ShortcutSlot[];
  order?: "fixed" | "any";
  noiseTolerant?: boolean;
  examples: string[];
  risk: AssistantActionRisk;
}

export interface WidgetExecutionPolicy {
  defaultMode: "sequential" | "parallel" | "latest-wins";
  exclusiveActions?: string[];
  destructiveActions?: string[];
  requiresConfirmation?: string[];
  requiresMountedWidget?: boolean;
  canRunInParallelWith?: string[];
  conflictsWith?: string[];
}

export interface WidgetModuleActionSpec {
  name: string;
  intent: string;
  description: string;
  argsSchema: unknown;
  resultSchema: unknown;
  risk: AssistantActionRisk;
  requiresMountedWidget?: boolean;
  requiresAuth?: boolean;
  requiresPermission?: string[];
  idempotency: "idempotent" | "repeatable" | "stateful" | "destructive";
  missingArgPolicy: "ask" | "use_default" | "fail";
  concurrencyKey?: string;
  examples: string[];
}

export interface ScopedContextRequest {
  userText: string;
  selectedModule: string;
  selectedToolHint?: string;
  compactContext?: CompactAssistantContext;
  tools?: AssistantToolSpec[];
}

export interface RealtimeModuleCatalogItem {
  type: string;
  displayName: string;
  aliases: string[];
  capabilities: string[];
  shortcutExamples: string[];
  riskSummary: string[];
}

export interface RealtimeScopedModuleContext {
  moduleType: string;
  tools: AssistantToolSpec[];
  toolSchemas: Record<string, unknown>;
  instances: CompactWidgetSummary[];
  stateSummary: Record<string, unknown>;
  shortcutExamples: string[];
  executionPolicy: WidgetExecutionPolicy;
  riskPolicy: {
    safe: string[];
    confirm: string[];
    destructive: string[];
  };
}

export interface WidgetContextProvider {
  getScopedContext: (input: ScopedContextRequest) => RealtimeScopedModuleContext;
  redactContext?: (context: RealtimeScopedModuleContext) => RealtimeScopedModuleContext;
  maxRealtimeContextTokens?: number;
}

export interface WidgetRealtimeProvider {
  exposeCatalog: () => RealtimeModuleCatalogItem;
  getScopedContext: (input: ScopedContextRequest) => RealtimeScopedModuleContext;
}

export interface WidgetTestMatrix {
  localParsing?: string[];
  commandPlans?: string[];
  execution?: string[];
  realtimeFallback?: string[];
  regression?: string[];
}

export interface ModuleMigrationReport {
  module: string;
  legacyBridge: boolean;
  migratedFiles: string[];
  preservedShortcuts: string[];
  pendingItems: string[];
  completedAt?: string;
}

export interface ShortcutConflictReport {
  id: string;
  modules: string[];
  shortcut: string;
  conflictType: "alias" | "intent" | "risk" | "tool" | "unknown";
  resolution: "none" | "regression_added" | "minimal_fix" | "blocked";
  notes: string;
}

export interface WidgetAssistantModule {
  type: string;
  definition: WidgetAssistantDefinition;
  aliases: string[];
  shortcuts: ShortcutRule[];
  tools: AssistantAction[];
  context: WidgetContextProvider;
  realtime: WidgetRealtimeProvider;
  executionPolicy: WidgetExecutionPolicy;
  actionSpecs?: WidgetModuleActionSpec[];
  legacyBridge?: boolean;
  migrationNotes?: string[];
  capability?: unknown;
  testMatrix?: WidgetTestMatrix;
}

export type WidgetAssistantRegistryStatus = "active" | "disabled";

type RegistryEntry = {
  module: WidgetAssistantModule;
  status: WidgetAssistantRegistryStatus;
};

export class WidgetAssistantRegistry {
  private readonly modules = new Map<string, RegistryEntry>();

  register(module: WidgetAssistantModule): void {
    const type = module.type.trim();
    if (!type) {
      throw new Error("Widget assistant module type is required");
    }
    if (this.modules.has(type)) {
      throw new Error(`Widget assistant module already registered: ${type}`);
    }
    this.modules.set(type, { module, status: "active" });
  }

  unregister(type: string): boolean {
    return this.modules.delete(type);
  }

  disable(type: string): boolean {
    const entry = this.modules.get(type);
    if (!entry) return false;
    entry.status = "disabled";
    return true;
  }

  enable(type: string): boolean {
    const entry = this.modules.get(type);
    if (!entry) return false;
    entry.status = "active";
    return true;
  }

  get(type: string): WidgetAssistantModule | null {
    return this.modules.get(type)?.module ?? null;
  }

  status(type: string): WidgetAssistantRegistryStatus | null {
    return this.modules.get(type)?.status ?? null;
  }

  list(options: { includeDisabled?: boolean } = {}): WidgetAssistantModule[] {
    return [...this.modules.values()]
      .filter((entry) => options.includeDisabled || entry.status === "active")
      .map((entry) => entry.module);
  }

  listTools(options: { includeDisabled?: boolean } = {}): AssistantToolSpec[] {
    return this.list(options).flatMap((module) => module.tools.map((action) => action.spec));
  }

  listShortcuts(options: { includeDisabled?: boolean } = {}): ShortcutRule[] {
    return this.list(options).flatMap((module) => module.shortcuts);
  }

  listTestMatrices(options: { includeDisabled?: boolean } = {}): Array<{ module: string; testMatrix: WidgetTestMatrix | undefined }> {
    return this.list(options).map((module) => ({ module: module.type, testMatrix: module.testMatrix }));
  }

  getToolsForModule(type: string): AssistantToolSpec[] {
    const entry = this.modules.get(type);
    return entry && entry.status === "active" ? entry.module.tools.map((action) => action.spec) : [];
  }

  getShortcutsForModule(type: string): ShortcutRule[] {
    const entry = this.modules.get(type);
    return entry && entry.status === "active" ? entry.module.shortcuts : [];
  }

  getTestMatrixForModule(type: string): WidgetTestMatrix | null {
    const entry = this.modules.get(type);
    return entry && entry.status === "active" ? entry.module.testMatrix ?? null : null;
  }

  getRealtimeCatalog(): RealtimeModuleCatalogItem[] {
    return this.list().map((module) => module.realtime.exposeCatalog());
  }

  getScopedContextForModule(type: string, request: Omit<ScopedContextRequest, "selectedModule">): RealtimeScopedModuleContext | null {
    const entry = this.modules.get(type);
    if (!entry || entry.status !== "active") {
      return null;
    }
    const context = entry.module.realtime.getScopedContext({ ...request, selectedModule: type });
    return entry.module.context.redactContext?.(context) ?? context;
  }

  findModuleForTool(toolName: string): WidgetAssistantModule | null {
    return this.list().find((module) => module.tools.some((action) => action.spec.name === toolName)) ?? null;
  }
}
