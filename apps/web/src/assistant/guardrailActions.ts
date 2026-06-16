import {
  ActionRegistry,
  createPassthroughSchema,
  type AssistantAction,
  type AssistantToolResult
} from "@xiaozhuoban/assistant-core";

type OutOfScopeCategory =
  | "deferred_widget"
  | "ai_form"
  | "dynamic_widget_generation"
  | "complex_planning"
  | "long_text_rewrite";

type OutOfScopeArgs = {
  category: OutOfScopeCategory;
  targetType?: string;
  request?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

const outOfScopeSchema = createPassthroughSchema<OutOfScopeArgs>(
  (value): value is OutOfScopeArgs =>
    isRecord(value) &&
    typeof value.category === "string" &&
    ["deferred_widget", "ai_form", "dynamic_widget_generation", "complex_planning", "long_text_rewrite"].includes(
      value.category
    ) &&
    (value.targetType === undefined || typeof value.targetType === "string") &&
    (value.request === undefined || typeof value.request === "string")
);

function messageFor(args: OutOfScopeArgs) {
  if (args.category === "deferred_widget") {
    return "这个小工具的细节语音控制还没开放。";
  }
  if (args.category === "ai_form") {
    return "AI 表单语音调用暂不在这一阶段。";
  }
  if (args.category === "dynamic_widget_generation") {
    return "动态生成小工具下一阶段再开放。";
  }
  if (args.category === "complex_planning") {
    return "复杂规划这阶段先不处理。";
  }
  return "长文本改写这阶段先不处理。";
}

export function createGuardrailActions(): AssistantAction<OutOfScopeArgs>[] {
  return [
    {
      spec: {
        name: "assistant.out_of_scope",
        description: "Return a short stage-one out-of-scope response without calling Realtime planning or server tools.",
        parameters: outOfScopeSchema,
        risk: "safe",
        scope: "desktop"
      },
      execute(args): AssistantToolResult {
        return {
          status: "failed",
          message: messageFor(args),
          errorCode: "OUT_OF_SCOPE",
          data: {
            category: args.category,
            targetType: args.targetType
          }
        };
      }
    }
  ];
}

export function registerGuardrailActions(registry: ActionRegistry): void {
  createGuardrailActions().forEach((action) => registry.register(action));
}
