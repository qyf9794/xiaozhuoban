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
  scoreCandidates,
  normalizeText,
  type AssistantActionContext,
  type AssistantToolCall,
  type AssistantToolResult,
  type AssistantToolSpec,
  type CommandPlan,
  type CompactWidgetSummary,
  type CompactAssistantContext,
  type ConfirmationRequest,
  type ContextSummarizerInput,
  type IntentShortcutContext,
  type ResolvedWidgetTarget
} from "@xiaozhuoban/assistant-core";

export type AssistantRoute = "shortcut" | "model" | "function_call";

export interface AssistantRealtimeAdapter {
  updateTools: (tools: AssistantToolSpec[]) => Promise<void> | void;
  updateContext?: (context: CompactAssistantContext) => Promise<void> | void;
  updateModules?: (registry: WidgetAssistantRegistry) => Promise<void> | void;
  sendToolResult: (call: AssistantToolCall, result: AssistantToolResult) => Promise<void> | void;
  requestToolCall?: (
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[],
    moduleRegistry?: WidgetAssistantRegistry
  ) => Promise<AssistantToolCall | null> | AssistantToolCall | null;
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
  phase: AssistantOperationPhase;
  route: AssistantRoute;
  toolName?: string;
  message?: string;
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

const CONFIRM_TOOL = "assistant.confirm";
const CANCEL_TOOL = "assistant.cancel";
const ADD_WIDGET_TOOL = "board.add_widget";
const FOCUS_WIDGET_TOOL = "widget.focus";
const PLANNED_WIDGET_PREFIX = "planned_widget_";
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
  const entries: Array<{ type: string; aliases: string[] }> = [
    { type: "music", aliases: ["音乐", "歌曲", "歌", "播放器"] },
    { type: "weather", aliases: ["天气"] },
    { type: "tv", aliases: ["电视", "直播"] },
    { type: "note", aliases: ["便签", "笔记"] },
    { type: "todo", aliases: ["待办", "任务"] },
    { type: "clipboard", aliases: ["剪贴板"] },
    { type: "calculator", aliases: ["计算器", "计算"] },
    { type: "countdown", aliases: ["倒计时", "计时器"] },
    { type: "headline", aliases: ["新闻", "头条"] },
    { type: "market", aliases: ["指数", "行情", "市场"] },
    { type: "worldClock", aliases: ["世界时钟", "时区"] },
    { type: "dialClock", aliases: ["时钟", "表盘"] },
    { type: "translate", aliases: ["翻译"] },
    { type: "converter", aliases: ["换算", "单位"] },
    { type: "recorder", aliases: ["录音"] },
    { type: "messageBoard", aliases: ["留言板", "留言"] }
  ];
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

export class AssistantHarness {
  private pendingConfirmation: ConfirmationRequest | null = null;
  private currentTools: AssistantToolSpec[] = [];
  private initialized = false;
  private transientWidgetTargets = new Map<string, ResolvedWidgetTarget>();
  private queuedShortcutPlanGroups: AssistantToolCall[][] = [];
  private readonly planValidator: PlanValidator;
  private readonly shortcutPlanAdapter = new ShortcutPlanAdapter();
  private readonly auditMetadataByCallId = new Map<string, Pick<AssistantAuditEvent, "normalized" | "candidateModules" | "selectedModule" | "selectedToolHint" | "selectionConfidence">>();

  constructor(private readonly options: AssistantHarnessOptions) {
    this.planValidator =
      options.planValidator ??
      new PlanValidator({
        tools: options.registry.list(),
        moduleRegistry: options.moduleRegistry
      });
  }

  async initialize(): Promise<void> {
    this.currentTools = this.options.toolScopeManager.getInitialTools();
    this.initialized = true;
    if (this.options.moduleRegistry) {
      await this.options.realtime.updateModules?.(this.options.moduleRegistry);
    }
    await this.options.realtime.updateTools(this.currentTools);
    await this.updateRealtimeContext();
  }

  async refreshRealtimeContext(): Promise<void> {
    if (!this.initialized) return;
    await this.updateRealtimeContext();
  }

  async enterWidgetContext(widgetType: string): Promise<void> {
    this.currentTools = this.options.toolScopeManager.getWidgetDetailTools(widgetType);
    await this.options.realtime.updateTools(this.currentTools);
    await this.updateRealtimeContext();
  }

  getPendingConfirmation(): ConfirmationRequest | null {
    return this.pendingConfirmation;
  }

