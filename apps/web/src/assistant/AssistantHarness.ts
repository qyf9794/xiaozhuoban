import {
  ActionRegistry,
  CommandExecutor,
  ContextSummarizer,
  IntentShortcutRouter,
  PlanValidator,
  ShortcutPlanAdapter,
  ToolScopeManager,
  WidgetAssistantRegistry,
  WidgetTargetResolver,
  createCommandPlanFromToolCalls,
  createPlanPreview,
  classifyShortcutDeferral,
  getForbiddenToolViolations,
  isNonActionModelTool,
  scoreCandidates,
  segmentCommandText,
  normalizeText,
  type LearnedCommandStore,
  type LearningCandidate,
  type AssistantActionContext,
  type AssistantToolCall,
  type AssistantToolResult,
  type AssistantToolSpec,
  type CommandPlan,
  type CommandPlanStep,
  type CommandPolicyForbiddenViolation,
  type CompactWidgetSummary,
  type CompactAssistantContext,
  type ConfirmationRequest,
  type ContextSummarizerInput,
  type IntentShortcutContext,
  type ResolvedWidgetTarget
} from "@xiaozhuoban/assistant-core";
import { realtimeWidgetAliases } from "./realtimeRoutingPolicy";

export type AssistantRoute = "shortcut" | "model" | "function_call" | "learned";
type AssistantRisk = CommandPlanStep["risk"];
const riskRank: Record<AssistantRisk, number> = { safe: 0, confirm: 1, destructive: 2 };
const AUTO_LEARNING_ENABLED = false;

export interface AssistantRealtimeAdapter {
  updateTools: (tools: AssistantToolSpec[]) => Promise<void> | void;
  updateContext?: (context: CompactAssistantContext) => Promise<void> | void;
  updateModules?: (registry: WidgetAssistantRegistry) => Promise<void> | void;
  setActiveCommandTraceId?: (commandTraceId: string | null) => Promise<void> | void;
  sendToolResult: (call: AssistantToolCall, result: AssistantToolResult) => Promise<void> | void;
  requestToolCall?: (
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[],
    moduleRegistry?: WidgetAssistantRegistry
  ) => Promise<AssistantToolCall | null> | AssistantToolCall | null;
  requestCommandPlan?: (
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[],
    moduleRegistry?: WidgetAssistantRegistry
  ) => Promise<CommandPlan | null> | CommandPlan | null;
}

export interface AssistantAuditEvent {
  route: AssistantRoute;
  operationId?: string;
  call?: AssistantToolCall;
  result: AssistantToolResult;
  durationMs: number;
  normalized?: string;
  candidateModules?: Array<{ type: string; score: number; reason: string }>;
  selectedModule?: string;
  selectedToolHint?: string;
  selectionConfidence?: number;
  learningCandidate?: boolean;
}

export interface AssistantAuditAdapter {
  write: (event: AssistantAuditEvent) => Promise<void> | void;
}

export type AssistantOperationPhase = "running" | "waiting_confirmation" | "success" | "failed" | "cancelled" | "skipped";

export interface AssistantOperationEvent {
  id: string;
  commandTraceId?: string;
  phase: AssistantOperationPhase;
  route: AssistantRoute;
  toolName?: string;
  message?: string;
}

type AssistantRecoveryReason = "non_action_model_tools" | "forbidden_model_tools";

export interface AssistantCommandDiagnostics {
  commandTraceId: string;
  rawInput: string;
  normalizedText: string;
  route?: AssistantRoute;
  usedRealtime: boolean;
  segments: Array<{ id: string; text: string; connector: string }>;
  candidateModules: Array<{ type: string; score: number; reason: string }>;
  commandPlan?: {
    id: string;
    createdBy: CommandPlan["createdBy"];
    commands: Array<{
      id: string;
      module: string;
      tool: string;
      risk: string;
      source: string;
      dependsOn?: string[];
      argKeys: string[];
    }>;
    executionGroups: CommandPlan["executionGroups"];
  };
  validationErrors?: Array<{ commandId: string; code: string; message: string }>;
  toolResults: Array<{ id: string; tool: string; status: string; message?: string; errorCode?: string }>;
  recovery?: {
    reason: AssistantRecoveryReason;
    modelTools: string[];
    recoveredTool: string;
    violations?: CommandPolicyForbiddenViolation[];
  };
  shortcutDeferral?: {
    ruleId: string;
    category: string;
    reason: string;
  };
  status?: AssistantToolResult["status"];
  message?: string;
  pendingConfirmation?: boolean;
  learningCandidate?: boolean;
}

export interface AssistantHarnessOptions {
  registry: ActionRegistry;
  shortcutRouter: IntentShortcutRouter;
  targetResolver: WidgetTargetResolver;
  toolScopeManager: ToolScopeManager;
  contextSummarizer: ContextSummarizer;
  realtime: AssistantRealtimeAdapter;
  moduleRegistry?: WidgetAssistantRegistry;
  planValidator?: PlanValidator;
  learnedCommandStore?: LearnedCommandStore;
  audit?: AssistantAuditAdapter;
  onOperation?: (event: AssistantOperationEvent) => void;
  getContextInput: () => ContextSummarizerInput;
  actionTimeoutMs?: number;
  now?: () => string;
}

export interface AssistantHarnessResponse {
  route: AssistantRoute;
  call?: AssistantToolCall;
  result: AssistantToolResult;
}

export interface AssistantHandleUserInputOptions {
  commandTraceId?: string;
}

const CONFIRM_TOOL = "assistant.confirm";
const CANCEL_TOOL = "assistant.cancel";
const ADD_WIDGET_TOOL = "board.add_widget";
const FOCUS_WIDGET_TOOL = "widget.focus";
const APP_FULLSCREEN_TOOL = "app.fullscreen.set";
const PLANNED_WIDGET_PREFIX = "planned_widget_";
const LOCAL_SHORTCUT_CONFIDENCE_THRESHOLD = 0.9;
const WIDGET_WINDOW_TOOLS = new Set([
  "widget.focus",
  "widget.fullscreen_focus",
  "widget.remove",
  "widget.move",
  "widget.resize",
  "widget.bring_to_front"
]);
const SEQUENTIAL_CONNECTOR_PATTERN = /(?:，|,|。|；|;)?\s*(?:然后|接着|随后|再)\s*/;
const PARALLEL_CONNECTOR_PATTERN = /(?:，|,|。|；|;)?\s*(?:同时|与此同时)\s*/;
const CLOSE_MULTI_CONNECTOR_PATTERN = /(?:和|以及|还有|跟|与)/;
const CLOSE_COMMAND_PATTERN = /(关闭|关掉|关上|关了|收起|删掉|删除|移除|去掉|关)/;

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T | "timed_out"> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => resolve("timed_out"), timeoutMs);
    task
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => globalThis.clearTimeout(timer));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getTargetText(args: unknown) {
  if (!isRecord(args)) return "";
  const value = args.targetText ?? args.target ?? args.widgetRef;
  return typeof value === "string" ? value : "";
}

function removeTargetText(args: unknown) {
  if (!isRecord(args)) return args;
  const next = { ...args };
  delete next.targetText;
  delete next.target;
  delete next.widgetRef;
  return next;
}

function createTargetBoundArguments(args: unknown, target?: ResolvedWidgetTarget) {
  const next = removeTargetText(args);
  if (!target || !isRecord(next) || typeof next.widgetId === "string") {
    return next;
  }
  return { ...next, widgetId: target.widgetId };
}

function cleanCommandSegment(segment: string) {
  return segment
    .replace(/^[\s，,。；;]+|[\s，,。；;]+$/g, "")
    .replace(/^(先|请|帮我|麻烦|麻烦你)\s*/, "")
    .trim();
}

