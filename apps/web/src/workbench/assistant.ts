import {
  createPassthroughSchema,
  type AssistantAction,
  type AssistantToolResult,
  type RealtimeScopedModuleContext,
  type ScopedContextRequest,
  type WidgetAssistantModule
} from "@xiaozhuoban/assistant-core";
import { useAuthStore } from "../auth/authStore";
import { readWorkbenchAssistantState, useWorkbenchStore, type WorkbenchToolWindow } from "./store";

type TopicCreateArgs = { title: string };
type TopicSelectArgs = { topicId: string };
type DirectionAddArgs = { text: string };
type WindowSetArgs = { window: WorkbenchToolWindow; open?: boolean; mode?: "open" | "close" | "toggle" };
type TaskDelegateArgs = { prompt: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const topicCreateSchema = createPassthroughSchema<TopicCreateArgs>(
  (value): value is TopicCreateArgs => isRecord(value) && typeof value.title === "string" && Boolean(value.title.trim())
);
const topicSelectSchema = createPassthroughSchema<TopicSelectArgs>(
  (value): value is TopicSelectArgs => isRecord(value) && typeof value.topicId === "string" && Boolean(value.topicId.trim())
);
const directionAddSchema = createPassthroughSchema<DirectionAddArgs>(
  (value): value is DirectionAddArgs => isRecord(value) && typeof value.text === "string" && Boolean(value.text.trim())
);
const windowSetSchema = createPassthroughSchema<WindowSetArgs>(
  (value): value is WindowSetArgs =>
    isRecord(value) &&
    (value.window === "whiteboard" || value.window === "draft" || value.window === "web" || value.window === "file") &&
    (value.open === undefined || typeof value.open === "boolean") &&
    (value.mode === undefined || value.mode === "open" || value.mode === "close" || value.mode === "toggle")
);
const taskDelegateSchema = createPassthroughSchema<TaskDelegateArgs>(
  (value): value is TaskDelegateArgs => isRecord(value) && typeof value.prompt === "string" && Boolean(value.prompt.trim())
);

function success(message: string, data?: unknown): AssistantToolResult {
  return { status: "success", message, data };
}

function failed(message: string, errorCode: string): AssistantToolResult {
  return { status: "failed", message, errorCode };
}

export function createWorkbenchActions(): AssistantAction[] {
  return [
    {
      spec: {
        name: "workbench.topic.create",
        description: "Create and select a new workbench discussion topic.",
        parameters: topicCreateSchema,
        risk: "safe",
        scope: "deferred",
        idempotency: "stateful",
        requiresAuth: true,
        concurrencyKey: "workbench.topic",
        examples: ["工作台新建一个项目复盘主题", "创建讨论主题叫市场分析"]
      },
      async execute(args) {
        const input = args as TopicCreateArgs;
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return failed("请先登录再创建工作台主题", "AUTH_REQUIRED");
        const topic = await useWorkbenchStore.getState().createTopic(input.title, userId);
        return success(`已创建主题“${topic.title}”`, { topicId: topic.id, title: topic.title });
      }
    },
    {
      spec: {
        name: "workbench.topic.select",
        description: "Select an existing workbench topic by its exact id.",
        parameters: topicSelectSchema,
        risk: "safe",
        scope: "deferred",
        idempotency: "idempotent",
        concurrencyKey: "workbench.topic",
        examples: ["切换到工作台的市场分析主题"]
      },
      execute(args) {
        const input = args as TopicSelectArgs;
        const topic = useWorkbenchStore.getState().topics.find((item) => item.id === input.topicId);
        if (!topic) return failed("没有找到这个工作台主题", "WORKBENCH_TOPIC_NOT_FOUND");
        useWorkbenchStore.getState().selectTopic(topic.id);
        return success(`已切换到“${topic.title}”`, { topicId: topic.id });
      }
    },
    {
      spec: {
        name: "workbench.direction.add",
        description: "Add a discussion direction to the active workbench topic.",
        parameters: directionAddSchema,
        risk: "safe",
        scope: "deferred",
        idempotency: "repeatable",
        requiresAuth: true,
        concurrencyKey: "workbench.topic",
        examples: ["工作台增加一个讨论方向：竞争对手分析"]
      },
      async execute(args) {
        const input = args as DirectionAddArgs;
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return failed("请先登录再修改工作台", "AUTH_REQUIRED");
        if (!useWorkbenchStore.getState().activeTopicId) return failed("请先选择工作台主题", "WORKBENCH_TOPIC_REQUIRED");
        await useWorkbenchStore.getState().addDirection(input.text, userId);
        return success("已添加讨论方向", { text: input.text.trim() });
      }
    },
    {
      spec: {
        name: "workbench.window.set",
        description: "Open, close, or toggle a workbench whiteboard, draft, web, or file window.",
        parameters: windowSetSchema,
        risk: "safe",
        scope: "deferred",
        idempotency: "idempotent",
        concurrencyKey: "workbench.window",
        examples: ["工作台打开白板", "关闭工作台草稿窗口", "打开网页窗口"]
      },
      execute(args) {
        const input = args as WindowSetArgs;
        const state = useWorkbenchStore.getState();
        const currentlyOpen = state.toolWindows.includes(input.window);
        const open = typeof input.open === "boolean" ? input.open : input.mode === "open" ? true : input.mode === "close" ? false : !currentlyOpen;
        if (open) state.openToolWindow(input.window);
        else state.closeToolWindow(input.window);
        return success(open ? "已打开工作台窗口" : "已关闭工作台窗口", { window: input.window, open });
      }
    },
    {
      spec: {
        name: "workbench.task.delegate",
        description: "Delegate complex analysis, vision, image generation, web research, or multi-step work to the durable GPT background worker.",
        parameters: taskDelegateSchema,
        risk: "safe",
        scope: "deferred",
        idempotency: "stateful",
        requiresAuth: true,
        concurrencyKey: "workbench.task",
        examples: ["深入分析这些材料并给出行动建议", "识别这张图并整理结论", "生成一张活动主视觉"]
      },
      async execute(args) {
        const input = args as TaskDelegateArgs;
        try {
          const task = await useWorkbenchStore.getState().delegateTask(input.prompt);
          return success("复杂任务已交给后台处理，完成后我会在当前会话中告诉你", { taskId: task.id, status: task.status });
        } catch (error) {
          return failed(error instanceof Error ? error.message : "后台任务创建失败", "WORKBENCH_TASK_CREATE_FAILED");
        }
      }
    }
  ];
}

function createScopedContext(tools: AssistantAction[], request: ScopedContextRequest): RealtimeScopedModuleContext {
  const state = readWorkbenchAssistantState();
  const specs = tools.map((tool) => tool.spec);
  return {
    moduleType: "workbench",
    tools: specs,
    toolSchemas: Object.fromEntries(specs.map((tool) => [tool.name, (tool.parameters as { jsonSchema?: unknown }).jsonSchema])),
    instances: [],
    stateSummary: { ...state, selectedToolHint: request.selectedToolHint },
    shortcutExamples: ["打开工作台", "关闭工作台", "工作台打开白板", "分析工作台当前材料"],
    executionPolicy: {
      defaultMode: "sequential",
      destructiveActions: [],
      requiresConfirmation: [],
      canRunInParallelWith: ["desktop", "note", "todo"]
    },
    riskPolicy: { safe: specs.map((tool) => tool.name), confirm: [], destructive: [] }
  };
}

export function createWorkbenchAssistantModule(allActions: AssistantAction[]): WidgetAssistantModule {
  const tools = allActions.filter((action) => action.spec.name === "app.workbench.set" || action.spec.name.startsWith("workbench."));
  return {
    type: "workbench",
    definition: {
      id: "workbench",
      type: "workbench",
      name: "AI 工作台",
      description: "多窗口讨论、文件分析和复杂任务工作台",
      category: "workspace",
      multiInstance: false
    },
    aliases: ["工作台", "讨论台", "分析工作台"],
    shortcuts: [
      { id: "workbench.open", intent: "workbench_open", patterns: ["打开工作台", "调出工作台"], examples: ["打开工作台"], risk: "safe" },
      { id: "workbench.close", intent: "workbench_close", patterns: ["关闭工作台", "收起工作台"], examples: ["关闭工作台"], risk: "safe" }
    ],
    tools,
    context: {
      maxRealtimeContextTokens: 520,
      getScopedContext: (request) => createScopedContext(tools, request),
      redactContext: (context) => context
    },
    realtime: {
      exposeCatalog: () => ({
        type: "workbench",
        displayName: "AI 工作台",
        aliases: ["工作台", "讨论台", "分析工作台"],
        capabilities: ["打开关闭", "主题和讨论方向", "白板草稿网页窗口", "复杂分析", "识图和生图"],
        shortcutExamples: ["打开工作台", "关闭工作台", "工作台打开白板", "深入分析当前材料"],
        riskSummary: ["简单界面命令直接执行", "复杂任务交给后台 GPT", "破坏性命令需要确认"]
      }),
      getScopedContext: (request) => createScopedContext(tools, request)
    },
    executionPolicy: { defaultMode: "sequential", canRunInParallelWith: ["desktop", "note", "todo"] },
    legacyBridge: false,
    migrationNotes: ["Uses the Xiaozhuoban Realtime session and never opens a second microphone or session."],
    testMatrix: {
      localParsing: ["打开工作台", "关闭工作台"],
      commandPlans: ["打开工作台，然后打开白板", "分析工作台里的材料"],
      execution: tools.flatMap((tool) => tool.spec.examples ?? []),
      realtimeFallback: ["把这些资料深度研究一下"],
      regression: ["打开工作台后关闭工作台"]
    }
  };
}
