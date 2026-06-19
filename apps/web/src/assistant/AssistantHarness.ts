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
  createLearningCandidate,
  createPlanPreview,
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
    this.markRealtimeUsed();
    const modelPlan = await this.options.realtime.requestCommandPlan?.(input, context, this.currentTools, this.options.moduleRegistry);
    if (modelPlan) {
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
    this.rememberAuditMetadata(modelCallWithTranscript, input);
    return this.handleFunctionCall(modelCallWithTranscript, "model", startedAt);
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

  private shouldExecuteLocalShortcut(confidence: number): boolean {
    return confidence >= LOCAL_SHORTCUT_CONFIDENCE_THRESHOLD;
  }

  private shouldDeferComplexShortcutSegment(input: string): boolean {
    const normalized = normalizeText(input);
    if (normalized.length < 6) return false;
    if (/(?:斤|公斤|千克|克|米|公里|摄氏|华氏).{0,12}(?:换算|多少|是多少)|(?:换算|多少|是多少).{0,12}(?:斤|公斤|千克|克|米|公里|摄氏|华氏)/.test(input)) {
      return false;
    }
    if (/^清空剪贴板，然后添加一条待办[:：]/.test(input)) {
      return false;
    }
    return (
	      /(如果|不要|别|只|仅|检查|准备|名字先叫|草稿|误触|恢复普通窗口|当前在全屏|登录音乐|语音入口|所有弹窗|只留下|不要新建|不对|不是|啊不是|准确说|刚才说错|哦再|算了|其实|识别成|不是我要的|没把握|需要弹确认|弹确认|先确认|等我确认|确认后执行|前先告诉|统一确认)/.test(input) ||
      /输入.+(?:字|词|内容)/.test(input) ||
      /切到.+页面/.test(input) ||
      /(?:切到|切回|回到|新开|新建|创建).{0,20}(?:后|再|然后|同时|，|,).{0,24}(?:打开|添加|把|放上|移动|调到)/.test(input) ||
      /(?:关闭|关掉|关上|删掉|删除|移除).{0,20}(?:后|再|然后|同时|，|,).{0,24}(?:打开|添加|新建|新开)/.test(input) ||
      /(?:打开|开一下|唤出|再开).{0,20}(?:后|，|,).{0,24}(?:把|移动|固定|用于|对比)/.test(input) ||
      /(?:打开|调出|唤出).{0,12}(?:音乐|播放器).{0,24}(?:搜索|搜|找).{0,24}(?:播放|并播放)/.test(input) ||
      /(?:音乐|歌曲|播放|来一首|我要听|想听|给我放|找).{0,30}(?:搜到后|播放后|如果没找到|没有打开|先打开|歌词搜索|不要继续上一首|别只放试听|不要换成|找到原唱|按歌曲名|播放失败)/.test(input) ||
      /(?:播放|放点|放一点|来点|想听|听点|找).{0,24}(?:音乐|歌|钢琴|民谣|背景|白噪音|自然声|粤语|轻松|舒缓).{0,30}(?:分钟后|小时后|提醒|倒计时|叫我)/.test(input) ||
      (!/打开天气查.+再打开世界时钟/.test(input) &&
        /(?:天气|冷不冷|会不会下雨|适合|带伞|体感温度|洗车).{0,36}(?:顺便|同时|再|然后|并|后|如果|先).{0,44}(?:便签|待办|提醒|世界时钟|本地时间|时间|空气|摘要|换算|华氏|摄氏|留言板|倒计时|翻译|英文|聚焦|放最前|对比)/.test(input)) ||
      /(?:适合洗车|适合带伞|适不适合跑步|会不会下雨|体感温度)/.test(input) ||
      /(?:时间|几点|时钟|世界时钟|表盘时钟|打开时钟|倒计时|计时器|提醒我|分钟后|半小时后|明早九点).{0,36}(?:并|同时|然后|再|后|而不是|优先|不要|别|名称叫).{0,44}(?:表盘|世界时钟|夜间模式|轻音乐|音乐|便签|原因|喝水|部署日志|泡茶|五分钟|天气|待办|录音|电视|客户回电话|休息|放最前|纽约|旧金山|缩小)/.test(input) ||
      /(?:打开表盘而不是世界时钟|打开时钟时优先打开表盘时钟|世界时钟只保留|表盘时钟放到桌面中央|暂停计时器.*音乐|明早九点提醒我给客户回电话)/.test(input) ||
      /(?:便签|待办|任务|提醒).{0,12}(?:记下|写下|保存|追加|新增|添加|加一条|设为|标记|勾掉|清理|清空).{0,48}(?:音乐|播放|完整歌曲|realtime|Vercel|日志|留言板|关闭|录音|翻译|新闻|摘要|天气|token|多轮|重复|当前|备注|确认|轻松|搜索|桌面问题|部署完成)/i.test(input) ||
      /(?:记下|写下|保存|追加|新增|添加|加一条).{0,28}(?:便签|待办|任务|提醒).{0,48}(?:音乐|播放|完整歌曲|realtime|Vercel|日志|留言板|关闭|录音|翻译|新闻|摘要|天气|token|多轮|重复|当前|备注|确认|轻松|搜索|桌面问题)/i.test(input) ||
      /(?:刚才搜索到|搜索到的).{0,24}(?:追加到便签|写到便签|记到便签)/.test(input) ||
      /(?:把|将).{0,20}(?:这项待办|部署完成).{0,12}(?:勾掉|标记完成|完成)/.test(input) ||
      /(?:清空便签|清理已完成待办|先弹确认|先让我确认|前先让我确认|前先弹确认|前先弹统一确认|之前先确认|先问我确认|必须先问我确认|需要弹确认)/.test(input) ||
      /(?:关闭|关掉|关上|收起|删除|删掉|移除|清理|清空).{0,32}(?:保留|先确认|等我确认|确认后执行|前先告诉|统一确认)/.test(input) ||
      /(?:会议纪要|hello realtime|新闻摘要|当前播放歌曲|天气城市).{0,24}(?:便签|录音|翻译|追加|保存|新增|打开)/i.test(input) ||
      /(?:明天下午三点|今天晚上九点|五分钟后提醒我看倒计时).{0,32}(?:提醒|Vercel|复盘|声音)/i.test(input) ||
      /(?:剪贴板|复制|固定保存|保存命令).{0,64}(?:不要|固定|保留|并|后|前先|当前|翻译|便签|表盘|提醒|完成提示|未固定|占位|部署|项目口令|本地路径|搜索关键词|今天日期|客服回复模板|演示账号|音乐登录状态)/i.test(input) ||
      /(?:临时验证码|demo@example|demo-token|Vercel 项目名|WiFi 密码提示|搜索关键词|会议链接|客服回复模板|本地路径|当前歌曲名|翻译结果|打开表盘时钟|今天日期|部署 id|音乐登录状态检查步骤).{0,40}(?:剪贴板|复制|保存|固定|存起来|新增|添加|不要|提醒)/i.test(input) ||
      /固定保存.{0,40}(?:Vercel 项目名|音乐登录状态|项目口令|demo-token|xiaozhuoban)/i.test(input) ||
      /(?:清理|清空).{0,16}剪贴板.{0,32}(?:保留|固定|确认|完成提示|未固定|测试记录)/.test(input) ||
      /(?:翻译|译成).{0,48}(?:复制结果|不要执行|关闭命令|播放轻松音乐|preview mode|0\.9|realtime|备忘|适合出门)/i.test(input) ||
      /(?:good night realtime|今天适合出门吗|播放轻松音乐).{0,24}(?:翻译|译成)/i.test(input) ||
      /(?:计算|算).{0,48}(?:写进便签|写到便签|添加到剪贴板|显示在计算器|部署失败次数|再乘|然后|并)/.test(input) ||
	      /(?:换算|转成|大概是多少).{0,48}(?:平方|分钟|小时|美元|人民币|汇率|公斤半|Fahrenheit|摄氏度|公里|米|斤)/i.test(input) ||
	      /(?:2\s*斤|两公斤半).{0,24}(?:克|换算)/.test(input) ||
	      /(?:新闻|头条|重大新闻|财经新闻|行情|全球指数|纳指|道指|恒生|上证|深证|美股).{0,40}(?:不要|别|只|顺便|同时|然后|后|如果|并|放到|置顶|聚焦|刷新失败|发一句|追加|提醒|关闭|命令面板)/.test(input) ||
	      /(?:把新闻和天气并排放|打开重大新闻小工具后马上聚焦|不要打开行情窗口|不要播放电视|别误开音乐|关闭港股窗口)/.test(input) ||
	      /(?:录音|录音机|录制|录一段|回放).{0,48}(?:并|同时|然后|再|后|之前|先|如果|不要|别|避免|旁边|封面|倒计时|提醒|便签|留言板|剪贴板|电视|音乐|表盘|待办|窗口|左上角|聚焦|测试编号|会议开始|会议结束|复现过程|检查声音)/.test(input) ||
	      /(?:开始录音后|开始录音，然后|停止录音后|停止录音并|播放录音时|录音回放暂停后|打开录音机但先不要开始录|打开录音机，窗口放到左上角)/.test(input) ||
	      /(?:留言板|留言|消息).{0,48}(?:不要|别|不是发送|同时|然后|如果|先|再|置顶|移到底部|移到|底部|多轮|部署完成|realtime|英文|重复|确认|碍事|收起来|清空输入框|天气摘要|音乐已经重新搜索|十分钟)/i.test(input) ||
	      /(?:把天气摘要发到留言板|关闭留言板和新闻窗口|关闭留言板时执行关闭)/.test(input) ||
	      /(?:电视|直播|CCTV).{0,28}(?:，|,|然后|再|同时|后).{0,36}(?:音乐|录音|倒计时|提醒|侧边栏|侧栏|置顶|便签|新闻)/i.test(input) ||
	      /(?:电视|直播|CCTV).{0,28}(?:切到|再选|重新选择).{0,16}(?:CCTV|频道)/i.test(input) ||
	      /(?:暂停电视|电视.{0,8}暂停).{0,36}(?:继续播放音乐|开始录音|提醒|倒计时)/.test(input) ||
	      /(?:关闭电视).{0,28}(?:同时|然后|再|，|,).{0,28}(?:音乐|继续播放)/.test(input) ||
	      /(?:电视卡住|重新选择\s*CCTV|新闻直播.{0,16}CCTV)/i.test(input) ||
	      /(?:市场行情|重大新闻|纽约时间).{0,40}(?:排成一列|排一列|一列)/.test(input) ||
	      /(?:翻译成中文|翻译).{0,32}(?:复制|剪贴板)/i.test(input) ||
	      /(?:添加待办|待办).{0,32}(?:同时|并|然后|再).{0,32}(?:明早|提醒)/.test(input) ||
	      /(?:新建一条待办|加入待办|添加待办[:：]).{0,48}(?:realtime|语音|小工具|Apple Music|试听|断线|复盘|检查)|(?:realtime|语音|小工具|Apple Music|试听|断线|复盘|检查).{0,48}(?:加入待办|添加到待办)/i.test(input) ||
	      /(?:十五分钟后|明早八点|明早九点|半小时后).{0,32}(?:提醒|查看|继续|检查)/i.test(input) ||
	      /(?:查|看).{0,16}天气.{0,24}(?:决定|是否|适合|出门)/.test(input) ||
	      /(?:打开计算器|计算器).{0,32}(?:今天|还有多少分钟|到六点)/.test(input) ||
	      /(?:打开|切到|回到).{0,16}(?:工作台|项目冲刺).{0,32}(?:音乐播放器|放到最前|整理窗口|整理桌面)/.test(input) ||
	      (!/打开天气查.+再打开世界时钟/.test(input) && /(?:天气改成|天气).{0,40}(?:世界时钟|伦敦|纽约|北京伦敦纽约)/.test(input)) ||
	      /(?:隐藏|显示|先|并|同时).{0,16}(?:整理|排列|对齐)/.test(input) ||
      /(?:整理|排列|对齐).{0,16}(?:同时|然后|再|并|后).{0,24}(?:聚焦|切到|放最前|待办|窗口)?/.test(input) ||
      /(?:旧的|新的|另一个|再开|只保留|保留).{0,16}(?:小工具|窗口|倒计时|音乐|电视|待办|天气)/.test(input) ||
      /(?:两个|多个|所有).{0,8}窗口/.test(input) ||
      /(?:表盘|时钟).{0,24}(?:调暗|夜间模式|打开夜间)/.test(input) ||
      /(?:倒计时|计时器).{0,28}(?:声音|暂停倒计时)/.test(input) ||
      /(?:天气卡片|卡片).{0,20}(?:放大|调大|方便读)/.test(input) ||
      /(?:电视|直播).{0,24}(?:全屏).{0,24}(?:侧栏|侧边栏)/.test(input) ||
      /(?:退出全屏后|恢复普通窗口).{0,28}(?:音乐播放器|音乐|播放器)/.test(input) ||
      /(?:音乐|播放器).{0,28}(?:封面|播放控件|登录按钮|恢复正常大小)/.test(input) ||
      /窗口.{0,16}(?:拖到|移到|移动到|放到|放在|置顶|最前|调宽|调小|放大|缩小|退出全屏|盖住|挡住|压缩|恢复正常大小)/.test(input) ||
      /(?:窗口|面板|封面|播放控件|登录按钮|按钮|文字).{0,28}(?:太小|挡|覆盖|居中|放大|缩小|调宽|调小|右上角|正常大小|不要全屏|恢复正常|压缩)/.test(input) ||
      /(?:太小|太挡眼|挡眼|别挡|不要压缩).{0,28}(?:窗口|面板|封面|播放控件|登录按钮|按钮|文字|待办|倒计时|便签)/.test(input)
    );
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
    const validation = this.planValidator.validate(plan);
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
    const store = this.options.learnedCommandStore;
    if (!store || (route !== "model" && route !== "function_call")) {
      return false;
    }
    const candidate = createLearningCandidate({
      rawText: plan.sourceText,
      normalizedText: plan.normalizedText,
      plan,
      call,
      result,
      now: this.options.now
    });
    if (!candidate) return false;
    try {
      await store.addCandidate(candidate);
      this.pendingLearningCandidate = candidate;
      return true;
    } catch {
      return false;
    }
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