function splitShortcutCommandGroups(input: string): string[][] {
  const closeGroups = splitCloseMultiTargetCommand(input);
  if (closeGroups.length) {
    return closeGroups;
  }
  if (!SEQUENTIAL_CONNECTOR_PATTERN.test(input) && !PARALLEL_CONNECTOR_PATTERN.test(input)) {
    return [];
  }
  return input
    .split(SEQUENTIAL_CONNECTOR_PATTERN)
    .map((part) => part.split(PARALLEL_CONNECTOR_PATTERN).map(cleanCommandSegment).filter(Boolean))
    .filter((group) => group.length > 0);
}

function splitCloseMultiTargetCommand(input: string): string[][] {
  const closeVerb = input.match(CLOSE_COMMAND_PATTERN)?.[1] ?? "";
  if (!closeVerb || !CLOSE_MULTI_CONNECTOR_PATTERN.test(input)) {
    return [];
  }
  const entries = Object.entries(realtimeWidgetAliases).map(([type, aliases]) => ({ type, aliases }));
  const matches = entries
    .flatMap((entry) =>
      entry.aliases.map((alias) => ({
        type: entry.type,
        alias,
        index: input.indexOf(alias)
      }))
    )
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.type === item.type) === index);
  if (matches.length < 2) {
    return [];
  }
  return matches.map((item) => [`${closeVerb}${item.alias}`]);
}

function isSimpleBulkCloseWindowCommand(input: string) {
  const normalized = input.replace(/\s+/g, "");
  if (/(保留|除了|除开|只关闭|只留下|留下|确认|先问|先确认|临时)/.test(normalized)) {
    return false;
  }
  const hasCloseVerb = /(关闭|关掉|关上|收起|移除|删除)/.test(normalized);
  const hasBulkQuantifier = /(所有|全部|全都|全部的|所有的)/.test(normalized);
  const hasWindowNoun = /(窗口|小工具|组件|面板)/.test(normalized);
  return hasCloseVerb && hasBulkQuantifier && hasWindowNoun;
}

function isBulkWindowTargetText(input: string) {
  const normalized = input.replace(/\s+/g, "");
  if (/(保留|除了|除开|只关闭|只留下|留下|临时)/.test(normalized)) {
    return false;
  }
  return /(所有|全部|全都|全部的|所有的)/.test(normalized) && /(窗口|小工具|组件|面板)/.test(normalized);
}

function isDiagnosticOrPreferenceIntent(input: string) {
  const normalized = input.replace(/\s+/g, "");
  if (/(执行关闭|触发确认|不要回答没有工具)/.test(normalized)) {
    return false;
  }
  return (
    /(?:记录|日志|监控|诊断|前端成功状态|路由|恢复来源|重复次数|弱网|断线|恢复会话|多轮对话|不要忘记)/.test(normalized) ||
    /(?:我说|以后我说|下次我说).{0,18}(?:时|优先|就)/.test(normalized) ||
    /(?:前|之前|先).{0,10}(?:告诉我|回复|确认|查看|检查).{0,10}(?:状态|有没有|是否)/.test(normalized)
  );
}

type AddedWidgetData = {
  definitionId: string;
  widgetId: string;
  widgetType: string;
};

function extractAddedWidgetData(result: AssistantToolResult): AddedWidgetData | null {
  const data = isRecord(result.data) ? result.data : null;
  const addWidget = isRecord(data?.addWidget) ? data.addWidget : data;
  const definitionId = typeof addWidget?.definitionId === "string" ? addWidget.definitionId : "";
  const widgetId = typeof addWidget?.widgetId === "string" ? addWidget.widgetId : "";
  const widgetType = typeof addWidget?.widgetType === "string" ? addWidget.widgetType : "";
  return definitionId && widgetId && widgetType ? { definitionId, widgetId, widgetType } : null;
}

function isPlannedWidgetId(widgetId: string) {
  return widgetId.startsWith(PLANNED_WIDGET_PREFIX);
}

function plannedWidgetType(widgetId: string) {
  return isPlannedWidgetId(widgetId) ? widgetId.slice(PLANNED_WIDGET_PREFIX.length) : "";
}

export class AssistantHarness {
  private pendingConfirmation: ConfirmationRequest | null = null;
  private currentTools: AssistantToolSpec[] = [];
  private initialized = false;
  private transientWidgetTargets = new Map<string, ResolvedWidgetTarget>();
  private queuedShortcutPlanGroups: AssistantToolCall[][] = [];
  private queuedPostConfirmationPlan: { route: AssistantRoute; plan: CommandPlan } | null = null;
  private pendingLearningCandidate: LearningCandidate | null = null;
  private readonly planValidator: PlanValidator;
  private readonly shortcutPlanAdapter = new ShortcutPlanAdapter();
  private readonly auditMetadataByCallId = new Map<string, Pick<AssistantAuditEvent, "normalized" | "candidateModules" | "selectedModule" | "selectedToolHint" | "selectionConfidence">>();
  private lastDiagnostics: AssistantCommandDiagnostics | null = null;

  constructor(private readonly options: AssistantHarnessOptions) {
    this.planValidator =
      options.planValidator ??
      new PlanValidator({
        tools: options.registry.list(),
        moduleRegistry: options.moduleRegistry
      });
  }

  async initialize(): Promise<void> {
    this.currentTools = this.options.toolScopeManager.getActiveTools();
    this.initialized = true;
    if (this.options.moduleRegistry) {
      await this.options.realtime.updateModules?.(this.options.moduleRegistry);
    }
    await this.options.realtime.updateTools(this.currentTools);
    await this.updateRealtimeContext();
  }

  async refreshRealtimeContext(): Promise<void> {
    if (!this.initialized) return;
    await this.syncRealtimeToolsToCurrentContext();
    await this.updateRealtimeContext();
  }

  async enterWidgetContext(widgetType: string): Promise<void> {
    void widgetType;
    this.currentTools = this.options.toolScopeManager.getActiveTools();
    await this.options.realtime.updateTools(this.currentTools);
    await this.updateRealtimeContext();
  }

  getPendingConfirmation(): ConfirmationRequest | null {
    return this.pendingConfirmation ?? this.getLearningConfirmation();
  }

  getCurrentContext(): CompactAssistantContext {
    const input = this.options.getContextInput();
    return this.options.contextSummarizer.summarize({
      ...input,
      pendingConfirmation: this.pendingConfirmation ?? input.pendingConfirmation
    });
  }

  getLastDiagnostics(): AssistantCommandDiagnostics | null {
    return this.lastDiagnostics ? JSON.parse(JSON.stringify(this.lastDiagnostics)) as AssistantCommandDiagnostics : null;
  }

  async handleUserInput(input: string, options: AssistantHandleUserInputOptions = {}): Promise<AssistantHarnessResponse> {
    const startedAt = Date.now();
    const commandTraceId = options.commandTraceId ?? createId("trace");
    this.startDiagnostics(input, commandTraceId);
    await this.options.realtime.setActiveCommandTraceId?.(commandTraceId);
    try {
      const response = await this.handleUserInputInternal(input, startedAt);
      this.finishDiagnostics(response);
      return response;
    } catch (error) {
      this.finishDiagnostics({
        route: this.lastDiagnostics?.route ?? "model",
        result: {
          status: "failed",
          message: error instanceof Error ? error.message : "助手执行失败",
          errorCode: "ASSISTANT_COMMAND_FAILED"
        }
      });
      throw error;
    } finally {
      await this.options.realtime.setActiveCommandTraceId?.(null);
    }
  }

  async handleRealtimeUserInput(input: string, options: AssistantHandleUserInputOptions = {}): Promise<AssistantHarnessResponse> {
    const startedAt = Date.now();
    const commandTraceId = options.commandTraceId ?? createId("trace");
    this.startDiagnostics(input, commandTraceId);
    await this.options.realtime.setActiveCommandTraceId?.(commandTraceId);
    try {
      const response = await this.handleRealtimeModelInput(input, startedAt);
      this.finishDiagnostics(response);
      return response;
    } catch (error) {
      this.finishDiagnostics({
        route: this.lastDiagnostics?.route ?? "model",
        result: {
          status: "failed",
          message: error instanceof Error ? error.message : "助手执行失败",
          errorCode: "ASSISTANT_COMMAND_FAILED"
        }
      });
      throw error;
    } finally {
      await this.options.realtime.setActiveCommandTraceId?.(null);
    }
  }

