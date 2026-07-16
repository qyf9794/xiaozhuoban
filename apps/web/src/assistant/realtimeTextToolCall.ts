import {
  type AssistantToolCall,
  type AssistantToolSpec,
  type CommandPlan,
  type CompactAssistantContext,
  type RealtimeModuleCatalogItem,
  type RealtimeScopedModuleContext
} from "@xiaozhuoban/assistant-core";
import {
  REALTIME_ADD_WIDGET_TOOL_NAME,
  findRealtimeWidgetType,
  inputMentionsRealtimeWidgetType,
  realtimeToolSelectionPolicyLines,
  realtimeToolSelectionSessionPolicyLines
} from "./realtimeRoutingPolicy";
import {
  XIAOZHUOBAN_REALTIME_MODEL,
  createRealtimeContextInstructions,
  createRealtimeSessionAudioConfig,
  decodeRealtimeToolName,
  serializeAssistantToolForRealtime,
  type RealtimeFunctionTool
} from "./realtimeSessionConfig";

export type RealtimeTextToolCallRequest = {
  input: string;
  contextVersion?: string;
  toolCatalogVersion?: string;
  context?: CompactAssistantContext;
  tools: AssistantToolSpec[];
  moduleCatalog?: RealtimeModuleCatalogItem[];
  moduleContext?: RealtimeScopedModuleContext;
  moduleContexts?: RealtimeScopedModuleContext[];
  phase?: "select" | "execute" | "auto" | "plan_select" | "plan_execute";
  selection?: RealtimeTextToolSelection;
  planSelection?: RealtimeTextPlanSelection;
};

export type RealtimeTextToolCallResponse = {
  call: AssistantToolCall | null;
  selection?: RealtimeTextToolSelection | null;
  plan?: CommandPlan | null;
  planSelection?: RealtimeTextPlanSelection | null;
  usageEvents?: unknown[];
};

export type RealtimeTextToolSelection = {
  name: string;
  candidateTools?: string[];
  selectedModule?: string;
  intent?: string;
  targetHint?: string;
  userCommand?: string;
  confidence?: number;
};

export type RealtimeTextPlanSelectionStep = RealtimeTextToolSelection & {
  name: string;
  id?: string;
  connector?: "start" | "sequential" | "parallel";
};

export type RealtimeTextPlanSelection = {
  steps: RealtimeTextPlanSelectionStep[];
  userCommand?: string;
};

const SELECT_TOOL_NAME = "assistant.select_tool";
const SELECT_PLAN_TOOL_NAME = "assistant.select_plan";
const SUBMIT_PLAN_TOOL_NAME = "assistant.submit_plan";
const ADD_WIDGET_TOOL_NAME = REALTIME_ADD_WIDGET_TOOL_NAME;

export const REALTIME_TOOL_SELECTION_TOOL_NAME = SELECT_TOOL_NAME;
export const REALTIME_PLAN_SELECTION_TOOL_NAME = SELECT_PLAN_TOOL_NAME;
export const REALTIME_PLAN_SUBMISSION_TOOL_NAME = SUBMIT_PLAN_TOOL_NAME;

function parsePlanConnector(value: unknown): RealtimeTextPlanSelectionStep["connector"] {
  return value === "parallel" || value === "sequential" || value === "start" ? value : undefined;
}

export function createRealtimeTextToolCallRequestBody(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  selection?: RealtimeTextToolSelection
) {
  return JSON.stringify({
    input,
    context,
    contextVersion: context.contextVersion,
    toolCatalogVersion: context.toolCatalogVersion,
    tools,
    selection,
    phase: "auto"
  } satisfies RealtimeTextToolCallRequest);
}

function getRealtimeCatalogVersion(moduleCatalog: RealtimeModuleCatalogItem[] | undefined): string | undefined {
  const first = moduleCatalog?.find((module) => "catalogVersion" in module && typeof module.catalogVersion === "string");
  return first && "catalogVersion" in first && typeof first.catalogVersion === "string" ? first.catalogVersion : undefined;
}

