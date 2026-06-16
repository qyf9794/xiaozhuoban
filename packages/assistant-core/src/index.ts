export type AssistantActionRisk = "safe" | "confirm" | "destructive";

export type AssistantToolSource = "shortcut" | "realtime" | "text" | "test";

export type AssistantToolScopeKind = "desktop" | "widget-selection" | "widget-detail" | "deferred";

export interface AssistantSchemaParseSuccess<T> {
  success: true;
  data: T;
}

export interface AssistantSchemaParseFailure {
  success: false;
  error: {
    issues?: Array<{
      path?: Array<string | number>;
      message: string;
    }>;
    message?: string;
  };
}

export interface AssistantParameterSchema<T> {
  safeParse(value: unknown): AssistantSchemaParseSuccess<T> | AssistantSchemaParseFailure;
}

export interface AssistantToolSpec<TArgs = unknown> {
  name: string;
  description: string;
  parameters: AssistantParameterSchema<TArgs>;
  risk?: AssistantActionRisk;
  scope?: AssistantToolScopeKind;
  requiresTarget?: boolean;
}

export interface AssistantToolCall<TArgs = unknown> {
  id: string;
  name: string;
  arguments: TArgs;
  source: AssistantToolSource;
  transcript?: string;
}

export interface ResolvedWidgetTarget {
  widgetId: string;
  definitionId: string;
  type: string;
  name: string;
  confidence: number;
  reason: string;
}

export interface ConfirmationRequest<TArgs = unknown> {
  id: string;
  actionName: string;
  arguments: TArgs;
  target?: ResolvedWidgetTarget;
  message: string;
  createdAt: string;
}

export type AssistantToolResultStatus =
  | "success"
  | "failed"
  | "needs_confirmation"
  | "needs_clarification"
  | "cancelled"
  | "timed_out";

export interface AssistantToolResult<TData = unknown> {
  status: AssistantToolResultStatus;
  message: string;
  data?: TData;
  confirmation?: ConfirmationRequest;
  errorCode?: string;
}

export interface AssistantActionContext {
  now: () => string;
  target?: ResolvedWidgetTarget;
  signal?: AbortSignal;
}

export interface AssistantAction<TArgs = unknown, TResult = unknown> {
  spec: AssistantToolSpec<TArgs>;
  execute: (args: TArgs, context: AssistantActionContext) => Promise<AssistantToolResult<TResult>> | AssistantToolResult<TResult>;
}

export interface IntentShortcutMatch<TArgs = unknown> {
  matched: true;
  confidence: number;
  toolCall: AssistantToolCall<TArgs>;
}

export interface IntentShortcutNoMatch {
  matched: false;
  reason: string;
}

export type IntentShortcutResult<TArgs = unknown> = IntentShortcutMatch<TArgs> | IntentShortcutNoMatch;

export interface IntentShortcutContext {
  pendingConfirmation?: ConfirmationRequest;
  source?: AssistantToolSource;
}

export interface AssistantToolScope {
  kind: AssistantToolScopeKind;
  widgetType?: string;
  toolNames: string[];
}

export interface CompactWidgetSummary {
  widgetId: string;
  definitionId: string;
  type: string;
  name: string;
  order: number;
  summary: string;
  recent?: boolean;
  focused?: boolean;
}

export interface CompactAssistantContext {
  boardId?: string;
  boardName?: string;
  widgetCountsByType: Record<string, number>;
  widgets: CompactWidgetSummary[];
  focusedWidget?: CompactWidgetSummary;
  pendingConfirmation?: Pick<ConfirmationRequest, "id" | "actionName" | "message">;
}

export class AssistantRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "AssistantRegistryError";
  }
}

function formatSchemaError(error: AssistantSchemaParseFailure["error"]): string {
  const issues = error.issues ?? [];
  if (issues.length > 0) {
    return issues
      .map((issue) => {
        const path = issue.path?.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
  }
  return error.message || "参数校验失败";
}

function defaultNow() {
  return new Date().toISOString();
}

export class ActionRegistry {
  private readonly actions = new Map<string, AssistantAction<unknown, unknown>>();

  register<TArgs, TResult>(action: AssistantAction<TArgs, TResult>): void {
    const name = action.spec.name.trim();
    if (!name) {
      throw new AssistantRegistryError("Action name is required", "ACTION_NAME_REQUIRED");
    }
    if (this.actions.has(name)) {
      throw new AssistantRegistryError(`Action already registered: ${name}`, "ACTION_ALREADY_REGISTERED");
    }

    this.actions.set(name, action as AssistantAction<unknown, unknown>);
  }

  list(scope?: AssistantToolScopeKind): AssistantToolSpec[] {
    const specs = [...this.actions.values()].map((action) => action.spec);
    return scope ? specs.filter((spec) => spec.scope === scope) : specs;
  }

  get(name: string): AssistantToolSpec | null {
    return this.actions.get(name)?.spec ?? null;
  }

  async execute<TData = unknown>(
    call: AssistantToolCall,
    context: Partial<AssistantActionContext> = {}
  ): Promise<AssistantToolResult<TData>> {
    const action = this.actions.get(call.name);
    if (!action) {
      return {
        status: "failed",
        message: `未知工具：${call.name}`,
        errorCode: "UNKNOWN_TOOL"
      };
    }

    const parsed = action.spec.parameters.safeParse(call.arguments);
    if (!parsed.success) {
      return {
        status: "failed",
        message: formatSchemaError(parsed.error),
        errorCode: "INVALID_ARGUMENTS"
      };
    }

    try {
      return (await action.execute(parsed.data, {
        now: context.now ?? defaultNow,
        target: context.target,
        signal: context.signal
      })) as AssistantToolResult<TData>;
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : "工具执行失败",
        errorCode: "EXECUTION_FAILED"
      };
    }
  }
}

export function createPassthroughSchema<T>(guard?: (value: unknown) => value is T): AssistantParameterSchema<T> {
  return {
    safeParse(value) {
      if (!guard || guard(value)) {
        return { success: true, data: value as T };
      }
      return {
        success: false,
        error: {
          issues: [{ message: "参数形状不匹配" }]
        }
      };
    }
  };
}