  private async handleUserInputInternal(input: string, startedAt: number): Promise<AssistantHarnessResponse> {
    if (!this.pendingConfirmation) {
      const learningResponse = await this.handlePendingLearningInput(input, startedAt);
      if (learningResponse) {
        return learningResponse;
      }
    }
    const learnedResponse = await this.handleLearnedShortcut(input, startedAt);
    if (learnedResponse) {
      return learnedResponse;
    }
    const shortcutContext = this.buildShortcutContext();
    const bulkClosePlan = this.buildBulkWindowClosePlan(input, shortcutContext);
    if (bulkClosePlan) {
      return this.handleShortcutPlan(bulkClosePlan, startedAt);
    }
    const segmentedShortcut = this.hasSegmentedShortcutInput(input);
    const shortcutPlan = this.shouldDeferComplexShortcutSegment(input) ? null : this.buildShortcutPlan(input, shortcutContext);
    if (shortcutPlan) {
      const response = await this.handleShortcutPlan(shortcutPlan, startedAt);
      const includesConfirm = shortcutPlan.flat().some((call) => call.name === CONFIRM_TOOL);
      if (includesConfirm && response.result.status === "success" && this.queuedPostConfirmationPlan) {
        return this.continueQueuedPostConfirmationPlan(response, startedAt);
      }
      return response;
    }

    if (!segmentedShortcut) {
      const shortcut = this.options.shortcutRouter.route(input, shortcutContext);
      if (shortcut.matched && this.shouldExecuteLocalShortcut(shortcut.confidence) && !this.shouldDeferComplexShortcutSegment(input)) {
        this.rememberAuditMetadata(shortcut.toolCall, input);
        const response = await this.handleFunctionCall(shortcut.toolCall, "shortcut", startedAt);
        if (shortcut.toolCall.name === CONFIRM_TOOL && response.result.status === "success" && this.queuedShortcutPlanGroups.length) {
          const queued = this.queuedShortcutPlanGroups;
          this.queuedShortcutPlanGroups = [];
          const queuedResponse = await this.handleShortcutPlan(queued, startedAt);
          return {
            route: "shortcut",
            call: response.call,
            result: {
              ...queuedResponse.result,
              message: [response.result.message, queuedResponse.result.message].filter(Boolean).join("；"),
              data: {
                confirmed: response.result,
                queued: queuedResponse.result
              }
            }
          };
        }
        if (shortcut.toolCall.name === CONFIRM_TOOL && response.result.status === "success" && this.queuedPostConfirmationPlan) {
          return this.continueQueuedPostConfirmationPlan(response, startedAt);
        }
        return response;
      }
    }

    const context = this.getCurrentContext();
    return this.handleRealtimeModelInput(input, startedAt, context);
  }

  private async handleRealtimeModelInput(
    input: string,
    startedAt: number,
    context: CompactAssistantContext = this.getCurrentContext()
  ): Promise<AssistantHarnessResponse> {
    const bulkClosePlan = this.buildBulkWindowClosePlan(input, this.buildShortcutContext());
    if (bulkClosePlan) {
      return this.handleShortcutPlan(bulkClosePlan, startedAt);
    }
    this.markRealtimeUsed();
    const modelPlan = await this.options.realtime.requestCommandPlan?.(input, context, this.currentTools, this.options.moduleRegistry);
    if (modelPlan) {
      const modelToolNames = modelPlan.commands.map((command) => command.tool);
      const forbiddenViolations = getForbiddenToolViolations(input, modelToolNames);
      const recovered = await this.recoverLocalShortcutFromModelPlan(
        input,
        modelToolNames,
        startedAt,
        modelToolNames.every(isNonActionModelTool) ? "non_action_model_tools" : forbiddenViolations.length ? "forbidden_model_tools" : null,
        forbiddenViolations
      );
      if (recovered) {
        return recovered;
      }
      if (forbiddenViolations.length) {
        const result: AssistantToolResult = {
          status: "failed",
          message: "Realtime 计划包含被本地策略禁止的工具，已停止执行。",
          errorCode: "REALTIME_PLAN_POLICY_REJECTED",
          data: { violations: forbiddenViolations }
        };
        this.recordPolicyValidationErrors(forbiddenViolations);
        await this.audit({ route: "model", result, durationMs: Date.now() - startedAt });
        return { route: "model", result };
      }
      return this.handleModelCommandPlan(input, modelPlan, startedAt);
    }

    const modelCall = await this.options.realtime.requestToolCall?.(input, context, this.currentTools, this.options.moduleRegistry);
    if (!modelCall) {
      const result: AssistantToolResult = {
        status: "needs_clarification",
        message: "我没听懂，可以再说短一点吗？"
      };
      await this.audit({ route: "model", result, durationMs: Date.now() - startedAt });
      return { route: "model", result };
    }

    const modelCallWithTranscript: AssistantToolCall = {
      ...modelCall,
      transcript: modelCall.transcript ?? input
    };
    const forbiddenViolations = getForbiddenToolViolations(input, [modelCallWithTranscript.name]);
    const recovered = await this.recoverLocalShortcutFromModelPlan(
      input,
      [modelCallWithTranscript.name],
      startedAt,
      isNonActionModelTool(modelCallWithTranscript.name) ? "non_action_model_tools" : forbiddenViolations.length ? "forbidden_model_tools" : null,
      forbiddenViolations
    );
    if (recovered) {
      return recovered;
    }
    if (forbiddenViolations.length) {
      const result: AssistantToolResult = {
        status: "failed",
        message: "Realtime 工具调用被本地策略拦截，已停止执行。",
        errorCode: "REALTIME_TOOL_POLICY_REJECTED",
        data: { violations: forbiddenViolations }
      };
      this.recordPolicyValidationErrors(forbiddenViolations);
      await this.audit({ route: "model", call: modelCallWithTranscript, result, durationMs: Date.now() - startedAt });
      return { route: "model", call: modelCallWithTranscript, result };
    }
    this.rememberAuditMetadata(modelCallWithTranscript, input);
    return this.handleFunctionCall(modelCallWithTranscript, "model", startedAt);
  }

  private async recoverLocalShortcutFromModelPlan(
    input: string,
    modelToolNames: string[],
    startedAt: number,
    reason: AssistantRecoveryReason | null,
    violations: CommandPolicyForbiddenViolation[] = []
  ): Promise<AssistantHarnessResponse | null> {
    if (this.pendingConfirmation || modelToolNames.length === 0 || !reason) {
      return null;
    }
    if (reason === "non_action_model_tools" && isDiagnosticOrPreferenceIntent(input)) {
      return null;
    }
    const shortcut = this.options.shortcutRouter.route(input, this.buildShortcutContext());
    if (!shortcut.matched || !this.shouldExecuteLocalShortcut(shortcut.confidence) || isNonActionModelTool(shortcut.toolCall.name)) {
      return null;
    }
    const recoveredViolations = getForbiddenToolViolations(input, [shortcut.toolCall.name]);
    if (recoveredViolations.length) {
      this.recordPolicyValidationErrors([...violations, ...recoveredViolations]);
      return null;
    }
    if (violations.length) {
      this.recordPolicyValidationErrors(violations);
    }
    if (this.lastDiagnostics) {
      this.lastDiagnostics.recovery = {
        reason,
        modelTools: [...modelToolNames],
        recoveredTool: shortcut.toolCall.name,
        ...(violations.length ? { violations } : {})
      };
    }
    this.rememberAuditMetadata(shortcut.toolCall, input);
    return this.handleFunctionCall(shortcut.toolCall, "shortcut", startedAt);
  }

