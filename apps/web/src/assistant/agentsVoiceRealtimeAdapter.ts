import type {
  AssistantToolCall,
  AssistantToolResult,
  AssistantToolSpec,
  CompactAssistantContext,
  WidgetAssistantRegistry
} from "@xiaozhuoban/assistant-core";
import type { FunctionTool, RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import type { AssistantRealtimeAdapter } from "./AssistantHarness";
import type { AssistantDiagnosticEvent } from "./assistantDiagnostics";
import {
  createRealtimeSessionAudioConfig,
  encodeRealtimeToolName,
  createInitialRealtimeToolSpecs,
  REALTIME_COMMAND_EXECUTION_TOOL_NAME,
  XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL,
  XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
  XIAOZHUOBAN_REALTIME_MODEL
} from "./realtimeSessionConfig";
import {
  createRealtimeToolResultEvents,
  createRealtimeSessionRequestBody,
  extractRealtimeSessionErrorMessage,
  parseRealtimeFunctionCallEvent,
  shouldHandleRealtimeFunctionCall,
  type OpenAIRealtimeWebRtcAdapterOptions,
  type RealtimeConnectionStatus
} from "./openaiRealtimeAdapter";
import {
  createRealtimeToolSelectionInstructions,
  createRealtimeToolSelectionTool,
  createScopedRealtimeToolUpdate,
  REALTIME_TOOL_SELECTION_TOOL_NAME,
  type RealtimeTextToolSelection
} from "./realtimeTextToolCall";

type AgentsRealtimeSdk = typeof import("@openai/agents/realtime");
type RealtimeEvent = Record<string, unknown>;

type ToolCallDetailsLike = {
  toolCall?: {
    callId?: string;
    id?: string;
  };
};

type RealtimeSessionAudioConfig = ReturnType<typeof createRealtimeSessionAudioConfig>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function extractClientSecret(payload: unknown): string {
  if (!isRecord(payload)) return "";
  if (typeof payload.value === "string") return payload.value;
  const clientSecret = payload.client_secret;
  if (typeof clientSecret === "string") return clientSecret;
  if (isRecord(clientSecret) && typeof clientSecret.value === "string") return clientSecret.value;
  return "";
}

function parseCommandToolInput(input: unknown): string {
  const value = typeof input === "string" ? safeParseJson(input) : input;
  if (isRecord(value) && typeof value.command === "string") return value.command.trim();
  return "";
}

function parseSelectionToolInput(input: unknown, allowedToolNames: Set<string>): RealtimeTextToolSelection | null {
  const value = typeof input === "string" ? safeParseJson(input) : input;
  if (!isRecord(value)) return null;
  const candidateTools = Array.isArray(value.candidateTools)
    ? value.candidateTools.filter((name): name is string => typeof name === "string" && allowedToolNames.has(name)).slice(0, 4)
    : [];
  const name = typeof value.name === "string" && allowedToolNames.has(value.name)
    ? value.name
    : candidateTools[0] ?? "";
  if (!name) return null;
  return {
    name,
    ...(candidateTools.length ? { candidateTools } : {}),
    ...(typeof value.selectedModule === "string" ? { selectedModule: value.selectedModule } : {}),
    ...(typeof value.intent === "string" ? { intent: value.intent } : {}),
    ...(typeof value.targetHint === "string" ? { targetHint: value.targetHint } : {}),
    ...(typeof value.userCommand === "string" ? { userCommand: value.userCommand } : {}),
    ...(typeof value.confidence === "number" ? { confidence: value.confidence } : {})
  };
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function createCommandTraceId(prefix = "sdk_voice") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createBearerHeaders(token: string | undefined, extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra };
  if (token?.trim()) headers.authorization = `Bearer ${token.trim()}`;
  return headers;
}

function resolveAgentsRealtimeModel(options: Pick<OpenAIRealtimeWebRtcAdapterOptions, "model" | "getHighAccuracyMode">): string {
  return options.model ?? (options.getHighAccuracyMode?.() ? XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL : XIAOZHUOBAN_REALTIME_MODEL);
}

function extractToolCallId(details: unknown): string {
  if (!isRecord(details) || !isRecord(details.toolCall)) return "";
  const callId = details.toolCall.callId;
  if (typeof callId === "string") return callId;
  const id = details.toolCall.id;
  return typeof id === "string" ? id : "";
}

function toAgentsRealtimeAudioConfig(audio: RealtimeSessionAudioConfig) {
  return {
    input: {
      turnDetection: audio.input.turn_detection,
      transcription: audio.input.transcription
    },
    output: audio.output
  };
}

type AgentsToolSelectionOptions = Pick<OpenAIRealtimeWebRtcAdapterOptions, "onDiagnostic"> & {
  getTools: () => AssistantToolSpec[];
  getContext: () => CompactAssistantContext | null;
  getModuleRegistry: () => WidgetAssistantRegistry | null;
  sendEvent: (event: RealtimeEvent, commandTraceId?: string) => void;
  setActiveSelection: (selection: RealtimeTextToolSelection & { selectedToolName?: string }, commandTraceId?: string) => void;
};

export function createAgentsToolSelectionTool(
  sdk: Pick<AgentsRealtimeSdk, "tool">,
  options: AgentsToolSelectionOptions
): FunctionTool {
  const tools = options.getTools();
  const selectionTool = createRealtimeToolSelectionTool(tools, options.getModuleRegistry()?.getRealtimeCatalog() ?? []);
  return sdk.tool({
    name: selectionTool.name,
    description: selectionTool.description,
    strict: true,
    parameters: selectionTool.parameters as never,
    execute: async (input, _context, details?: ToolCallDetailsLike) => {
      const callId = extractToolCallId(details) || createCommandTraceId("sdk_select_call");
      const commandTraceId = createCommandTraceId("sdk_select");
      const currentTools = options.getTools();
      const currentContext = options.getContext();
      const selection = parseSelectionToolInput(input, new Set(currentTools.map((tool) => tool.name)));
      if (!selection || !currentContext) {
        const result: AssistantToolResult = {
          status: "needs_clarification",
          message: "我需要再确认要操作哪个工具或小工具。",
          errorCode: "TOOL_SELECTION_CONTEXT_MISSING"
        };
        return JSON.stringify(result);
      }
      const selectedModule =
        selection.selectedModule ??
        currentTools.find((tool) => tool.name === selection.name)?.widgetType ??
        options.getModuleRegistry()?.findModuleForTool(selection.name)?.type;
      const resolvedSelection = { ...selection, ...(selectedModule ? { selectedModule } : {}) };
      const moduleContext = selectedModule
        ? options.getModuleRegistry()?.getScopedContextForModule(selectedModule, {
            userText: resolvedSelection.userCommand || resolvedSelection.targetHint || resolvedSelection.name,
            selectedToolHint: resolvedSelection.candidateTools?.join(",") || resolvedSelection.name,
            compactContext: currentContext,
            tools: currentTools
          }) ?? undefined
        : undefined;
      const update = createScopedRealtimeToolUpdate(
        {
          input: resolvedSelection.userCommand || resolvedSelection.targetHint || resolvedSelection.name,
          context: currentContext,
          tools: currentTools,
          moduleContext
        },
        resolvedSelection
      );
      if (!update) {
        const result: AssistantToolResult = {
          status: "failed",
          message: `未知工具：${resolvedSelection.name}`,
          errorCode: "UNKNOWN_SELECTED_TOOL"
        };
        return JSON.stringify(result);
      }
      options.setActiveSelection(resolvedSelection, commandTraceId);
      options.sendEvent(update, commandTraceId);
      options.onDiagnostic?.({
        type: "agents.realtime.tool_selection.success",
        status: "success",
        operationId: callId,
        toolName: REALTIME_TOOL_SELECTION_TOOL_NAME,
        commandTraceId,
        data: {
          candidateTools: resolvedSelection.candidateTools,
          selectedTool: resolvedSelection.name,
          selectedModule,
          targetHint: resolvedSelection.targetHint
        }
      });
      const result: AssistantToolResult = {
        status: "success",
        message: "已选择候选工具，正在读取所需上下文。",
        data: {
          selectedTool: resolvedSelection.name,
          candidateTools: resolvedSelection.candidateTools,
          selectedModule,
          targetHint: resolvedSelection.targetHint
        }
      };
      return JSON.stringify(result);
    }
  });
}

export function createAgentsCommandExecutionTool(
  sdk: Pick<AgentsRealtimeSdk, "tool">,
  options: Pick<OpenAIRealtimeWebRtcAdapterOptions, "onCommand" | "onDiagnostic">
): FunctionTool {
  return sdk.tool({
    name: encodeRealtimeToolName(REALTIME_COMMAND_EXECUTION_TOOL_NAME),
    description:
      "Execute a Xiaozhuoban desktop command through the local Harness. Use this for UI control, widget playback, timers, TV, music, market, weather, time, and window operations.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The user's original command or the shortest equivalent command to execute."
        }
      },
      required: ["command"],
      additionalProperties: false
    },
    execute: async (input, _context, details?: ToolCallDetailsLike) => {
      const command = parseCommandToolInput(input);
      const callId = extractToolCallId(details) || createCommandTraceId("sdk_call");
      const commandTraceId = createCommandTraceId();
      if (!command) {
        const result: AssistantToolResult = {
          status: "failed",
          message: "Realtime 没有提供可执行命令。",
          errorCode: "REALTIME_COMMAND_EMPTY"
        };
        return JSON.stringify(result);
      }
      if (!options.onCommand) {
        const result: AssistantToolResult = {
          status: "failed",
          message: "SDK adapter 缺少本地执行入口。",
          errorCode: "REALTIME_COMMAND_HANDLER_MISSING"
        };
        return JSON.stringify(result);
      }
      options.onDiagnostic?.({
        type: "agents.realtime.command_tool",
        status: "started",
        commandTraceId,
        operationId: callId,
        data: { command }
      });
      const result = await options.onCommand(command, { callId, commandTraceId });
      return JSON.stringify(result);
    }
  });
}

