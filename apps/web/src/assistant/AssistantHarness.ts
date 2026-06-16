import {
  ActionRegistry,
  ContextSummarizer,
  IntentShortcutRouter,
  ToolScopeManager,
  WidgetTargetResolver,
  type AssistantActionContext,
  type AssistantToolCall,
  type AssistantToolResult,
  type AssistantToolSpec,
  type CompactAssistantContext,
  type ConfirmationRequest,
  type ContextSummarizerInput,
  type IntentShortcutContext,
  type ResolvedWidgetTarget
} from "@xiaozhuoban/assistant-core";

export type AssistantRoute = "shortcut" | "model" | "function_call";

export interface AssistantRealtimeAdapter {
  updateTools: (tools: AssistantToolSpec[]) => Promise<void> | void;
  sendToolResult: (call: AssistantToolCall, result: AssistantToolResult) => Promise<void> | void;
  requestToolCall?: (
    input: string,
    context: CompactAssistantContext,
    tools: AssistantToolSpec[]
  ) => Promise<AssistantToolCall | null> | AssistantToolCall | null;
}

export interface AssistantAuditEvent {
  route: AssistantRoute;
  call?: AssistantToolCall;
  result: AssistantToolResult;
  durationMs: number;
}

export interface AssistantAuditAdapter {
  write: (event: AssistantAuditEvent) => Promise<void> | void;
}

export interface AssistantHarnessOptions {
  registry: ActionRegistry;
  shortcutRouter: IntentShortcutRouter;
  targetResolver: WidgetTargetResolver;
  toolScopeManager: ToolScopeManager;
  contextSummarizer: ContextSummarizer;
  realtime: AssistantRealtimeAdapter;
  audit?: AssistantAuditAdapter;
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

export class AssistantHarness {
  private pendingConfirmation: ConfirmationRequest | null = null;
  private currentTools: AssistantToolSpec[] = [];

  constructor(private readonly options: AssistantHarnessOptions) {}

  async initialize(): Promise<void> {
    this.currentTools = this.options.toolScopeManager.getInitialTools();
    await this.options.realtime.updateTools(this.currentTools);
  }

  async enterWidgetContext(widgetType: string): Promise<void> {
    this.currentTools = this.options.toolScopeManager.getWidgetDetailTools(widgetType);
    await this.options.realtime.updateTools(this.currentTools);
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
    const shortcut = this.options.shortcutRouter.route(input, shortcutContext);
    if (shortcut.matched) {
      const result = await this.handleFunctionCall(shortcut.toolCall, "shortcut", startedAt);
      return result;
    }

    const context = this.getCurrentContext();
    const modelCall = await this.options.realtime.requestToolCall?.(input, context, this.currentTools);
    if (!modelCall) {
      const result: AssistantToolResult = {
        status: "needs_clarification",
        message: "我没听懂，可以再说短一点吗？"
      };
      await this.audit({ route: "model", result, durationMs: Date.now() - startedAt });
      return { route: "model", result };
    }

    return this.handleFunctionCall(modelCall, "model", startedAt);
  }

  async handleFunctionCall(
    call: AssistantToolCall,
    route: AssistantRoute = "function_call",
    startedAt = Date.now()
  ): Promise<AssistantHarnessResponse> {
    const result = await this.executeCall(call);
    await this.options.realtime.sendToolResult(call, result);
    await this.audit({ route, call, result, durationMs: Date.now() - startedAt });
    return { route, call, result };
  }

  private buildShortcutContext(): IntentShortcutContext {
    const input = this.options.getContextInput();
    const context = this.getCurrentContext();
    return {
      source: "shortcut",
      pendingConfirmation: this.pendingConfirmation ?? undefined,
      availableWidgets: context.widgets,
      availableDefinitions: input.availableDefinitions ?? context.widgets.map((widget) => ({
        definitionId: widget.definitionId,
        type: widget.type,
        name: widget.name
      })),
      focusedWidget: context.focusedWidget
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
      const confirmation: ConfirmationRequest = {
        id: createId("confirm"),
        actionName: call.name,
        arguments: call.arguments,
        target: target.target,
        message: `确认执行 ${call.name} 吗？`,
        createdAt: this.options.now?.() ?? new Date().toISOString()
      };
      this.pendingConfirmation = confirmation;
      return {
        status: "needs_confirmation",
        message: confirmation.message,
        confirmation
      };
    }

    const result = await this.executeRegistryCall(call, target.target);
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
      const widget = context.widgets.find((item) => item.widgetId === widgetId);
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
    return { status: "cancelled", message: "已取消" };
  }

  private async executeRegistryCall(call: AssistantToolCall, target?: ResolvedWidgetTarget): Promise<AssistantToolResult> {
    const controller = new AbortController();
    const context: Partial<AssistantActionContext> = {
      now: this.options.now,
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

  private getWidgetTypeFromCallArguments(args: unknown): string | undefined {
    if (!isRecord(args) || typeof args.widgetId !== "string") {
      return undefined;
    }
    return this.getCurrentContext().widgets.find((widget) => widget.widgetId === args.widgetId)?.type;
  }

  private sameToolList(left: AssistantToolSpec[], right: AssistantToolSpec[]): boolean {
    return left.length === right.length && left.every((tool, index) => tool.name === right[index]?.name);
  }

  private async audit(event: AssistantAuditEvent): Promise<void> {
    await this.options.audit?.write(event);
  }
}