  private recordPolicyValidationErrors(violations: CommandPolicyForbiddenViolation[]): void {
    if (!this.lastDiagnostics || violations.length === 0) return;
    this.lastDiagnostics.validationErrors = [
      ...(this.lastDiagnostics.validationErrors ?? []),
      ...violations.flatMap((violation) =>
        violation.forbiddenTools.map((tool) => ({
          commandId: violation.ruleId,
          code: "POLICY_FORBIDDEN_TOOL",
          message: `${tool} is forbidden by ${violation.ruleId}`
        }))
      )
    ];
  }

  private async handleModelCommandPlan(input: string, plan: CommandPlan, startedAt: number): Promise<AssistantHarnessResponse> {
    plan.commands.forEach((command) => {
      this.rememberAuditMetadata(
        {
          id: command.id,
          name: command.tool,
          arguments: command.args,
          source: command.source,
          transcript: plan.sourceText || input
        },
        input
      );
    });
    const responses = await this.executeCommandPlan(
      {
        ...plan,
        sourceText: plan.sourceText || input,
        createdBy: plan.createdBy === "local" ? "realtime-2" : plan.createdBy,
        requiresHarnessValidation: true
      },
      "model",
      startedAt
    );
    return this.aggregatePlanResponses("model", responses);
  }

  private hasSegmentedShortcutInput(input: string): boolean {
    const groups = splitShortcutCommandGroups(input);
    return groups.reduce((count, group) => count + group.length, 0) >= 2;
  }

  private buildShortcutPlan(input: string, context: IntentShortcutContext): AssistantToolCall[][] | null {
    if (this.pendingConfirmation) {
      return null;
    }
    const groups = splitShortcutCommandGroups(input);
    const segmentCount = groups.reduce((count, group) => count + group.length, 0);
    if (segmentCount < 2) {
      return null;
    }
    const calls: AssistantToolCall[][] = [];
    let planningContext = context;
    for (const group of groups) {
      const groupCalls: AssistantToolCall[] = [];
      for (const segment of group) {
        const routed = this.options.shortcutRouter.route(segment, planningContext);
        if (!routed.matched || !this.shouldExecuteLocalShortcut(routed.confidence) || this.shouldDeferComplexShortcutSegment(segment)) {
          return null;
        }
        this.rememberAuditMetadata(routed.toolCall, segment);
        groupCalls.push(routed.toolCall);
      }
      calls.push(groupCalls);
      for (const call of groupCalls) {
        planningContext = this.updatePlanningContextAfterPlannedCall(planningContext, call);
      }
    }
    return calls;
  }

  private buildBulkWindowClosePlan(input: string, context: IntentShortcutContext): AssistantToolCall[][] | null {
    if (this.pendingConfirmation || !isSimpleBulkCloseWindowCommand(input)) {
      return null;
    }
    return this.createBulkWindowClosePlan(input, context);
  }

  private createBulkWindowClosePlan(input: string, context: IntentShortcutContext): AssistantToolCall[][] | null {
    const widgets = [...(context.availableWidgets ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!widgets.length) {
      return null;
    }
    return [
      widgets.map((widget) => ({
        id: createId("bulk_close"),
        name: "widget.remove",
        arguments: { widgetId: widget.widgetId },
        source: "shortcut",
        transcript: input
      }))
    ];
  }

  private shouldExecuteLocalShortcut(confidence: number): boolean {
    return confidence >= LOCAL_SHORTCUT_CONFIDENCE_THRESHOLD;
  }

  private shouldDeferComplexShortcutSegment(input: string): boolean {
    const deferral = classifyShortcutDeferral(input);
    if (deferral.defer && this.lastDiagnostics) {
      this.lastDiagnostics.shortcutDeferral = {
        ruleId: deferral.rule.id,
        category: deferral.rule.category,
        reason: deferral.rule.reason
      };
    }
    return deferral.defer;
  }

  private async handleShortcutPlan(groups: AssistantToolCall[][], startedAt: number): Promise<AssistantHarnessResponse> {
    const responses: AssistantHarnessResponse[] = [];
    let lastAddedWidget: AddedWidgetData | null = null;
    this.recordPlanDiagnostics(
      this.shortcutPlanAdapter.createPlan(
        groups.flat().map((call) => call.transcript ?? call.name).join("，"),
        groups
      ),
      "shortcut"
    );
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]!;
      const executableGroup: AssistantToolCall[] = lastAddedWidget
        ? group.map((call) => this.rewriteAfterWidgetAdd(call, lastAddedWidget as AddedWidgetData))
        : group;
      const groupPlan = this.shortcutPlanAdapter.createPlan(
        executableGroup.map((call) => call.transcript ?? call.name).join("，"),
        [executableGroup]
      );
      const groupResponses = await this.executeCommandPlan(groupPlan, "shortcut", startedAt);
      responses.push(...groupResponses);
      const needsConfirmation = groupResponses.some((response) => response.result.status === "needs_confirmation");
      const cancelled = groupResponses.some((response) => response.result.status === "cancelled");
      if (needsConfirmation) {
        this.queuedShortcutPlanGroups = groups.slice(groupIndex + 1);
        break;
      }
      if (cancelled) {
        break;
      }
      lastAddedWidget = groupResponses.map((response) => extractAddedWidgetData(response.result)).find(Boolean) ?? lastAddedWidget;
    }

