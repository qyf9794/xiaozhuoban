import {
  DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS,
  OPENAI_REALTIME_CLIENT_SECRET_URL,
  REALTIME_TOOL_SELECTION_TOOL_NAME,
  REALTIME_COMMAND_EXECUTION_TOOL_NAME,
  ToolScopeManager,
  XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL,
  XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL,
  XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
  XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL,
  XIAOZHUOBAN_REALTIME_MINI_MODEL,
  XIAOZHUOBAN_REALTIME_MODEL,
  clampRealtimeClientSecretTtl,
  createRealtimeClientSecretPayload as createCoreRealtimeClientSecretPayload,
  createRealtimeInputTranscription,
  createRealtimeSessionAudioConfig,
  createRealtimeTurnDetection,
  decodeRealtimeToolName,
  encodeRealtimeToolName,
  resolveXiaozhuobanRealtimeModel,
  type AssistantParameterSchema,
  type CompactAssistantContext,
  type RealtimeReasoningEffort,
  type RealtimeSemanticVadEagerness,
  type RealtimeSessionOptions,
  type AssistantToolScopeKind,
  type AssistantToolSpec,
  type RealtimeFunctionTool
} from "@xiaozhuoban/assistant-core";

export {
  DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS,
  OPENAI_REALTIME_CLIENT_SECRET_URL,
  REALTIME_TOOL_SELECTION_TOOL_NAME,
  REALTIME_COMMAND_EXECUTION_TOOL_NAME,
  XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL,
  XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL,
  XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
  XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL,
  XIAOZHUOBAN_REALTIME_MINI_MODEL,
  XIAOZHUOBAN_REALTIME_MODEL,
  clampRealtimeClientSecretTtl,
  createRealtimeInputTranscription,
  createRealtimeSessionAudioConfig,
  createRealtimeTurnDetection,
  decodeRealtimeToolName,
  encodeRealtimeToolName,
  resolveXiaozhuobanRealtimeModel
};

export type { RealtimeReasoningEffort, RealtimeSemanticVadEagerness, RealtimeSessionOptions };
export type { RealtimeFunctionTool };

type JsonObjectSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

type InitialToolMetadata = {
  name: string;
  description: string;
  scope: AssistantToolScopeKind;
  risk?: AssistantToolSpec["risk"];
  parameters: JsonObjectSchema;
};

function formatRealtimeContextList(items: string[], fallback: string) {
  return items.length > 0 ? items.join("\n") : fallback;
}

export function createRealtimeContextInstructions(context?: CompactAssistantContext): string {
  if (!context) return XIAOZHUOBAN_REALTIME_INSTRUCTIONS;

  const boardName = context.boardName ?? context.boardId ?? "当前桌板";
  const focused = context.focusedWidget
    ? `${context.focusedWidget.name}(${context.focusedWidget.type}, widgetId=${context.focusedWidget.widgetId})`
    : "无";
  const widgets = formatRealtimeContextList(
    context.widgets.map((widget) => {
      const flags = [widget.focused ? "focused" : "", widget.recent ? "recent" : ""].filter(Boolean).join(",");
      const position = widget.position ? ` position=${Math.round(widget.position.x)},${Math.round(widget.position.y)}` : "";
      const size = widget.size ? ` size=${Math.round(widget.size.w)}x${Math.round(widget.size.h)}` : "";
      return `- ${widget.name}(${widget.type}) widgetId=${widget.widgetId} definitionId=${widget.definitionId}${position}${size} summary=${widget.summary}${flags ? ` flags=${flags}` : ""}`;
    }),
    "- 当前桌板没有已加载小工具"
  );
  const definitions = formatRealtimeContextList(
    (context.availableDefinitions ?? []).map(
      (definition) => `- ${definition.name}(${definition.type}) definitionId=${definition.definitionId}`
    ),
    "- 没有可添加组件定义摘要"
  );
  const pending = context.pendingConfirmation
    ? `${context.pendingConfirmation.actionName}: ${context.pendingConfirmation.message}`
    : "无";
  const viewport = context.viewport
    ? `${context.viewport.mode} ${context.viewport.width}x${context.viewport.height}${context.viewport.fullscreen ? " fullscreen" : ""}`
    : "未知";

  return [
    XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
    "",
    "# Current Xiaozhuoban Context",
    `- board: ${boardName}`,
    `- viewport: ${viewport}`,
    `- focusedWidget: ${focused}`,
    `- pendingConfirmation: ${pending}`,
    "- loadedWidgets:",
    widgets,
    "- availableDefinitions:",
    definitions
  ].join("\n");
}