  getCurrentContext(): CompactAssistantContext {
    const input = this.options.getContextInput();
    return this.options.contextSummarizer.summarize({
      ...input,
      pendingConfirmation: this.pendingConfirmation ?? input.pendingConfirmation
    });
  }

  async handleUserInput(input: string): Promise<AssistantHarnessResponse> {
    const startedAt = Date.now();
    const shortcutContext = this.buildShortcutContext();
    const segmentedShortcut = this.hasSegmentedShortcutInput(input);
    const shortcutPlan = this.buildShortcutPlan(input, shortcutContext);
    if (shortcutPlan) {
      return this.handleShortcutPlan(shortcutPlan, startedAt);
    }

    if (!segmentedShortcut) {
    const shortcut = this.options.shortcutRouter.route(input, shortcutContext);
    if (shortcut.matched) {
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
      return response;
    }
    }

    const context = this.getCurrentContext();
    const modelCall = await this.options.realtime.requestToolCall?.(input, context, this.currentTools, this.options.moduleRegistry);
    if (!modelCall) {
      const result: AssistantToolResult = {
        status: "needs_clarification",
        message: "我没听懂，可以再说短一点吗？"
      };
      await this.audit({ route: "model", result, durationMs: Date.now() - startedAt });
      return { route: "model", result };
    }

    this.rememberAuditMetadata(modelCall, input);
    return this.handleFunctionCall(modelCall, "model", startedAt);
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
        if (!routed.matched) {
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

  private async handleShortcutPlan(groups: AssistantToolCall[][], startedAt: number): Promise<AssistantHarnessResponse> {
    const responses: AssistantHarnessResponse[] = [];
    let lastAddedWidget: AddedWidgetData | null = null;
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
      if (groupResponses.some((response) => response.result.status !== "success")) {
        if (groupResponses.some((response) => response.result.status === "needs_confirmation")) {
          this.queuedShortcutPlanGroups = groups.slice(groupIndex + 1);
        }
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

  private rewriteAfterWidgetAdd(call: AssistantToolCall, addedWidget: AddedWidgetData): AssistantToolCall {
    const spec = this.options.registry.get(call.name);
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

  private async executeCommandPlan(
    plan: CommandPlan,
    route: AssistantRoute,
    startedAt: number
  ): Promise<AssistantHarnessResponse[]> {
    const validation = this.planValidator.validate(plan);
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
      return [{ route, call, result }];
    }

    const responses: AssistantHarnessResponse[] = [];
    const executor = new CommandExecutor({
      execute: (call) => this.executeCall(call),
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
    for (const record of execution.records) {
      const call: AssistantToolCall = {
        id: record.command.id,
        name: record.command.tool,
        arguments: record.command.args,
        source: record.command.source,
        transcript: plan.sourceText
      };
      await this.options.realtime.sendToolResult(call, record.result);
      await this.audit({ route, call, result: record.result, durationMs: Date.now() - startedAt });
      responses.push({ route, call, result: record.result });
    }
    await this.updateRealtimeContext();
    return responses;
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

  private async executeCall(call: AssistantToolCall): Promise<AssistantToolResult> {
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

    if ((spec.risk === "confirm" || spec.risk === "destructive") && !this.pendingConfirmation) {
      const confirmationPlan = createCommandPlanFromToolCalls(call.transcript ?? call.name, [call]);
      const command = confirmationPlan.commands[0];
      if (command) {
        command.module = this.options.moduleRegistry?.findModuleForTool(call.name)?.type ?? command.module;
        command.risk = spec.risk;
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
    if (!targetText && isRecord(call.arguments) && typeof call.arguments.widgetId === "string") {
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
      arguments: removeTargetText(pending.arguments)
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
    const task = this.options.registry.execute({ ...call, arguments: removeTargetText(call.arguments) }, context);
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

    const nextTools = this.options.toolScopeManager.getWidgetDetailTools(widgetType);
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
    this.transientWidgetTargets.set(widget.widgetId, {
      widgetId: widget.widgetId,
      definitionId: widget.definitionId,
      type: widget.widgetType,
      name: widget.widgetType,
      confidence: 1,
      reason: "added_in_current_plan"
    });
  }

  private sameToolList(left: AssistantToolSpec[], right: AssistantToolSpec[]): boolean {
    return left.length === right.length && left.every((tool, index) => tool.name === right[index]?.name);
  }

  private async updateRealtimeContext(): Promise<void> {
    await this.options.realtime.updateContext?.(this.getCurrentContext());
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
    this.options.onOperation?.(event);
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