    const blocking = responses.find((response) => response.result.status !== "success");
    const status = blocking?.result.status ?? "success";
    const message = responses.map((response) => response.result.message).filter(Boolean).join("；");
    return {
      route: "shortcut",
      call: responses[0]?.call,
      result: {
        status,
        message,
        data: { commands: responses.map((response) => ({ name: response.call?.name, result: response.result })) },
        ...(blocking?.result.confirmation ? { confirmation: blocking.result.confirmation } : {}),
        ...(blocking?.result.errorCode ? { errorCode: blocking.result.errorCode } : {})
      }
    };
  }

  private aggregatePlanResponses(route: AssistantRoute, responses: AssistantHarnessResponse[]): AssistantHarnessResponse {
    const blocking = responses.find((response) => response.result.status !== "success");
    const status = blocking?.result.status ?? "success";
    return {
      route,
      call: responses[0]?.call,
      result: {
        status,
        message: responses.map((response) => response.result.message).filter(Boolean).join("；"),
        data: { commands: responses.map((response) => ({ name: response.call?.name, result: response.result })) },
        ...(blocking?.result.confirmation ? { confirmation: blocking.result.confirmation } : {}),
        ...(blocking?.result.errorCode ? { errorCode: blocking.result.errorCode } : {})
      }
    };
  }

  private rewriteAfterWidgetAdd(call: AssistantToolCall, addedWidget: AddedWidgetData): AssistantToolCall {
    const spec = this.options.registry.get(call.name);
    if (WIDGET_WINDOW_TOOLS.has(call.name) && isRecord(call.arguments)) {
      const widgetId = typeof call.arguments.widgetId === "string" ? call.arguments.widgetId : "";
      if (isPlannedWidgetId(widgetId) && plannedWidgetType(widgetId) === addedWidget.widgetType) {
        this.rememberTransientWidget(addedWidget);
        return {
          ...call,
          arguments: { ...call.arguments, widgetId: addedWidget.widgetId }
        };
      }
    }
    if (spec?.scope === "widget-detail" && spec.widgetType === addedWidget.widgetType && isRecord(call.arguments)) {
      const widgetId = typeof call.arguments.widgetId === "string" ? call.arguments.widgetId : "";
      if (!widgetId || isPlannedWidgetId(widgetId)) {
        this.rememberTransientWidget(addedWidget);
        return {
          ...call,
          arguments: { ...call.arguments, widgetId: addedWidget.widgetId }
        };
      }
    }
    if (call.name !== ADD_WIDGET_TOOL || !isRecord(call.arguments)) {
      return call;
    }
    const definitionId = typeof call.arguments.definitionId === "string" ? call.arguments.definitionId : "";
    const followUp = isRecord(call.arguments.followUp) ? call.arguments.followUp : null;
    if (definitionId !== addedWidget.definitionId || !followUp || typeof followUp.name !== "string") {
      return call;
    }
    const followUpSpec = this.options.registry.get(followUp.name);
    if (!followUpSpec || followUpSpec.scope !== "widget-detail" || (followUpSpec.widgetType && followUpSpec.widgetType !== addedWidget.widgetType)) {
      return call;
    }
    this.rememberTransientWidget(addedWidget);
    const followUpArgs = isRecord(followUp.arguments) ? followUp.arguments : {};
    return {
      ...call,
      id: `${call.id}_after_add`,
      name: followUp.name,
      arguments: { ...followUpArgs, widgetId: addedWidget.widgetId }
    };
  }

  private updatePlanningContextAfterPlannedCall(context: IntentShortcutContext, call: AssistantToolCall): IntentShortcutContext {
    if (!isRecord(call.arguments)) {
      return context;
    }
    if (call.name === ADD_WIDGET_TOOL && typeof call.arguments.definitionId === "string") {
      const definitionId = call.arguments.definitionId;
      const definition = context.availableDefinitions?.find((item) => item.definitionId === definitionId);
      if (!definition) {
        return context;
      }
      return this.withPlannedFocusedWidget(context, {
        widgetId: `${PLANNED_WIDGET_PREFIX}${definition.type}`,
        definitionId: definition.definitionId,
        type: definition.type,
        name: definition.name,
        order: -1,
        summary: "",
        recent: true,
        focused: true
      });
    }
    if (call.name === FOCUS_WIDGET_TOOL && typeof call.arguments.widgetId === "string") {
      const widgetId = call.arguments.widgetId;
      const widget = context.availableWidgets?.find((item) => item.widgetId === widgetId);
      return widget ? this.withPlannedFocusedWidget(context, widget) : context;
    }
    return context;
  }

  private withPlannedFocusedWidget(context: IntentShortcutContext, widget: CompactWidgetSummary): IntentShortcutContext {
    const nextWidget = { ...widget, recent: true, focused: true };
    const widgets = [
      nextWidget,
      ...(context.availableWidgets ?? [])
        .filter((item) => item.widgetId !== widget.widgetId)
        .map((item) => ({ ...item, focused: false }))
    ];
    return {
      ...context,
      availableWidgets: widgets,
      focusedWidget: nextWidget
    };
  }

  async handleFunctionCall(
    call: AssistantToolCall,
    route: AssistantRoute = "function_call",
    startedAt = Date.now()
  ): Promise<AssistantHarnessResponse> {
    if (call.name === "widget.remove" && !this.pendingConfirmation) {
      const targetText = getTargetText(call.arguments);
      const transcript = call.transcript ?? "";
      if (isSimpleBulkCloseWindowCommand(transcript) || isBulkWindowTargetText(targetText)) {
        const bulkPlan = this.createBulkWindowClosePlan(transcript || `关闭${targetText}`, this.buildShortcutContext());
        if (bulkPlan) {
          return this.handleShortcutPlan(bulkPlan, startedAt);
        }
      }
    }

    if (call.name === CONFIRM_TOOL || call.name === CANCEL_TOOL) {
      this.emitOperation({ id: call.id, phase: "running", route, toolName: call.name });
      const result = await this.executeCall(call);
      this.emitOperation({
        id: call.id,
        phase: result.status === "success" ? "success" : result.status === "cancelled" ? "cancelled" : "failed",
        route,
        toolName: call.name,
        message: result.message
      });
      await this.options.realtime.sendToolResult(call, result);
      await this.updateRealtimeContext();
      await this.audit({ route, call, result, durationMs: Date.now() - startedAt });
      this.recordDiagnosticsToolResult(call, result);
      return { route, call, result };
    }

    const plan = createCommandPlanFromToolCalls(call.transcript ?? call.name, [call]);
    const responses = await this.executeCommandPlan(plan, route, startedAt);
    return responses[0] ?? {
      route,
      call,
      result: { status: "failed", message: "命令计划为空", errorCode: "PLAN_EMPTY" }
    };
  }

  private getLearningConfirmation(): ConfirmationRequest | null {
    const candidate = this.pendingLearningCandidate;
    if (!candidate) return null;
    return {
      id: candidate.id,
      actionName: "assistant.learn",
      arguments: { candidateId: candidate.id },
      message: `要记住“${candidate.rawText}”下次直接执行 ${candidate.tool} 吗？`,
      createdAt: candidate.createdAt,
      preview: {
        commands: [
          {
            module: candidate.module,
            tool: candidate.tool,
            impact: "确认后相同说法将优先本地命中",
            reversible: true
          }
        ],
        recovery: "可在本地学习规则中拒绝或覆盖"
      }
    };
  }

  private async handlePendingLearningInput(input: string, startedAt: number): Promise<AssistantHarnessResponse | null> {
    const candidate = this.pendingLearningCandidate;
    if (!candidate) return null;
    const normalized = normalizeText(input);
    const isConfirm = /^(确认|确定|可以|记住|学习)$/.test(normalized);
    const isCancel = /^(取消|不用|不要|拒绝)$/.test(normalized);
    if (!isConfirm && !isCancel) return null;

    this.pendingLearningCandidate = null;
    const ok = isConfirm
      ? await this.options.learnedCommandStore?.confirm(candidate.id)
      : await this.options.learnedCommandStore?.reject(candidate.id);
    const result: AssistantToolResult = {
      status: isConfirm && ok ? "success" : "cancelled",
      message: isConfirm && ok ? "已记住这个说法" : "已取消学习",
      data: { candidateId: candidate.id, learned: isConfirm && ok }
    };
    const call: AssistantToolCall = {
      id: isConfirm ? `learn_confirm_${candidate.id}` : `learn_reject_${candidate.id}`,
      name: isConfirm ? "assistant.learn.confirm" : "assistant.learn.reject",
      arguments: { candidateId: candidate.id },
      source: "learned",
      transcript: input
    };
    await this.options.realtime.sendToolResult(call, result);
    await this.audit({ route: "learned", call, result, durationMs: Date.now() - startedAt, learningCandidate: false });
    return { route: "learned", call, result };
  }

  private async handleLearnedShortcut(input: string, startedAt: number): Promise<AssistantHarnessResponse | null> {
    const store = this.options.learnedCommandStore;
    if (!store || this.pendingConfirmation) return null;
    const matched = await store.match(normalizeText(input));
    if (!matched) return null;
    const call: AssistantToolCall = {
      id: createId("learned"),
      name: matched.tool,
      arguments: matched.args,
      source: "learned",
      transcript: input
    };
    this.rememberAuditMetadata(call, input);
    const plan = createCommandPlanFromToolCalls(input, [call]);
    plan.createdBy = "learned";
    const responses = await this.executeCommandPlan(plan, "learned", startedAt);
    return responses[0] ?? { route: "learned", call, result: { status: "failed", message: "学习规则没有生成命令", errorCode: "LEARNED_PLAN_EMPTY" } };
  }

  private async executeCommandPlan(
    plan: CommandPlan,
    route: AssistantRoute,
    startedAt: number
  ): Promise<AssistantHarnessResponse[]> {
    const executablePlan = this.repairRealtimePlanBeforeExecution(plan, route);
    const validation = this.planValidator.validate(executablePlan);
    this.recordPlanDiagnostics(validation.plan, route, validation.errors);
    if (!validation.ok) {
      const firstCommand = plan.commands[0];
      const call: AssistantToolCall = {
        id: firstCommand?.id ?? createId("invalid_call"),
        name: firstCommand?.tool ?? "unknown",
        arguments: firstCommand?.args ?? {},
        source: firstCommand?.source ?? "test",
        transcript: plan.sourceText
      };
      const result: AssistantToolResult = {
        status: "failed",
        message: validation.errors.map((error) => error.message).join("；") || "命令计划校验失败",
        errorCode: validation.errors[0]?.code ?? "PLAN_VALIDATION_FAILED"
      };
      this.emitOperation({ id: call.id, phase: "failed", route, toolName: call.name, message: result.message });
      await this.options.realtime.sendToolResult(call, result);
      await this.audit({ route, call, result, durationMs: Date.now() - startedAt });
      this.recordDiagnosticsToolResult(call, result);
      return [{ route, call, result }];
    }

    const responses: AssistantHarnessResponse[] = [];
    const executor = new CommandExecutor({
      execute: (call, command) => this.executeCall(call, command.risk),
      getConcurrencyKey: (command) => this.options.registry.get(command.tool)?.concurrencyKey,
      transformCommand: (command, completed) => this.rewriteCommandFromCompletedAdds(command, completed),
      onEvent: (event) => {
        this.emitOperation({
          id: event.operationId,
          phase:
            event.phase === "waiting_confirmation"
              ? "waiting_confirmation"
              : event.phase === "success"
                ? "success"
                : event.phase === "cancelled"
                  ? "cancelled"
                  : event.phase === "skipped"
                    ? "skipped"
                    : event.phase === "running"
                      ? "running"
                      : "failed",
          route,
          toolName: event.tool,
          message: event.message
        });
      }
    });
    const execution = await executor.execute(validation.plan);
    this.queueRemainingPlanAfterConfirmation(validation.plan, route, execution.records);
    for (const record of execution.records) {
      const call: AssistantToolCall = {
        id: record.command.id,
        name: record.command.tool,
        arguments: record.command.args,
        source: record.command.source,
        transcript: plan.sourceText
      };
      await this.options.realtime.sendToolResult(call, record.result);
      const learningCandidate = await this.recordLearningCandidate(validation.plan, call, record.result, route);
      await this.audit({ route, call, result: record.result, durationMs: Date.now() - startedAt, learningCandidate });
      this.recordDiagnosticsToolResult(call, record.result, learningCandidate);
      responses.push({ route, call, result: record.result });
    }
    await this.updateRealtimeContext();
    return responses;
  }

  private repairRealtimePlanBeforeExecution(plan: CommandPlan, route: AssistantRoute): CommandPlan {
    if (route !== "model") return plan;
    if (!/(?:误触|退出|取消|离开|关闭).{0,12}(?:全屏|沉浸)|(?:恢复|回到).{0,8}普通窗口/.test(plan.sourceText)) {
      return plan;
    }
    const hasWindowFollowUp = plan.commands.some((command) => WIDGET_WINDOW_TOOLS.has(command.tool));
    const hasFullscreenExit = plan.commands.some((command) => command.tool === APP_FULLSCREEN_TOOL);
    if (!hasWindowFollowUp || hasFullscreenExit) return plan;
    const exitCommand: CommandPlanStep = {
      id: createId("policy_fullscreen_exit"),
      module: "app-shell",
      tool: APP_FULLSCREEN_TOOL,
      args: { enabled: false, mode: "exit" },
      risk: "safe",
      confidence: 0.95,
      source: "realtime",
      requiresHarnessValidation: true
    };
    const firstGroup = plan.executionGroups[0];
    return {
      ...plan,
      commands: [exitCommand, ...plan.commands],
      executionGroups: firstGroup
        ? [
            { ...firstGroup, mode: "sequential", commandIds: [exitCommand.id, ...firstGroup.commandIds] },
            ...plan.executionGroups.slice(1)
          ]
        : [{ id: "group_1", mode: "sequential", commandIds: [exitCommand.id, ...plan.commands.map((command) => command.id)] }]
    };
  }

  private rewriteCommandFromCompletedAdds(
    command: CommandPlanStep,
    completed: Map<string, AssistantToolResult>
  ): CommandPlanStep {
    const call: AssistantToolCall = {
      id: command.id,
      name: command.tool,
      arguments: command.args,
      source: command.source,
      transcript: command.id
    };
    const addedWidgets = [...completed.values()].map((result) => extractAddedWidgetData(result)).filter(Boolean) as AddedWidgetData[];
    for (const addedWidget of addedWidgets.reverse()) {
      const rewritten = this.rewriteAfterWidgetAdd(call, addedWidget);
      if (rewritten !== call) {
        return {
          ...command,
          args: isRecord(rewritten.arguments) ? rewritten.arguments : command.args
        };
      }
    }
    return command;
  }

  private queueRemainingPlanAfterConfirmation(
    plan: CommandPlan,
    route: AssistantRoute,
    records: Array<{ command: CommandPlan["commands"][number]; result: AssistantToolResult }>
  ): void {
    const blocking = records.find((record) => record.result.status === "needs_confirmation");
    if (!blocking) return;
    const groupIndex = plan.executionGroups.findIndex((group) => group.commandIds.includes(blocking.command.id));
    if (groupIndex < 0) return;
    const blockingGroup = plan.executionGroups[groupIndex];
    const blockingCommandIndex = blockingGroup.commandIds.indexOf(blocking.command.id);
    const completedIds = new Set(records.map((record) => record.command.id));
    const remainingCurrentGroupIds =
      blockingGroup.mode === "parallel"
        ? blockingGroup.commandIds.filter((id) => !completedIds.has(id))
        : blockingGroup.commandIds.slice(Math.max(0, blockingCommandIndex + 1));
    const remainingGroups = [
      ...(remainingCurrentGroupIds.length
        ? [
            {
              ...blockingGroup,
              id: `${blockingGroup.id ?? `${plan.id}_group_${groupIndex}`}_after_confirm`,
              commandIds: remainingCurrentGroupIds
            }
          ]
        : []),
      ...plan.executionGroups.slice(groupIndex + 1)
    ];
    const remainingIds = new Set(remainingGroups.flatMap((group) => group.commandIds));
    const remainingCommands = plan.commands
      .filter((command) => remainingIds.has(command.id))
      .map((command) => ({
        ...command,
        dependsOn: command.dependsOn?.filter((id) => remainingIds.has(id))
      }));
    if (!remainingCommands.length) return;
    this.queuedPostConfirmationPlan = {
      route,
      plan: {
        ...plan,
        id: `${plan.id}_after_confirm`,
        commands: remainingCommands,
        executionGroups: remainingGroups,
        dependencies: plan.dependencies.filter((dependency) => remainingIds.has(dependency.from) && remainingIds.has(dependency.to))
      }
    };
  }

  private async continueQueuedPostConfirmationPlan(
    confirmationResponse: AssistantHarnessResponse,
    startedAt: number
  ): Promise<AssistantHarnessResponse> {
    const queued = this.queuedPostConfirmationPlan;
    this.queuedPostConfirmationPlan = null;
    if (!queued) return confirmationResponse;
    const queuedResponses = await this.executeCommandPlan(queued.plan, queued.route, startedAt);
    const queuedResponse = this.aggregatePlanResponses(queued.route, queuedResponses);
    return {
      route: confirmationResponse.route,
      call: confirmationResponse.call,
      result: {
        ...queuedResponse.result,
        message: [confirmationResponse.result.message, queuedResponse.result.message].filter(Boolean).join("；"),
        data: {
          confirmed: confirmationResponse.result,
          queued: queuedResponse.result
        },
        ...(queuedResponse.result.confirmation ? { confirmation: queuedResponse.result.confirmation } : {}),
        ...(queuedResponse.result.errorCode ? { errorCode: queuedResponse.result.errorCode } : {})
      }
    };
  }

  private validateCallPlan(call: AssistantToolCall): { ok: true; call: AssistantToolCall } | { ok: false; errors: Array<{ code: string; message: string }> } {
    if (call.name === CONFIRM_TOOL || call.name === CANCEL_TOOL) {
      return { ok: true, call };
    }
    const plan = createCommandPlanFromToolCalls(call.transcript ?? call.name, [call]);
    const validation = this.planValidator.validate(plan);
    if (!validation.ok) {
      return { ok: false, errors: validation.errors };
    }
    const next = validation.plan.commands[0];
    return next
      ? { ok: true, call: { ...call, name: next.tool, arguments: next.args } }
      : { ok: false, errors: [{ code: "PLAN_EMPTY", message: "命令计划为空" }] };
  }

  private buildShortcutContext(): IntentShortcutContext {
    const input = this.options.getContextInput();
    const context = this.getCurrentContext();
    const fullWidgets =
      input.widgets?.map((widget) => ({
        widgetId: widget.widgetId,
        definitionId: widget.definitionId,
        type: widget.type,
        name: widget.name,
        order: widget.order,
        summary: context.widgets.find((item) => item.widgetId === widget.widgetId)?.summary ?? "",
        recent: input.recentWidgetIds?.includes(widget.widgetId),
        focused: widget.widgetId === input.focusedWidgetId
      })) ?? context.widgets;
    return {
      source: "shortcut",
      currentTime: this.options.now?.() ?? new Date().toISOString(),
      pendingConfirmation: this.pendingConfirmation ?? undefined,
      boardId: context.boardId,
      boardName: context.boardName,
      availableBoards: context.availableBoards,
      availableWidgets: fullWidgets,
      availableDefinitions: input.availableDefinitions ?? context.widgets.map((widget) => ({
        definitionId: widget.definitionId,
        type: widget.type,
        name: widget.name
      })),
      focusedWidget: fullWidgets.find((widget) => widget.widgetId === input.focusedWidgetId) ?? context.focusedWidget
    };
  }

  private resolveEffectiveRisk(specRisk: AssistantToolSpec["risk"], riskOverride?: AssistantRisk): AssistantRisk {
    const registeredRisk = specRisk ?? "safe";
    if (!riskOverride) return registeredRisk;
    return riskRank[riskOverride] > riskRank[registeredRisk] ? riskOverride : registeredRisk;
  }

  private async executeCall(call: AssistantToolCall, riskOverride?: AssistantRisk): Promise<AssistantToolResult> {
    if (call.name === CONFIRM_TOOL) {
      return this.confirmPending(call);
    }
    if (call.name === CANCEL_TOOL) {
      return this.cancelPending();
    }

    const spec = this.options.registry.get(call.name);
    if (!spec) {
      return { status: "failed", message: `未知工具：${call.name}`, errorCode: "UNKNOWN_TOOL" };
    }

    const target = this.resolveTargetIfNeeded(call, spec);
    if (target.status !== "ready") {
      return target.result;
    }

    const effectiveRisk = this.resolveEffectiveRisk(spec.risk, riskOverride);
    if ((effectiveRisk === "confirm" || effectiveRisk === "destructive") && !this.pendingConfirmation) {
      const confirmationPlan = createCommandPlanFromToolCalls(call.transcript ?? call.name, [call]);
      const command = confirmationPlan.commands[0];
      if (command) {
        command.module = this.options.moduleRegistry?.findModuleForTool(call.name)?.type ?? command.module;
        command.risk = effectiveRisk;
      }
      const preview = createPlanPreview(confirmationPlan, { moduleRegistry: this.options.moduleRegistry });
      const confirmation: ConfirmationRequest = {
        id: createId("confirm"),
        actionName: call.name,
        arguments: call.arguments,
        target: target.target,
        message: `确认执行 ${call.name} 吗？`,
        createdAt: this.options.now?.() ?? new Date().toISOString(),
        preview
      };
      this.pendingConfirmation = confirmation;
      return {
        status: "needs_confirmation",
        message: confirmation.message,
        confirmation,
        data: { preview }
      };
    }

    const result = await this.executeRegistryCall(call, target.target);
    const addedWidget = call.name === ADD_WIDGET_TOOL ? extractAddedWidgetData(result) : null;
    if (addedWidget) {
      this.rememberTransientWidget(addedWidget);
    }
    const followUpResult = await this.executeSafeFollowUp(call, result, target.target);
    if (followUpResult) {
      return followUpResult;
    }
    await this.syncWidgetDetailToolsAfterSuccess(call, spec, target.target, result);
    return result;
  }

  private resolveTargetIfNeeded(
    call: AssistantToolCall,
    spec: AssistantToolSpec
  ): { status: "ready"; target?: ResolvedWidgetTarget } | { status: "blocked"; result: AssistantToolResult } {
    if (!spec.requiresTarget) {
      return { status: "ready" };
    }

    const targetText = getTargetText(call.arguments);
    if (isRecord(call.arguments) && typeof call.arguments.widgetId === "string") {
      const widgetId = call.arguments.widgetId;
      const context = this.getCurrentContext();
      const input = this.options.getContextInput();
      const transientTarget = this.transientWidgetTargets.get(widgetId);
      if (transientTarget) {
        return { status: "ready", target: transientTarget };
      }
      const widget =
        context.widgets.find((item) => item.widgetId === widgetId) ??
        input.widgets?.find((item) => item.widgetId === widgetId);
      return widget
        ? {
            status: "ready",
            target: {
              widgetId: widget.widgetId,
              definitionId: widget.definitionId,
              type: widget.type,
              name: widget.name,
              confidence: 1,
              reason: "matched_by_id"
            }
          }
        : { status: "blocked", result: { status: "failed", message: "没有找到这个小工具", errorCode: "WIDGET_NOT_FOUND" } };
    }

    const resolution = this.options.targetResolver.resolve(targetText, {
      widgets: this.getCurrentContext().widgets,
      focusedWidget: this.getCurrentContext().focusedWidget
    });
    if (resolution.status === "resolved") {
      return { status: "ready", target: resolution.target };
    }
    if (resolution.status === "needs_clarification") {
      return {
        status: "blocked",
        result: {
          status: "needs_clarification",
          message: resolution.message,
          data: { candidates: resolution.candidates }
        }
      };
    }
    return {
      status: "blocked",
      result: { status: "failed", message: resolution.message, errorCode: "TARGET_NOT_FOUND" }
    };
  }

  private async confirmPending(call: AssistantToolCall): Promise<AssistantToolResult> {
    if (!this.pendingConfirmation) {
      return { status: "cancelled", message: "没有待确认的操作" };
    }
    const pending = this.pendingConfirmation;
    this.pendingConfirmation = null;
    const nextCall: AssistantToolCall = {
      ...call,
      id: pending.id,
      name: pending.actionName,
      arguments: createTargetBoundArguments(pending.arguments, pending.target)
    };
    return this.executeRegistryCall(nextCall, pending.target);
  }

  private cancelPending(): AssistantToolResult {
    if (!this.pendingConfirmation) {
      return { status: "cancelled", message: "没有待取消的操作" };
    }
    this.pendingConfirmation = null;
    this.queuedShortcutPlanGroups = [];
    return { status: "cancelled", message: "已取消" };
  }

  private async executeRegistryCall(call: AssistantToolCall, target?: ResolvedWidgetTarget): Promise<AssistantToolResult> {
    const controller = new AbortController();
    const context: Partial<AssistantActionContext> = {
      now: this.options.now,
      operationId: call.id,
      target,
      signal: controller.signal
    };
    const task = this.options.registry.execute({ ...call, arguments: createTargetBoundArguments(call.arguments, target) }, context);
    const result = await withTimeout(task, this.options.actionTimeoutMs ?? 10_000);
    if (result === "timed_out") {
      controller.abort();
      return { status: "timed_out", message: "工具执行超时", errorCode: "ACTION_TIMEOUT" };
    }
    return result;
  }

  private async syncWidgetDetailToolsAfterSuccess(
    call: AssistantToolCall,
    spec: AssistantToolSpec,
    target: ResolvedWidgetTarget | undefined,
    result: AssistantToolResult
  ): Promise<void> {
    if (result.status !== "success" || call.name === "widget.remove") {
      return;
    }

    const widgetType = spec.widgetType ?? target?.type ?? this.getWidgetTypeFromCallArguments(call.arguments);
    if (!widgetType) {
      return;
    }

    const nextTools = this.options.toolScopeManager.getActiveTools();
    if (this.sameToolList(nextTools, this.currentTools)) {
      return;
    }
    this.currentTools = nextTools;
    await this.options.realtime.updateTools(this.currentTools);
  }

  private async executeSafeFollowUp(
    call: AssistantToolCall,
    result: AssistantToolResult,
    target: ResolvedWidgetTarget | undefined
  ): Promise<AssistantToolResult | null> {
    if (result.status !== "success" || !isRecord(call.arguments)) {
      return null;
    }

    const followUp = isRecord(call.arguments.followUp) ? call.arguments.followUp : null;
    if (!followUp || typeof followUp.name !== "string") {
      return null;
    }

    const spec = this.options.registry.get(followUp.name);
    if (!spec || spec.scope !== "widget-detail" || spec.risk === "confirm" || spec.risk === "destructive") {
      return null;
    }

    const data = isRecord(result.data) ? result.data : null;
    const widgetId = call.name === ADD_WIDGET_TOOL && typeof data?.widgetId === "string" ? data.widgetId : target?.widgetId ?? "";
    const widgetType = call.name === ADD_WIDGET_TOOL && typeof data?.widgetType === "string" ? data.widgetType : target?.type ?? "";
    if (!widgetId || (spec.widgetType && spec.widgetType !== widgetType)) {
      return null;
    }
    if (call.name === ADD_WIDGET_TOOL && typeof data?.definitionId === "string") {
      this.rememberTransientWidget({ definitionId: data.definitionId, widgetId, widgetType });
    }

    const followUpArgs = isRecord(followUp.arguments) ? followUp.arguments : {};
    const followUpCall: AssistantToolCall = {
      id: `${call.id}_followup`,
      name: followUp.name,
      arguments: { ...followUpArgs, widgetId },
      source: call.source,
      transcript: call.transcript
    };
    const followUpResult = await this.executeCall(followUpCall);
    this.recordDiagnosticsToolResult(followUpCall, followUpResult);
    return {
      ...followUpResult,
      message:
        followUpResult.status === "success"
          ? `${result.message}，${followUpResult.message}`
          : followUpResult.message,
      data: {
        addWidget: result.data,
        followUp: followUpResult.data
      }
    };
  }

  private getWidgetTypeFromCallArguments(args: unknown): string | undefined {
    if (!isRecord(args) || typeof args.widgetId !== "string") {
      return undefined;
    }
    return this.transientWidgetTargets.get(args.widgetId)?.type ?? this.getCurrentContext().widgets.find((widget) => widget.widgetId === args.widgetId)?.type;
  }

  private rememberTransientWidget(widget: AddedWidgetData): void {
    const target = {
      widgetId: widget.widgetId,
      definitionId: widget.definitionId,
      type: widget.widgetType,
      name: widget.widgetType,
      confidence: 1,
      reason: "added_in_current_plan"
    } as const;
    this.transientWidgetTargets.set(widget.widgetId, target);
    this.transientWidgetTargets.set(`${PLANNED_WIDGET_PREFIX}${widget.widgetType}`, target);
  }

  private sameToolList(left: AssistantToolSpec[], right: AssistantToolSpec[]): boolean {
    return left.length === right.length && left.every((tool, index) => tool.name === right[index]?.name);
  }

  private async syncRealtimeToolsToCurrentContext(): Promise<void> {
    const nextTools = this.options.toolScopeManager.getActiveTools();
    if (this.sameToolList(nextTools, this.currentTools)) {
      return;
    }
    this.currentTools = nextTools;
    await this.options.realtime.updateTools(this.currentTools);
  }

  private async updateRealtimeContext(): Promise<void> {
    await this.options.realtime.updateContext?.(this.getCurrentContext());
  }

  private async recordLearningCandidate(
    plan: CommandPlan,
    call: AssistantToolCall,
    result: AssistantToolResult,
    route: AssistantRoute
  ): Promise<boolean> {
    void plan;
    void call;
    void result;
    void route;
    if (!AUTO_LEARNING_ENABLED) {
      return false;
    }
    return false;
  }

  private async audit(event: AssistantAuditEvent): Promise<void> {
    const metadata = event.call ? this.auditMetadataByCallId.get(event.call.id) : undefined;
    if (event.call) {
      this.auditMetadataByCallId.delete(event.call.id);
    }
    await this.options.audit?.write({
      ...metadata,
      operationId: event.operationId ?? event.call?.id,
      ...event,
      learningCandidate:
        event.learningCandidate ??
        (event.route === "model" || event.route === "function_call" ? event.result.status === "success" : false)
    });
  }

  private emitOperation(event: AssistantOperationEvent): void {
    this.options.onOperation?.({
      ...event,
      commandTraceId: event.commandTraceId ?? this.lastDiagnostics?.commandTraceId
    });
  }

  private startDiagnostics(input: string, commandTraceId: string): void {
    const candidateResult = this.options.moduleRegistry
      ? scoreCandidates(input, this.options.moduleRegistry.list(), this.buildShortcutContext())
      : { normalizedText: normalizeText(input), candidates: [] };
    this.lastDiagnostics = {
      commandTraceId,
      rawInput: input,
      normalizedText: candidateResult.normalizedText,
      usedRealtime: false,
      segments: segmentCommandText(input),
      candidateModules: candidateResult.candidates.slice(0, 5),
      toolResults: []
    };
  }

  private markRealtimeUsed(): void {
    if (this.lastDiagnostics) {
      this.lastDiagnostics.usedRealtime = true;
      this.lastDiagnostics.route = "model";
    }
  }

  private recordPlanDiagnostics(
    plan: CommandPlan,
    route: AssistantRoute,
    validationErrors: Array<{ commandId: string; code: string; message: string }> = []
  ): void {
    if (!this.lastDiagnostics) return;
    this.lastDiagnostics.route = route;
    const currentCommandCount = this.lastDiagnostics.commandPlan?.commands.length ?? 0;
    const nextCommandCount = plan.commands.length;
    if (nextCommandCount >= currentCommandCount) {
      this.lastDiagnostics.commandPlan = {
        id: plan.id,
        createdBy: plan.createdBy,
        commands: plan.commands.map((command) => ({
          id: command.id,
          module: command.module,
          tool: command.tool,
          risk: command.risk,
          source: command.source,
          dependsOn: command.dependsOn,
          argKeys: Object.keys(command.args).sort()
        })),
        executionGroups: plan.executionGroups.map((group) => ({
          id: group.id,
          mode: group.mode,
          commandIds: [...group.commandIds]
        }))
      };
    }
    if (validationErrors.length > 0) {
      this.lastDiagnostics.validationErrors = validationErrors.map((error) => ({ ...error }));
    }
  }

  private recordDiagnosticsToolResult(call: AssistantToolCall, result: AssistantToolResult, learningCandidate = false): void {
    if (!this.lastDiagnostics) return;
    const existingIndex = this.lastDiagnostics.toolResults.findIndex((item) => item.id === call.id);
    const item = {
      id: call.id,
      tool: call.name,
      status: result.status,
      message: result.message,
      errorCode: result.errorCode
    };
    if (existingIndex >= 0) {
      this.lastDiagnostics.toolResults[existingIndex] = item;
    } else {
      this.lastDiagnostics.toolResults.push(item);
    }
    this.lastDiagnostics.learningCandidate = Boolean(this.lastDiagnostics.learningCandidate || learningCandidate);
  }

  private finishDiagnostics(response: AssistantHarnessResponse): void {
    if (!this.lastDiagnostics) return;
    this.lastDiagnostics.route = response.route;
    this.lastDiagnostics.status = response.result.status;
    this.lastDiagnostics.message = response.result.message;
    this.lastDiagnostics.pendingConfirmation = response.result.status === "needs_confirmation" || Boolean(response.result.confirmation);
  }

  private rememberAuditMetadata(call: AssistantToolCall, input: string): void {
    const candidateResult = this.options.moduleRegistry
      ? scoreCandidates(input, this.options.moduleRegistry.list(), this.buildShortcutContext())
      : { normalizedText: normalizeText(input), candidates: [] };
    const module = this.options.moduleRegistry?.findModuleForTool(call.name);
    this.auditMetadataByCallId.set(call.id, {
      normalized: candidateResult.normalizedText,
      candidateModules: candidateResult.candidates.slice(0, 5),
      selectedModule: module?.type,
      selectedToolHint: call.name,
      selectionConfidence: candidateResult.candidates[0]?.score
    });
  }
}