const initialToolMetadata: InitialToolMetadata[] = [
  {
    name: "app.sidebar.set",
    description: "Show, hide, or toggle the Xiaozhuoban sidebar.",
    scope: "desktop",
    parameters: objectSchema({
      open: booleanSchema(),
      mode: { type: "string", enum: ["show", "hide", "toggle"] }
    })
  },
  {
    name: "app.fullscreen.set",
    description: "Enter, exit, or toggle Xiaozhuoban page fullscreen.",
    scope: "desktop",
    parameters: objectSchema({
      enabled: booleanSchema(),
      mode: { type: "string", enum: ["enter", "exit", "toggle"] }
    })
  },
  {
    name: "app.settings.open",
    description: "Open the Xiaozhuoban settings menu.",
    scope: "desktop",
    parameters: objectSchema({})
  },
  {
    name: "app.command_palette.open",
    description: "Open the Xiaozhuoban command/search palette.",
    scope: "desktop",
    parameters: objectSchema({})
  },
  {
    name: "app.ai_dialog.open",
    description: "Open the AI widget creation dialog.",
    scope: "desktop",
    parameters: objectSchema({})
  },
  {
    name: "app.wallpaper.pick",
    description: "Open the Xiaozhuoban wallpaper or desktop background picker.",
    scope: "desktop",
    parameters: objectSchema({})
  },
  {
    name: "board.add_widget",
    description: "Add an existing widget definition to the current Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema(
      {
        definitionId: stringSchema(),
        mobileMode: booleanSchema(),
        followUp: objectSchema({ name: stringSchema(), arguments: objectSchema({}, undefined, true) }, ["name"])
      },
      ["definitionId"]
    )
  },
  {
    name: "widget.focus",
    description: "Focus an existing widget on the current Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema() }, ["widgetId"])
  },
  {
    name: "widget.fullscreen_focus",
    description: "Enter fullscreen focus for an existing widget when supported.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema() }, ["widgetId"])
  },
  {
    name: "widget.remove",
    description: "Close a widget window on the current board.",
    scope: "desktop",
    risk: "safe",
    parameters: objectSchema({ widgetId: stringSchema() }, ["widgetId"])
  },
  {
    name: "widget.move",
    description: "Move a widget to a new board position.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema(), x: numberSchema(), y: numberSchema() }, ["widgetId"])
  },
  {
    name: "widget.resize",
    description: "Resize a widget only when its existing panel supports resizing.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema(), w: numberSchema(), h: numberSchema() }, ["widgetId", "w", "h"])
  },
  {
    name: "widget.bring_to_front",
    description: "Bring a widget to the front when layer changes are available.",
    scope: "desktop",
    parameters: objectSchema({ widgetId: stringSchema() }, ["widgetId"])
  },
  {
    name: "board.auto_align",
    description: "Auto-align widgets on the current board. Requires confirmation.",
    scope: "desktop",
    risk: "confirm",
    parameters: objectSchema({ viewportWidth: numberSchema(), mobileMode: booleanSchema() })
  },
  {
    name: "board.switch",
    description: "Switch to another Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema({ boardId: stringSchema() }, ["boardId"])
  },
  {
    name: "board.create",
    description: "Create a new Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema({ name: stringSchema() })
  },
  {
    name: "board.rename",
    description: "Rename an existing Xiaozhuoban board.",
    scope: "desktop",
    parameters: objectSchema({ boardId: stringSchema(), name: stringSchema() }, ["boardId", "name"])
  },
  {
    name: "gomoku.play",
    description: "Play a Gomoku move when a registered game action is available.",
    scope: "deferred",
    parameters: objectSchema({})
  }
];