export class AgentsVoiceRealtimeAdapter implements AssistantRealtimeAdapter {
  private session: RealtimeSession | null = null;
  private agent: RealtimeAgent | null = null;
  private currentTools: AssistantToolSpec[] = [];
  private currentContext: CompactAssistantContext | null = null;
  private moduleRegistry: WidgetAssistantRegistry | null = null;
  private activeCommandTraceId: string | null = null;
  private activeScopedToolSelection: (RealtimeTextToolSelection & { selectedToolName?: string }) | null = null;
  private handledFunctionCallIds = new Set<string>();
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly options: OpenAIRealtimeWebRtcAdapterOptions = {}) {}

  private emitDiagnostic(event: AssistantDiagnosticEvent): void {
    this.options.onDiagnostic?.({
      ...event,
      commandTraceId: event.commandTraceId ?? this.activeCommandTraceId ?? undefined
    });
  }

  setActiveCommandTraceId(commandTraceId: string | null): void {
    this.activeCommandTraceId = commandTraceId;
  }

  updateTools(tools: AssistantToolSpec[]): void {
    this.currentTools = tools;
    this.emitDiagnostic({ type: "agents.realtime.tools.cached", status: "cached", data: { toolCount: tools.length } });
  }

  updateContext(context: CompactAssistantContext): void {
    this.currentContext = context;
    this.emitDiagnostic({ type: "agents.realtime.context.cached", status: "cached", data: { widgetCount: context.widgets.length } });
  }

  updateModules(registry: WidgetAssistantRegistry): void {
    this.moduleRegistry = registry;
    this.emitDiagnostic({
      type: "agents.realtime.modules.cached",
      status: "cached",
      data: { moduleCount: registry.getRealtimeCatalog().length }
    });
  }

  sendToolResult(_call: AssistantToolCall, _result: AssistantToolResult): void {
    this.emitDiagnostic({
      type: "agents.realtime.tool_result.send",
      status: _result.status,
      operationId: _call.id,
      toolName: _call.name,
      message: _result.message,
      errorCode: _result.errorCode
    });
    createRealtimeToolResultEvents(_call, _result, { responseMode: "voice" }).forEach((event) => this.sendTransportEvent(event));
    this.activeScopedToolSelection = null;
    this.sendToolSelectionReset();
  }

  connectTextOnly(): Promise<void> {
    throw new Error("REALTIME_TEXT_ONLY_UNAVAILABLE");
  }

  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    const promise = this.connectInternal().finally(() => {
      if (this.connectPromise === promise) this.connectPromise = null;
    });
    this.connectPromise = promise;
    return promise;
  }

  private async connectInternal(): Promise<void> {
    this.options.onStatusChange?.("connecting");
    this.emitDiagnostic({ type: "agents.realtime.connect.start", status: "connecting" });
    const sdk = await import("@openai/agents/realtime");
    const accessToken = await this.options.getAccessToken?.();
    const model = resolveAgentsRealtimeModel(this.options);
    const highAccuracy = !this.options.model && Boolean(this.options.getHighAccuracyMode?.());
    const sessionResponse = await (this.options.fetchImpl ?? fetch)(this.options.sessionEndpoint ?? "/api/realtime/session", {
      method: "POST",
      headers: createBearerHeaders(accessToken, { "content-type": "application/json" }),
      body: createRealtimeSessionRequestBody(this.options.getSafetyIdentifier?.(), {
        highAccuracy,
        initialTools: this.currentTools,
        moduleCatalog: this.moduleRegistry?.getRealtimeCatalog() ?? []
      })
    });
    if (!sessionResponse.ok) {
      let message = "REALTIME_SESSION_FAILED";
      try {
        message = extractRealtimeSessionErrorMessage(await sessionResponse.json(), message);
      } catch {
        // Keep the generic message if the endpoint returns non-JSON.
      }
      this.options.onStatusChange?.("session_failed");
      this.emitDiagnostic({ type: "agents.realtime.session.failed", status: String(sessionResponse.status), message });
      throw new Error(message);
    }
    const secret = extractClientSecret(await sessionResponse.json());
    if (!secret) {
      this.options.onStatusChange?.("session_failed");
      this.emitDiagnostic({ type: "agents.realtime.session.failed", status: "missing_client_secret", errorCode: "REALTIME_CLIENT_SECRET_MISSING" });
      throw new Error("REALTIME_CLIENT_SECRET_MISSING");
    }

    const effectiveTools = this.getEffectiveSessionTools();
    const moduleCatalog = this.moduleRegistry?.getRealtimeCatalog() ?? [];
    this.agent = new sdk.RealtimeAgent({
      name: "Xiaozhuoban",
      instructions: [
        XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
        "",
        createRealtimeToolSelectionInstructions(effectiveTools, moduleCatalog)
      ].join("\n"),
      tools: [
        createAgentsToolSelectionTool(sdk, {
          onDiagnostic: this.options.onDiagnostic,
          getTools: () => this.getEffectiveSessionTools(),
          getContext: () => this.currentContext,
          getModuleRegistry: () => this.moduleRegistry,
          sendEvent: (event, commandTraceId) => this.sendTransportEvent(event, commandTraceId),
          setActiveSelection: (selection, commandTraceId) => {
            this.activeCommandTraceId = commandTraceId ?? this.activeCommandTraceId;
            this.activeScopedToolSelection = selection;
          }
        }),
        createAgentsCommandExecutionTool(sdk, this.options)
      ]
    });
    this.session = new sdk.RealtimeSession(this.agent, {
      transport: "webrtc",
      model,
      tracingDisabled: true,
      historyStoreAudio: false,
      config: {
        audio: toAgentsRealtimeAudioConfig(createRealtimeSessionAudioConfig()),
        outputModalities: ["text", "audio"],
        parallelToolCalls: false
      }
    });
    this.session.on("error", (event: unknown) => {
      this.emitDiagnostic({ type: "agents.realtime.error", status: "failed", data: { event } });
    });
    this.session.on("transport_event", (event: unknown) => {
      if (!isRecord(event) || typeof event.type !== "string") return;
      if (event.type.endsWith(".delta")) return;
      this.emitDiagnostic({ type: "agents.realtime.transport_event", status: event.type, data: { type: event.type } });
      this.handleTransportFunctionCall(event);
    });
    this.emitDiagnostic({
      type: "agents.realtime.session.created",
      status: "success",
      data: {
        model,
        highAccuracy,
        cachedToolCount: this.currentTools.length,
        cachedWidgetCount: this.currentContext?.widgets.length ?? 0
      }
    });
    await this.session.connect({ apiKey: secret, model });
    this.options.onStatusChange?.("connected");
    this.emitDiagnostic({ type: "agents.realtime.connect.result", status: "connected" });
  }

  sendTextCommand(input: string, options: { commandTraceId?: string } = {}): void {
    if (!this.session) {
      throw new Error("REALTIME_TEXT_CHANNEL_NOT_READY");
    }
    const commandTraceId = options.commandTraceId ?? createCommandTraceId("sdk_text");
    this.activeCommandTraceId = commandTraceId;
    this.session.sendMessage(input, { commandTraceId });
    this.emitDiagnostic({ type: "agents.realtime.text_command.sent", status: "sent", commandTraceId, data: { input } });
  }

  disconnect(): void {
    this.session?.close();
    this.session = null;
    this.agent = null;
    this.connectPromise = null;
    this.activeScopedToolSelection = null;
    this.handledFunctionCallIds.clear();
    this.options.onStatusChange?.("disconnected");
    this.emitDiagnostic({ type: "agents.realtime.disconnect", status: "disconnected" });
  }

  private getEffectiveSessionTools(): AssistantToolSpec[] {
    return this.currentTools.length > 0 ? this.currentTools : createInitialRealtimeToolSpecs();
  }

  private createToolSelectionSessionUpdate(): RealtimeEvent {
    const tools = this.getEffectiveSessionTools();
    const moduleCatalog = this.moduleRegistry?.getRealtimeCatalog() ?? [];
    const tool = createRealtimeToolSelectionTool(tools, moduleCatalog);
    return {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: [
          XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
          "",
          createRealtimeToolSelectionInstructions(tools, moduleCatalog)
        ].join("\n"),
        audio: createRealtimeSessionAudioConfig(),
        tools: [tool],
        tool_choice: "auto",
        parallel_tool_calls: false
      }
    };
  }

  private sendToolSelectionReset(): void {
    this.sendTransportEvent(this.createToolSelectionSessionUpdate(), this.activeCommandTraceId ?? undefined);
  }

  private sendTransportEvent(event: RealtimeEvent, commandTraceId?: string): void {
    this.emitDiagnostic({
      type: "agents.realtime.event.send",
      status: this.session ? "sent" : "dropped",
      commandTraceId,
      data: { eventType: typeof event.type === "string" ? event.type : "unknown" }
    });
    const transport = (this.session as unknown as { transport?: { sendEvent?: (event: RealtimeEvent) => void } } | null)?.transport;
    transport?.sendEvent?.(event);
  }

  private handleTransportFunctionCall(event: unknown): void {
    let call: AssistantToolCall | null = null;
    try {
      call = parseRealtimeFunctionCallEvent(event);
    } catch {
      return;
    }
    if (!shouldHandleRealtimeFunctionCall(call, this.handledFunctionCallIds)) return;
    if (call.name === REALTIME_TOOL_SELECTION_TOOL_NAME || call.name === REALTIME_COMMAND_EXECUTION_TOOL_NAME) return;
    if (!this.getEffectiveSessionTools().some((tool) => tool.name === call?.name)) return;
    const transcript =
      this.activeScopedToolSelection?.userCommand ||
      this.activeScopedToolSelection?.targetHint ||
      this.activeCommandTraceId ||
      undefined;
    const toolCall: AssistantToolCall = {
      ...call,
      transcript
    };
    this.emitDiagnostic({
      type: "agents.realtime.function_call.tool",
      status: "received",
      operationId: toolCall.id,
      toolName: toolCall.name,
      data: { argumentKeys: isRecord(toolCall.arguments) ? Object.keys(toolCall.arguments) : [] }
    });
    void this.options.onFunctionCall?.(toolCall);
  }
}