function toolCatalog(tools: AssistantToolSpec[]) {
  return tools
    .map((tool) =>
      [
        `- ${tool.name}`,
        `description=${tool.description}`,
        `scope=${tool.scope}`,
        tool.widgetType ? `widgetType=${tool.widgetType}` : "",
        tool.risk ? `risk=${tool.risk}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");
}

export function createRealtimeToolSelectionRequestBody(
  input: string,
  tools: AssistantToolSpec[],
  moduleCatalog?: RealtimeModuleCatalogItem[]
) {
  return JSON.stringify({
    input,
    tools,
    moduleCatalog,
    toolCatalogVersion: getRealtimeCatalogVersion(moduleCatalog),
    phase: "select"
  } satisfies RealtimeTextToolCallRequest);
}

export function createRealtimeScopedToolCallRequestBody(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  selection: RealtimeTextToolSelection,
  moduleContext?: RealtimeScopedModuleContext
) {
  return JSON.stringify({
    input,
    context,
    contextVersion: context.contextVersion,
    toolCatalogVersion: context.toolCatalogVersion,
    tools,
    selection,
    moduleContext,
    phase: "execute"
  } satisfies RealtimeTextToolCallRequest);
}

export function createRealtimePlanSelectionRequestBody(
  input: string,
  tools: AssistantToolSpec[],
  moduleCatalog?: RealtimeModuleCatalogItem[]
) {
  return JSON.stringify({
    input,
    tools,
    moduleCatalog,
    toolCatalogVersion: getRealtimeCatalogVersion(moduleCatalog),
    phase: "plan_select"
  } satisfies RealtimeTextToolCallRequest);
}

export function createRealtimeCommandPlanRequestBody(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  planSelection: RealtimeTextPlanSelection,
  moduleContexts?: RealtimeScopedModuleContext[]
) {
  return JSON.stringify({
    input,
    context,
    contextVersion: context.contextVersion,
    toolCatalogVersion: context.toolCatalogVersion,
    tools,
    planSelection,
    moduleContexts,
    phase: "plan_execute"
  } satisfies RealtimeTextToolCallRequest);
}

function moduleCatalogText(moduleCatalog: RealtimeModuleCatalogItem[] | undefined) {
  return (moduleCatalog ?? [])
    .map((module) =>
      [
        `- ${module.type}`,
        `displayName=${module.displayName}`,
        `aliases=${module.aliases.join("/")}`,
        `capabilities=${module.capabilities.join("/")}`,
        "toolNames" in module && Array.isArray(module.toolNames) ? `tools=${module.toolNames.join("/")}` : "",
        "concurrencyKeys" in module && Array.isArray(module.concurrencyKeys) && module.concurrencyKeys.length
          ? `concurrency=${module.concurrencyKeys.join("/")}`
          : "",
        "loadLevel" in module && typeof module.loadLevel === "string" ? `load=${module.loadLevel}` : "",
        module.riskSummary.length ? `risk=${module.riskSummary.join("/")}` : "",
        module.shortcutExamples.length ? `examples=${module.shortcutExamples.join("/")}` : ""
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join("\n");
}

function selectionModuleTypes(tools: AssistantToolSpec[], moduleCatalog?: RealtimeModuleCatalogItem[]): string[] {
  return [
    ...new Set([
      "app",
      "board",
      "widget",
      "window",
      "music",
      "tv",
      "weather",
      "market",
      ...(moduleCatalog ?? []).map((module) => module.type),
      ...tools.map((tool) => tool.widgetType).filter((type): type is string => Boolean(type))
    ])
  ].sort((left, right) => left.localeCompare(right));
}

export function createRealtimeToolSelectionPrompt(
  input: string,
  tools: AssistantToolSpec[],
  moduleCatalog?: RealtimeModuleCatalogItem[]
) {
  const catalogVersion = getRealtimeCatalogVersion(moduleCatalog);
  return [
    "你是小桌板命令路由器。先只判断用户想使用哪个模块，并从工具目录中选择 1 到 4 个候选工具，不要选择最终工具，不要生成工具参数。",
    "你只能基于模块目录、工具目录和用户命令选择；此阶段不会提供桌面上下文。",
    ...realtimeToolSelectionPolicyLines,
    "没有足够把握时不要调用工具。",
    "",
    "# 版本",
    catalogVersion ? `toolCatalogVersion=${catalogVersion}` : "toolCatalogVersion=unknown",
    "",
    "# 模块目录",
    moduleCatalogText(moduleCatalog) || "- 未提供模块目录",
    "",
    "# 工具目录",
    toolCatalog(tools),
    "",
    `用户命令：${input}`
  ].join("\n");
}

export function createRealtimeToolSelectionInstructions(tools: AssistantToolSpec[], moduleCatalog?: RealtimeModuleCatalogItem[]) {
  const catalogVersion = getRealtimeCatalogVersion(moduleCatalog);
  return [
    "你是小桌板命令路由器。当前阶段只根据目录选择 3 到 4 个最相关的候选工具，不选择最终工具。",
    "不要生成任何真实工具参数，不要猜 widgetId、definitionId、boardId，不要把某个候选工具当成最终执行工具。",
    "不要要求完整桌面上下文；如果需要目标，只把用户说出的目标词放到 targetHint。",
    "如果要路由命令，直接调用 assistant.select_tool，不要先说话，不要输出语音或文字，不要把工具选择参数念给用户。",
    "用户要控制桌面时，先调用 assistant.select_tool；前端随后会按候选工具提供最小必要上下文，再由你选择最终工具并调用。",
    "只要用户说的是打开、关闭、播放、搜索、查询、设置、添加、写入、完成、勾掉、暂停、继续、重置、切换、全屏、换算、转换、翻译等桌面动作，必须调用 assistant.select_tool。",
    "candidateTools 必须严格来自工具目录里的已注册工具名；不能返回模块名、别名、意图名、中文说明或未注册工具。",
    "candidateTools 按相关性排序，通常返回 3 到 4 个；非常明确的单一命令也至少返回 1 个。",
    "完成/勾掉待办事项候选包含 todo.complete_item；添加/提醒待办候选包含 todo.add_item；暂停/继续/重置倒计时分别包含 countdown.pause/countdown.resume/countdown.reset。",
    ...realtimeToolSelectionSessionPolicyLines,
    "",
    "# 版本",
    catalogVersion ? `toolCatalogVersion=${catalogVersion}` : "toolCatalogVersion=unknown",
    "",
    "# 模块目录",
    moduleCatalogText(moduleCatalog) || "- 未提供模块目录",
    "",
    "# 工具目录",
    toolCatalog(tools)
  ].join("\n");
}

export function createRealtimeToolSelectionTool(tools: AssistantToolSpec[], moduleCatalog?: RealtimeModuleCatalogItem[]): RealtimeFunctionTool {
  const moduleTypes = selectionModuleTypes(tools, moduleCatalog);
  const toolNames = tools.map((tool) => tool.name);
  return {
    type: "function",
    name: SELECT_TOOL_NAME.replace(/\./g, "__dot__"),
    description: "Select 1 to 4 candidate Xiaozhuoban tools before desktop context is provided. Do not choose the final execution tool in this stage.",
    parameters: {
      type: "object",
      properties: {
        candidateTools: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "string",
            enum: toolNames
          },
          description: "Candidate registered tool names, ordered by relevance. This is not the final tool choice."
        },
        name: {
          type: "string",
          enum: toolNames,
          description: "Backward-compatible first candidate tool name. Prefer candidateTools."
        },
        selectedModule: {
          type: "string",
          enum: moduleTypes,
          description: "Selected module type when known."
        },
        targetHint: {
          type: "string",
          description: "Short target words copied from the user's command, such as 音乐, 天气, 默认桌板."
        },
        userCommand: {
          type: "string",
          description: "A short normalized version of the user's command."
        },
        confidence: { type: "number" }
      },
      required: ["candidateTools"],
      additionalProperties: false
    }
  };
}

export function createRealtimePlanSelectionInstructions(
  tools: AssistantToolSpec[],
  moduleCatalog?: RealtimeModuleCatalogItem[]
) {
  const catalogVersion = getRealtimeCatalogVersion(moduleCatalog);
  return [
    "你是小桌板 Realtime 命令规划器。先分析用户整句话涉及的全部动作和工具。",
    "需要控制小桌板时，直接调用 assistant.select_plan，一次返回完整、有序的步骤列表。",
    "此阶段只选择工具，不生成真实参数，不猜 widgetId、definitionId 或 boardId。",
    "多步骤命令不能只返回第一步；同时发生的步骤 connector=parallel，前后发生的步骤 connector=sequential。",
    "纯问候或闲聊不调用工具，直接简短回复。",
    ...realtimeToolSelectionSessionPolicyLines,
    "",
    "# 版本",
    catalogVersion ? `toolCatalogVersion=${catalogVersion}` : "toolCatalogVersion=unknown",
    "",
    "# 模块目录",
    moduleCatalogText(moduleCatalog) || "- 未提供模块目录",
    "",
    "# 工具目录",
    toolCatalog(tools)
  ].join("\n");
}

export function createRealtimePlanSelectionTool(
  tools: AssistantToolSpec[],
  moduleCatalog?: RealtimeModuleCatalogItem[]
): RealtimeFunctionTool {
  return {
    type: "function",
    name: SELECT_PLAN_TOOL_NAME.replace(/\./g, "__dot__"),
    description: "Select every registered Xiaozhuoban tool needed for the complete user command, in execution order.",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string", enum: tools.map((tool) => tool.name) },
              selectedModule: { type: "string", enum: selectionModuleTypes(tools, moduleCatalog) },
              targetHint: { type: "string" },
              connector: { type: "string", enum: ["start", "sequential", "parallel"] },
              confidence: { type: "number" }
            },
            required: ["name", "connector"],
            additionalProperties: false
          }
        },
        userCommand: { type: "string", description: "The complete normalized user command without dropping any step." }
      },
      required: ["steps", "userCommand"],
      additionalProperties: false
    }
  };
}

export function parseRealtimePlanSelectionArguments(value: unknown): RealtimeTextPlanSelection | null {
  const args = parseArguments(value);
  const steps = Array.isArray(args.steps) ? args.steps : [];
  const parsed = steps
    .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object" && !Array.isArray(step))
    .map((step, index) => ({
      id: typeof step.id === "string" ? step.id : `step_${index + 1}`,
      name: typeof step.name === "string" ? step.name : "",
      selectedModule: typeof step.selectedModule === "string" ? step.selectedModule : undefined,
      targetHint: typeof step.targetHint === "string" ? step.targetHint : undefined,
      confidence: typeof step.confidence === "number" ? step.confidence : undefined,
      connector: parsePlanConnector(step.connector) ?? (index === 0 ? "start" : "sequential")
    }))
    .filter((step) => step.name);
  return parsed.length
    ? { steps: parsed, userCommand: typeof args.userCommand === "string" ? args.userCommand : undefined }
    : null;
}

export function createRealtimeCommandPlanSubmissionTool(tools: AssistantToolSpec[]): RealtimeFunctionTool {
  return {
    type: "function",
    name: SUBMIT_PLAN_TOOL_NAME.replace(/\./g, "__dot__"),
    description: "Submit one complete Xiaozhuoban command plan for local validation, confirmation, and execution.",
    parameters: {
      type: "object",
      properties: {
        commands: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              module: { type: "string" },
              tool: { type: "string", enum: tools.map((tool) => tool.name) },
              args: { type: "object", additionalProperties: true },
              risk: { type: "string", enum: ["safe", "confirm", "destructive"] },
              confidence: { type: "number" },
              dependsOn: { type: "array", items: { type: "string" } }
            },
            required: ["id", "module", "tool", "args", "risk", "confidence"],
            additionalProperties: false
          }
        },
        executionGroups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              mode: { type: "string", enum: ["sequential", "parallel"] },
              commandIds: { type: "array", items: { type: "string" } }
            },
            required: ["id", "mode", "commandIds"],
            additionalProperties: false
          }
        },
        confidence: { type: "number" },
        needsConfirmation: { type: "boolean" }
      },
      required: ["commands", "executionGroups", "confidence", "needsConfirmation"],
      additionalProperties: false
    }
  };
}

export function createRealtimeCommandPlanUpdate(input: {
  command: string;
  context: CompactAssistantContext;
  tools: AssistantToolSpec[];
  selection: RealtimeTextPlanSelection;
  moduleContexts?: RealtimeScopedModuleContext[];
}) {
  const selectedNames = new Set(input.selection.steps.map((step) => step.name));
  const selectedTools = input.tools.filter(
    (tool) => selectedNames.has(tool.name) || tool.name === ADD_WIDGET_TOOL_NAME || tool.name === "assistant.confirm" || tool.name === "assistant.cancel"
  );
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: [
        createRealtimeContextInstructions(input.context),
        "",
        "# Realtime Complete Plan Stage",
        "根据已选步骤和最小模块上下文生成完整 CommandPlan，并调用 assistant.submit_plan。",
        "必须保留全部步骤、顺序、并行关系和用户参数。不要直接调用具体 UI 工具。",
        "缺少小工具实例时，把 board.add_widget 和后续内容工具写成独立步骤，并用 dependsOn 表达依赖。",
        "不要使用 board.add_widget.followUp；不要编造真实 widgetId，可省略待创建实例的 widgetId，由 Harness 解析。",
        "清空、删除、覆盖等风险动作标记 destructive，并设置 needsConfirmation=true。",
        "",
        `用户完整命令：${input.command}`,
        `已选步骤：${JSON.stringify(input.selection.steps)}`,
        `模块上下文：${JSON.stringify((input.moduleContexts ?? []).map((context) => ({
          moduleType: context.moduleType,
          instances: context.instances,
          stateSummary: context.stateSummary,
          executionPolicy: context.executionPolicy,
          riskPolicy: context.riskPolicy
        })))}`,
        `可执行工具 schema：${JSON.stringify(selectedTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          widgetType: tool.widgetType,
          risk: tool.risk,
          parameters: "jsonSchema" in tool.parameters ? tool.parameters.jsonSchema : undefined
        })))}`
      ].join("\n"),
      audio: createRealtimeSessionAudioConfig(),
      tools: [createRealtimeCommandPlanSubmissionTool(selectedTools)],
      tool_choice: "required",
      parallel_tool_calls: false
    }
  };
}

export function parseRealtimeSubmittedCommandPlan(
  value: unknown,
  input: string,
  tools: AssistantToolSpec[]
): CommandPlan | null {
  const args = parseArguments(value);
  const rawCommands = Array.isArray(args.commands) ? args.commands : [];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const commands: CommandPlan["commands"] = rawCommands
    .filter((command): command is Record<string, unknown> => Boolean(command) && typeof command === "object" && !Array.isArray(command))
    .flatMap((command, index) => {
      const tool = typeof command.tool === "string" ? command.tool : "";
      const spec = toolsByName.get(tool);
      if (!spec) return [];
      return [{
        id: typeof command.id === "string" ? command.id : `cmd_${index + 1}`,
        module: typeof command.module === "string" ? command.module : spec.widgetType ?? tool.split(".")[0] ?? "unknown",
        tool,
        args: command.args && typeof command.args === "object" && !Array.isArray(command.args) ? command.args as Record<string, unknown> : {},
        risk: command.risk === "destructive" || command.risk === "confirm" ? command.risk : spec.risk === "destructive" ? "destructive" : spec.risk === "confirm" ? "confirm" : "safe",
        confidence: typeof command.confidence === "number" ? command.confidence : 0.75,
        dependsOn: Array.isArray(command.dependsOn) ? command.dependsOn.filter((id): id is string => typeof id === "string") : undefined,
        source: "text" as const,
        requiresHarnessValidation: true as const
      }];
    });
  if (!commands.length) return null;
  const commandIds = new Set(commands.map((command) => command.id));
  const rawGroups = Array.isArray(args.executionGroups) ? args.executionGroups : [];
  const executionGroups = rawGroups
    .filter((group): group is Record<string, unknown> => Boolean(group) && typeof group === "object" && !Array.isArray(group))
    .map((group, index) => ({
      id: typeof group.id === "string" ? group.id : `group_${index + 1}`,
      mode: group.mode === "parallel" ? "parallel" as const : "sequential" as const,
      commandIds: Array.isArray(group.commandIds) ? group.commandIds.filter((id): id is string => typeof id === "string" && commandIds.has(id)) : []
    }))
    .filter((group) => group.commandIds.length);
  return {
    id: `realtime_plan_${Date.now()}`,
    sourceText: input,
    normalizedText: input.trim().toLowerCase(),
    commands,
    dependencies: commands.flatMap((command) => (command.dependsOn ?? []).map((from) => ({ from, to: command.id }))),
    executionGroups: executionGroups.length ? executionGroups : [{ id: "group_1", mode: "sequential", commandIds: commands.map((command) => command.id) }],
    confidence: typeof args.confidence === "number" ? args.confidence : Math.min(...commands.map((command) => command.confidence)),
    needsConfirmation: typeof args.needsConfirmation === "boolean" ? args.needsConfirmation : commands.some((command) => command.risk !== "safe"),
    createdBy: "realtime-2",
    requiresHarnessValidation: true
  };
}

export function createToolSelectionPayload(
  request: RealtimeTextToolCallRequest,
  options: { model?: string } = {}
) {
  const toolNames = request.tools.map((tool) => tool.name);
  return {
    model: options.model ?? XIAOZHUOBAN_REALTIME_MODEL,
    input: [
      {
        role: "user",
        content: createRealtimeToolSelectionPrompt(request.input, request.tools, request.moduleCatalog)
      }
    ],
    tools: [
      {
        type: "function",
        name: SELECT_TOOL_NAME.replace(/\./g, "__dot__"),
        description: "Select 1 to 4 candidate Xiaozhuoban tools for the user's command. Do not choose the final execution tool in this stage.",
        parameters: {
          type: "object",
          properties: {
            candidateTools: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: { type: "string", enum: toolNames },
              description: "Candidate registered tool names, ordered by relevance."
            },
            name: { type: "string", enum: toolNames, description: "Backward-compatible first candidate tool name." },
            selectedModule: { type: "string", description: "Selected Xiaozhuoban module type when known." },
            targetHint: { type: "string", description: "Short widget or board target words from the user command." },
            userCommand: { type: "string", description: "A short normalized version of the user's command." },
            confidence: { type: "number" }
          },
          required: ["candidateTools"],
          additionalProperties: false
        }
      }
    ],
    tool_choice: "required",
    parallel_tool_calls: false,
    max_output_tokens: 80
  };
}

function inputMentionsWidgetType(input: string, type: string) {
  return inputMentionsRealtimeWidgetType(input, type);
}

function targetHintMentionsWidget(targetHint: string | undefined, widget: CompactAssistantContext["widgets"][number]) {
  const hint = targetHint ?? "";
  return Boolean(hint) && (hint.includes(widget.name) || hint.includes(widget.type) || inputMentionsWidgetType(hint, widget.type));
}

function getSelectedWidgetType(tool: AssistantToolSpec, selection: RealtimeTextToolSelection, input: string) {
  return (
    selection.selectedModule ||
    tool.widgetType ||
    findRealtimeWidgetType(input, selection.targetHint)
  );
}

function getCandidateToolNames(selection: RealtimeTextToolSelection): string[] {
  const names = Array.isArray(selection.candidateTools)
    ? selection.candidateTools.filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
    : [];
  if (selection.name) names.push(selection.name);
  return [...new Set(names)].slice(0, 4);
}

function getSelectedWidgetTypeForTools(tools: AssistantToolSpec[], selection: RealtimeTextToolSelection, input: string) {
  return (
    selection.selectedModule ||
    tools.find((tool) => tool.widgetType)?.widgetType ||
    findRealtimeWidgetType(input, selection.targetHint)
  );
}

function selectScopedWidgets(
  context: CompactAssistantContext,
  selectedWidgetType: string | undefined,
  selection: RealtimeTextToolSelection
) {
  return context.widgets.filter(
    (widget) =>
      widget.type === selectedWidgetType ||
      (!selectedWidgetType && widget.focused) ||
      targetHintMentionsWidget(selection.targetHint, widget)
  );
}

function canAddWidgetForSelectedTool(context: CompactAssistantContext, selectedWidgetType: string | undefined) {
  return Boolean(selectedWidgetType && context.availableDefinitions?.some((definition) => definition.type === selectedWidgetType));
}

function getExecutableToolsForSelection(
  tools: AssistantToolSpec[],
  selectedTool: AssistantToolSpec,
  scopedContext: CompactAssistantContext,
  selectedWidgetType: string | undefined
) {
  if (!selectedTool.requiresTarget || scopedContext.widgets.length > 0) return [selectedTool];
  if (!canAddWidgetForSelectedTool(scopedContext, selectedWidgetType)) return [selectedTool];
  const addWidgetTool = tools.find((tool) => tool.name === ADD_WIDGET_TOOL_NAME);
  return addWidgetTool ? [addWidgetTool, selectedTool] : [selectedTool];
}

export function createScopedRealtimeContext(
  context: CompactAssistantContext,
  tool: AssistantToolSpec,
  selection: RealtimeTextToolSelection,
  input: string
): CompactAssistantContext {
  return createScopedRealtimeContextForTools(context, [tool], selection, input);
}

export function createScopedRealtimeContextForTools(
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  selection: RealtimeTextToolSelection,
  input: string
): CompactAssistantContext {
  const selectedWidgetType = getSelectedWidgetTypeForTools(tools, selection, input);
  const includeBoards = tools.some((tool) => tool.name.startsWith("board.") || tool.name === "assistant.confirm" || tool.name === "assistant.cancel");
  const needsWidgetContext = tools.some((tool) => tool.requiresTarget || tool.name.startsWith("widget."));
  const widgets = needsWidgetContext ? selectScopedWidgets(context, selectedWidgetType, selection) : [];
  const includeDefinitions = tools.some((tool) => tool.name === ADD_WIDGET_TOOL_NAME || (tool.requiresTarget && widgets.length === 0));

  return {
    contextVersion: context.contextVersion,
    toolCatalogVersion: context.toolCatalogVersion,
    boardId: context.boardId,
    boardName: context.boardName,
    viewport: context.viewport,
    pendingConfirmation: context.pendingConfirmation,
    availableBoards: includeBoards ? context.availableBoards : undefined,
    focusedWidget:
      context.focusedWidget &&
      needsWidgetContext &&
      (!selectedWidgetType || context.focusedWidget.type === selectedWidgetType)
        ? context.focusedWidget
        : undefined,
    widgetCountsByType: context.widgetCountsByType,
    availableDefinitions: includeDefinitions ? context.availableDefinitions ?? [] : undefined,
    widgets
  };
}

function getExecutableToolsForCandidates(
  tools: AssistantToolSpec[],
  candidateTools: AssistantToolSpec[],
  scopedContext: CompactAssistantContext,
  selectedWidgetType: string | undefined
) {
  const addWidgetTool = tools.find((tool) => tool.name === ADD_WIDGET_TOOL_NAME);
  const shouldAddWidget =
    candidateTools.some((tool) => tool.requiresTarget) &&
    scopedContext.widgets.length === 0 &&
    canAddWidgetForSelectedTool(scopedContext, selectedWidgetType) &&
    addWidgetTool &&
    !candidateTools.some((tool) => tool.name === ADD_WIDGET_TOOL_NAME);
  return shouldAddWidget ? [...candidateTools, addWidgetTool] : candidateTools;
}

function relaxMissingWidgetTargetParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const required = Array.isArray(parameters.required)
    ? parameters.required.filter((item) => item !== "widgetId")
    : undefined;
  return {
    ...parameters,
    required: required ?? []
  };
}

export function serializeScopedAssistantToolForRealtime(
  tool: AssistantToolSpec,
  context: CompactAssistantContext
): RealtimeFunctionTool {
  const serialized = serializeAssistantToolForRealtime(tool);
  const shouldRelaxWidgetId = Boolean(
    tool.requiresTarget &&
      tool.widgetType &&
      tool.scope === "widget-detail" &&
      !context.widgets.some((widget) => widget.type === tool.widgetType)
  );
  if (!shouldRelaxWidgetId) return serialized;
  return {
    ...serialized,
    description: `${serialized.description} If no widgetId is available for this widget type, omit widgetId; the local Harness will bind or create the missing widget.`,
    parameters: relaxMissingWidgetTargetParameters(serialized.parameters)
  };
}

export function createScopedToolCallPayload(
  request: RealtimeTextToolCallRequest,
  selection: RealtimeTextToolSelection,
  options: { model?: string } = {}
) {
  const candidateNames = getCandidateToolNames(selection);
  const candidateTools = request.tools.filter((candidate) => candidateNames.includes(candidate.name));
  const tool = candidateTools[0];
  if (!tool || !request.context) {
    return {
      model: options.model ?? XIAOZHUOBAN_REALTIME_MODEL,
      input: [
        {
          role: "user",
          content: [
            "# Text Command Fallback",
            "缺少已选工具或局部上下文，因此不能生成可执行工具调用。",
            `候选工具：${candidateNames.join(", ") || "未选择"}`,
            `用户命令：${request.input}`
          ].join("\n")
        }
      ],
      tools: [],
      tool_choice: "none",
      parallel_tool_calls: false,
      max_output_tokens: 80
    };
  }
  const scopedContext = createScopedRealtimeContextForTools(request.context, candidateTools, selection, request.input);
  const selectedWidgetType = getSelectedWidgetTypeForTools(candidateTools, selection, request.input);
  const executableTools = getExecutableToolsForCandidates(request.tools, candidateTools, scopedContext, selectedWidgetType);
  return {
    model: options.model ?? XIAOZHUOBAN_REALTIME_MODEL,
    input: [
      {
        role: "user",
        content: [
          createRealtimeContextInstructions(scopedContext),
          request.moduleContext
            ? [
                "",
                "# Selected Module Scoped Context",
                JSON.stringify({
                  moduleType: request.moduleContext.moduleType,
                  instances: request.moduleContext.instances,
                  stateSummary: request.moduleContext.stateSummary,
                  shortcutExamples: request.moduleContext.shortcutExamples,
                  executionPolicy: request.moduleContext.executionPolicy,
                  riskPolicy: request.moduleContext.riskPolicy
                })
              ].join("\n")
            : "",
          "",
          "# Text Command Fallback",
          "现在根据原始用户命令、候选工具和最小必要上下文，选择最终工具并返回可执行工具调用。",
          "复杂命令可以调用多个已提供工具；需要顺序时按原始命令顺序依次调用，互不依赖时可以并发调用。",
          "不要访问未提供的桌面上下文；如果缺少目标或信息不足，不要调用工具。",
          executableTools.some((candidate) => candidate.name === ADD_WIDGET_TOOL_NAME) && tool.name !== ADD_WIDGET_TOOL_NAME
            ? `如果当前没有 ${selectedWidgetType ?? "目标"} 小工具实例，但 availableDefinitions 中有对应定义，可以调用 board.add_widget，并在 followUp 中填写候选工具之一及原始参数。`
            : "",
          "",
          "# Original User Command",
          request.input,
          "",
          `候选工具：${executableTools.map((candidate) => candidate.name).join(", ")}`,
          selection.targetHint ? `目标提示：${selection.targetHint}` : "",
          `用户命令：${request.input}`
        ]
          .filter(Boolean)
          .join("\n")
      }
    ],
    tools: executableTools.map((candidate) => serializeScopedAssistantToolForRealtime(candidate, scopedContext)),
    tool_choice: executableTools.length ? "auto" : "none",
    parallel_tool_calls: true,
    max_output_tokens: 120
  };
}

export function createScopedRealtimeToolInstructions(
  context: CompactAssistantContext,
  selection: RealtimeTextToolSelection,
  input: string,
  moduleContext?: RealtimeScopedModuleContext
) {
  const candidateNames = getCandidateToolNames(selection);
  return [
    createRealtimeContextInstructions(context),
    moduleContext
      ? [
          "",
          "# Selected Module Scoped Context",
          JSON.stringify({
            moduleType: moduleContext.moduleType,
            instances: moduleContext.instances,
            stateSummary: moduleContext.stateSummary,
            shortcutExamples: moduleContext.shortcutExamples,
            executionPolicy: moduleContext.executionPolicy,
            riskPolicy: moduleContext.riskPolicy
          })
        ].join("\n")
      : "",
    "",
    "# Candidate Tool Stage",
    "现在根据原始用户命令、候选工具完整上下文和当前桌面上下文，选择最终工具并返回可执行 function_call。",
    "原始用户命令是最高优先级；不要只根据候选工具名称猜意图。",
    "如果可以执行，直接调用工具；不要先说话，不要输出“我来处理”“稍等”等语音或文字。",
    "复杂命令可以调用多个已提供工具。需要顺序时按原始命令顺序依次调用；互不依赖时可以并发调用。",
    "只调用候选工具列表中实际提供的工具；不要调用未提供的工具，不要访问未提供的桌面上下文。",
    candidateNames.some((name) => name.startsWith("music."))
      ? "音乐工具选择规则：用户说播放、放一首、来一首、来个、想听、听点，且命令里有具体歌手、乐队、歌曲名、专辑名或英文曲名时，必须选择 music.play，并把原始歌手/歌曲写入 query；即使需要先搜索试听源，也不要改成 music.search。只有用户明确说搜索、找、搜、推荐，或明确说不一定播放、暂时不播放、先不播放、先不要播放、别播放时，才选择 music.search，绝不要再调用 music.play。恢复、继续、接着播、继续刚才的音乐选择 music.resume；上一首选择 music.previous；下一首选择 music.next。"
      : "",
    candidateNames.some((name) => name.startsWith("tv."))
      ? "电视工具选择规则：用户说播放、看、想看、打开电视播放、只说播放电视时调用 tv.play；用户明确说切到、换到、切换到某频道且不是播放请求时才调用 tv.select_channel；原始命令同时包含“全屏”且工具列表提供 tv.fullscreen 时，必须在播放/切台后继续调用 tv.fullscreen。"
      : "",
    candidateNames.includes("board.add_widget")
      ? "如果用户只是打开、添加、显示某个小工具，才调用 board.add_widget，并从 availableDefinitions 选择匹配 definitionId。"
      : "",
    candidateNames.includes("board.add_widget")
      ? "如果原始命令包含播放、搜索、写入、设置、切换、查询等内容动作，优先调用对应内容工具；即使当前缺少小工具实例，也不要把最终工具改成 board.add_widget，Harness 会负责绑定或创建缺失实例。"
      : "",
    candidateNames.includes("board.add_widget")
      ? "用户只说“时钟”时默认打开 dialClock/表盘时钟；只有明确说“世界时钟、世界时间、时区、东京时间、纽约时间”等才打开 worldClock。"
      : "",
    !candidateNames.includes("board.add_widget") && context.widgets.length === 0 && (context.availableDefinitions?.length ?? 0) > 0
      ? `如果当前没有目标小工具实例，但工具列表提供了 board.add_widget，可以先用匹配的 definitionId 调用 board.add_widget，并在 followUp 中填写候选工具之一及原始参数。`
      : "",
    "如果缺少目标或信息不足，不要猜测参数，直接简短说明需要澄清。",
    "",
    "# Original User Command",
    input,
    "",
    `候选工具：${candidateNames.join(", ") || selection.name || "未选择"}`,
    selection.targetHint ? `目标提示：${selection.targetHint}` : "",
    `用户命令：${input}`
  ]
    .filter(Boolean)
    .join("\n");
}

export function createScopedRealtimeToolUpdate(
  request: RealtimeTextToolCallRequest,
  selection: RealtimeTextToolSelection
) {
  const candidateNames = getCandidateToolNames(selection);
  const candidateTools = request.tools.filter((candidate) => candidateNames.includes(candidate.name));
  if (!candidateTools.length || !request.context) return null;
  const scopedContext = createScopedRealtimeContextForTools(request.context, candidateTools, selection, request.input);
  const selectedWidgetType = getSelectedWidgetTypeForTools(candidateTools, selection, request.input);
  const executableTools = getExecutableToolsForCandidates(request.tools, candidateTools, scopedContext, selectedWidgetType);
  return {
    type: "session.update",
    session: {
      type: "realtime",
      instructions: createScopedRealtimeToolInstructions(scopedContext, selection, request.input, request.moduleContext),
      audio: createRealtimeSessionAudioConfig(),
      tools: executableTools.map((candidate) => serializeScopedAssistantToolForRealtime(candidate, scopedContext)),
      tool_choice: executableTools.length ? "required" : "none",
      parallel_tool_calls: true
    }
  };
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function findResponsesFunctionCall(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "function_call" && typeof record.name === "string") return record;
  for (const key of ["output", "items", "content"]) {
    const items = record[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const found = findResponsesFunctionCall(item);
      if (found) return found;
    }
  }
  return null;
}

export function extractAssistantToolCallFromResponsesPayload(
  payload: unknown,
  allowedToolNames: Set<string>
): AssistantToolCall | null {
  const functionCall = findResponsesFunctionCall(payload);
  if (!functionCall || typeof functionCall.name !== "string") return null;
  const name = decodeRealtimeToolName(functionCall.name);
  if (!allowedToolNames.has(name)) return null;
  return {
    id:
      typeof functionCall.call_id === "string"
        ? functionCall.call_id
        : typeof functionCall.id === "string"
          ? functionCall.id
          : `model_${Date.now()}`,
    name,
    arguments: parseArguments(functionCall.arguments),
    source: "text"
  };
}

export function extractToolSelectionFromResponsesPayload(
  payload: unknown,
  allowedToolNames: Set<string>
): RealtimeTextToolSelection | null {
  const functionCall = findResponsesFunctionCall(payload);
  if (!functionCall || decodeRealtimeToolName(String(functionCall.name)) !== SELECT_TOOL_NAME) return null;
  const args = parseArguments(functionCall.arguments);
  const candidateTools = Array.isArray(args.candidateTools)
    ? args.candidateTools.filter((name): name is string => typeof name === "string" && allowedToolNames.has(name)).slice(0, 4)
    : [];
  const name = typeof args.name === "string" && allowedToolNames.has(args.name)
    ? args.name
    : candidateTools[0] ?? "";
  if (!name) return null;
  const selectedModule = typeof args.selectedModule === "string" ? args.selectedModule : undefined;
  const intent = typeof args.intent === "string" ? args.intent : undefined;
  const parsedSelection: RealtimeTextToolSelection = {
    name,
    ...(candidateTools.length ? { candidateTools } : {}),
    ...(selectedModule ? { selectedModule } : {}),
    ...(intent ? { intent } : {}),
    ...(typeof args.targetHint === "string" ? { targetHint: args.targetHint } : {}),
    ...(typeof args.userCommand === "string" ? { userCommand: args.userCommand } : {}),
    ...(typeof args.confidence === "number" ? { confidence: args.confidence } : {})
  };
  return parsedSelection;
}

export function parseRealtimeTextToolCallResponse(value: unknown): AssistantToolCall | null {
  if (!value || typeof value !== "object") return null;
  const call = (value as Record<string, unknown>).call;
  if (!call || typeof call !== "object") return null;
  const record = call as Record<string, unknown>;
  if (typeof record.name !== "string") return null;
  return {
    id: typeof record.id === "string" ? record.id : `model_${Date.now()}`,
    name: record.name,
    arguments: parseArguments(record.arguments),
    source: "text"
  };
}

export function parseRealtimeTextToolSelectionResponse(value: unknown): RealtimeTextToolSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = (value as Record<string, unknown>).selection;
  if (!selection || typeof selection !== "object") return null;
  const record = selection as Record<string, unknown>;
  const candidateTools = Array.isArray(record.candidateTools)
    ? record.candidateTools.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).slice(0, 4)
    : [];
  const name = typeof record.name === "string" ? record.name : candidateTools[0];
  const selectedModule = typeof record.selectedModule === "string" ? record.selectedModule : undefined;
  const intent = typeof record.intent === "string" ? record.intent : undefined;
  if (!name) return null;
  const parsedSelection: RealtimeTextToolSelection = {
    name,
    ...(candidateTools.length ? { candidateTools } : {}),
    ...(selectedModule ? { selectedModule } : {}),
    ...(intent ? { intent } : {}),
    ...(typeof record.targetHint === "string" ? { targetHint: record.targetHint } : {}),
    ...(typeof record.userCommand === "string" ? { userCommand: record.userCommand } : {}),
    ...(typeof record.confidence === "number" ? { confidence: record.confidence } : {})
  };
  return parsedSelection;
}

export function parseRealtimeTextPlanSelectionResponse(value: unknown): RealtimeTextPlanSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = (value as Record<string, unknown>).planSelection;
  if (!selection || typeof selection !== "object") return null;
  const steps = (selection as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) return null;
  const parsed = steps
    .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object" && !Array.isArray(step))
    .map((step) => ({
      id: typeof step.id === "string" ? step.id : undefined,
      name: typeof step.name === "string" ? step.name : "",
      selectedModule: typeof step.selectedModule === "string" ? step.selectedModule : undefined,
      targetHint: typeof step.targetHint === "string" ? step.targetHint : undefined,
      confidence: typeof step.confidence === "number" ? step.confidence : undefined,
      connector: parsePlanConnector(step.connector)
    }))
    .filter((step) => step.name);
  return parsed.length > 0 ? { steps: parsed } : null;
}

export function parseRealtimeCommandPlanResponse(value: unknown): CommandPlan | null {
  if (!value || typeof value !== "object") return null;
  const plan = (value as Record<string, unknown>).plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const record = plan as Record<string, unknown>;
  if (!Array.isArray(record.commands)) return null;
  return record as unknown as CommandPlan;
}