function stringSchema() {
  return { type: "string" };
}

function numberSchema() {
  return { type: "number" };
}

function booleanSchema() {
  return { type: "boolean" };
}

function objectSchema(properties: Record<string, unknown>, required?: string[], additionalProperties = false): JsonObjectSchema {
  return {
    type: "object",
    properties,
    ...(required?.length ? { required } : {}),
    additionalProperties
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesJsonSchemaType(value: unknown, type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((entry) => {
    if (entry === "null") return value === null;
    if (entry === "array") return Array.isArray(value);
    if (entry === "object") return isRecord(value);
    return typeof entry === "string" && typeof value === entry;
  });
}

function validateJsonObjectSchema(value: unknown, schema: JsonObjectSchema): { success: true; data: Record<string, unknown> } | { success: false; message: string } {
  if (!isRecord(value)) {
    return { success: false, message: "参数必须是对象" };
  }
  const keys = Object.keys(schema.properties);
  const required = new Set(schema.required ?? []);
  for (const key of required) {
    if (value[key] === undefined) {
      return { success: false, message: `${key} 参数必填` };
    }
  }
  if (schema.additionalProperties === false) {
    const extra = Object.keys(value).find((key) => !keys.includes(key));
    if (extra) return { success: false, message: `${extra} 未声明参数` };
  }
  for (const key of keys) {
    const current = value[key];
    if (current === undefined) continue;
    const field = schema.properties[key];
    if (!isRecord(field)) continue;
    if (field.type && !matchesJsonSchemaType(current, field.type)) {
      return { success: false, message: `${key} 参数类型不匹配` };
    }
    if (Array.isArray(field.enum) && !field.enum.includes(current)) {
      return { success: false, message: `${key} 参数不在允许范围内` };
    }
    if (field.type === "object" && isRecord(current) && isRecord(field.properties)) {
      const nested = validateJsonObjectSchema(current, field as JsonObjectSchema);
      if (!nested.success) return nested;
    }
  }
  return { success: true, data: value };
}

function createJsonSchemaParameterSchema(
  jsonSchema: JsonObjectSchema
): AssistantParameterSchema<Record<string, unknown>> & { argumentKeys: string[]; jsonSchema: JsonObjectSchema } {
  const argumentKeys = Object.keys(jsonSchema.properties);
  return {
    argumentKeys,
    jsonSchema,
    safeParse(value) {
      const result = validateJsonObjectSchema(value, jsonSchema);
      if (result.success) return result;
      return { success: false, error: { issues: [{ message: result.message }] } };
    }
  };
}

function toAssistantToolSpec(metadata: InitialToolMetadata): AssistantToolSpec<Record<string, unknown>> {
  const parameters = createJsonSchemaParameterSchema(metadata.parameters);
  return {
    name: metadata.name,
    description: metadata.description,
    parameters,
    argumentKeys: parameters.argumentKeys,
    risk: metadata.risk,
    scope: metadata.scope
  };
}

export function createInitialRealtimeToolSpecs(): AssistantToolSpec[] {
  const specs = initialToolMetadata.map(toAssistantToolSpec);
  return new ToolScopeManager(specs).getInitialTools();
}

export function createInitialRealtimeTools(): RealtimeFunctionTool[] {
  return [createRealtimeToolSelectionTool(createInitialRealtimeToolSpecs()), createRealtimeCommandExecutionTool()];
}

export function createInitialRegisteredRealtimeTools(): RealtimeFunctionTool[] {
  const initialNames = new Set(createInitialRealtimeToolSpecs().map((tool) => tool.name));
  return initialToolMetadata
    .filter((metadata) => initialNames.has(metadata.name))
    .map((metadata) => serializeAssistantToolForRealtime(toAssistantToolSpec(metadata), metadata.parameters));
}

function selectionModuleTypes(tools: AssistantToolSpec[]): string[] {
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
      ...tools.map((tool) => tool.widgetType).filter((type): type is string => Boolean(type))
    ])
  ].sort((left, right) => left.localeCompare(right));
}

export function createRealtimeToolSelectionTool(tools: AssistantToolSpec[]): RealtimeFunctionTool {
  return {
    type: "function",
    name: encodeRealtimeToolName(REALTIME_TOOL_SELECTION_TOOL_NAME),
    description: "Select the single best registered Xiaozhuoban tool before any desktop context is provided.",
    parameters: objectSchema(
      {
        name: {
          type: "string",
          enum: tools.map((tool) => tool.name),
          description: "Selected registered tool name."
        },
        selectedModule: {
          type: "string",
          enum: selectionModuleTypes(tools),
          description: "Selected Xiaozhuoban module type when known."
        },
        targetHint: {
          type: "string",
          description: "Short target words copied from the user's command. For completion commands, copy the item text, e.g. 买咖啡豆."
        },
        userCommand: {
          type: "string",
          description: "A short normalized version of the user's command."
        },
        confidence: { type: "number" }
      },
      ["name"]
    )
  };
}

export function createRealtimeCommandExecutionTool(): RealtimeFunctionTool {
  return {
    type: "function",
    name: encodeRealtimeToolName(REALTIME_COMMAND_EXECUTION_TOOL_NAME),
    description:
      "Fallback only: execute a Xiaozhuoban command through the local harness when tool selection or scoped session updates are unavailable. Do not use as the normal UI-control path.",
    parameters: objectSchema(
      {
        command: {
          type: "string",
          description: "The user's original command or the shortest equivalent command to execute."
        }
      },
      ["command"]
    )
  };
}

export function serializeAssistantToolForRealtime(
  tool: AssistantToolSpec,
  parameters?: Record<string, unknown>
): RealtimeFunctionTool {
  const resolvedParameters = parameters ?? inferAssistantToolParameters(tool);
  return {
    type: "function",
    name: encodeRealtimeToolName(tool.name),
    description: tool.description,
    parameters: resolvedParameters
  };
}

function inferAssistantToolParameters(tool: AssistantToolSpec): Record<string, unknown> {
  switch (tool.name) {
    case "board.add_widget":
      return objectSchema(
        {
          definitionId: stringSchema(),
          mobileMode: booleanSchema(),
          followUp: objectSchema({ name: stringSchema(), arguments: objectSchema({}, undefined, true) }, ["name"])
        },
        ["definitionId"]
      );
    case "widget.focus":
    case "widget.fullscreen_focus":
    case "widget.remove":
    case "widget.bring_to_front":
      return objectSchema({ widgetId: stringSchema() }, ["widgetId"]);
    case "widget.move":
      return objectSchema({ widgetId: stringSchema(), x: numberSchema(), y: numberSchema() }, ["widgetId"]);
    case "widget.resize":
      return objectSchema({ widgetId: stringSchema(), w: numberSchema(), h: numberSchema() }, ["widgetId", "w", "h"]);
    case "board.switch":
      return objectSchema({ boardId: stringSchema() }, ["boardId"]);
    case "board.rename":
      return objectSchema({ boardId: stringSchema(), name: stringSchema() }, ["boardId", "name"]);
    case "board.create":
      return objectSchema({ name: stringSchema() });
    case "app.sidebar.set":
      return objectSchema({
        open: booleanSchema(),
        mode: { type: "string", enum: ["show", "hide", "toggle"] }
      });
    case "app.fullscreen.set":
      return objectSchema({
        enabled: booleanSchema(),
        mode: { type: "string", enum: ["enter", "exit", "toggle"] }
      });
    case "app.settings.open":
    case "app.command_palette.open":
    case "app.ai_dialog.open":
    case "app.wallpaper.pick":
      return objectSchema({});
    default:
      return tool.requiresTarget
        ? objectSchema({ widgetId: stringSchema() }, ["widgetId"], true)
        : objectSchema({}, undefined, true);
  }
}

export function createRealtimeClientSecretPayload(options: RealtimeSessionOptions = {}) {
  return createCoreRealtimeClientSecretPayload({
    ...options,
    instructions: createRealtimeContextInstructions(),
    tools: createInitialRealtimeTools()
  });
}
