import {
  DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS,
  OPENAI_REALTIME_CLIENT_SECRET_URL,
  REALTIME_COMMAND_EXECUTION_TOOL_NAME,
  REALTIME_TOOL_SELECTION_TOOL_NAME,
  XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL,
  XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL,
  XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
  XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL,
  XIAOZHUOBAN_REALTIME_MINI_MODEL,
  XIAOZHUOBAN_REALTIME_MODEL,
  clampRealtimeClientSecretTtl,
  createRealtimeClientSecretPayload as createCoreRealtimeClientSecretPayload,
  createRealtimeInputTranscription,
  createRealtimeTurnDetection,
  encodeRealtimeToolName,
  resolveXiaozhuobanRealtimeModel,
  type RealtimeFunctionTool,
  type RealtimeReasoningEffort,
  type RealtimeSemanticVadEagerness,
  type RealtimeSessionOptions
} from "@xiaozhuoban/assistant-core";

export {
  DEFAULT_REALTIME_CLIENT_SECRET_TTL_SECONDS,
  OPENAI_REALTIME_CLIENT_SECRET_URL,
  REALTIME_COMMAND_EXECUTION_TOOL_NAME,
  REALTIME_TOOL_SELECTION_TOOL_NAME,
  XIAOZHUOBAN_DEFAULT_TEXT_TOOL_MODEL,
  XIAOZHUOBAN_REALTIME_HIGH_ACCURACY_MODEL,
  XIAOZHUOBAN_REALTIME_INSTRUCTIONS,
  XIAOZHUOBAN_REALTIME_INPUT_TRANSCRIPTION_MODEL,
  XIAOZHUOBAN_REALTIME_MINI_MODEL,
  XIAOZHUOBAN_REALTIME_MODEL,
  clampRealtimeClientSecretTtl,
  createRealtimeInputTranscription,
  createRealtimeTurnDetection,
  encodeRealtimeToolName,
  resolveXiaozhuobanRealtimeModel
};

export type { RealtimeFunctionTool, RealtimeReasoningEffort, RealtimeSemanticVadEagerness, RealtimeSessionOptions };

type JsonObjectSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

type InitialToolMetadata = {
  name: string;
  description: string;
};

export type InitialRealtimeSessionHints = {
  initialToolHints?: InitialToolMetadata[];
  initialModuleTypes?: string[];
};

const fallbackInitialToolMetadata: InitialToolMetadata[] = [
  { name: "board.add_widget", description: "Add an existing widget definition to the current Xiaozhuoban board." },
  { name: "widget.focus", description: "Focus an existing widget on the current Xiaozhuoban board." },
  { name: "widget.fullscreen_focus", description: "Enter fullscreen focus for an existing widget when supported." },
  { name: "widget.remove", description: "Close a widget window on the current board." },
  { name: "widget.move", description: "Move a widget to a new board position." },
  { name: "widget.resize", description: "Resize a widget only when its existing panel supports resizing." },
  { name: "widget.bring_to_front", description: "Bring a widget to the front when layer changes are available." },
  { name: "board.auto_align", description: "Auto-align widgets on the current board. Requires confirmation." },
  { name: "board.switch", description: "Switch to another Xiaozhuoban board." },
  { name: "board.create", description: "Create a new Xiaozhuoban board." },
  { name: "board.rename", description: "Rename an existing Xiaozhuoban board." }
];

const fallbackInitialModuleTypes = [
  "calculator",
  "clipboard",
  "converter",
  "countdown",
  "dialClock",
  "headline",
  "market",
  "messageBoard",
  "music",
  "note",
  "recorder",
  "todo",
  "translate",
  "tv",
  "weather",
  "worldClock"
];

function stringSchema() {
  return { type: "string" };
}

function objectSchema(properties: Record<string, unknown>, required?: string[], additionalProperties = false): JsonObjectSchema {
  return {
    type: "object",
    properties,
    ...(required?.length ? { required } : {}),
    additionalProperties
  };
}

export function createRealtimeToolSelectionTool(
  tools: InitialToolMetadata[],
  moduleTypes: string[] = fallbackInitialModuleTypes
): RealtimeFunctionTool {
  const toolSummary = tools.map((tool) => `${tool.name}: ${tool.description}`).join("; ");
  return {
    type: "function",
    name: encodeRealtimeToolName(REALTIME_TOOL_SELECTION_TOOL_NAME),
    description: `Select the single best registered Xiaozhuoban tool before any desktop context is provided. Available tools: ${toolSummary}`,
    parameters: objectSchema(
      {
        name: {
          type: "string",
          enum: tools.map((tool) => tool.name),
          description: "Selected registered tool name."
        },
        selectedModule: {
          type: "string",
          enum: moduleTypes,
          description: "Selected Xiaozhuoban module type when known, such as countdown, music, or tv."
        },
        targetHint: {
          type: "string",
          description: "Short target words copied from the user's command."
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

export function createInitialRealtimeTools(hints: InitialRealtimeSessionHints = {}): RealtimeFunctionTool[] {
  return [
    createRealtimeToolSelectionTool(
      hints.initialToolHints?.length ? hints.initialToolHints : fallbackInitialToolMetadata,
      hints.initialModuleTypes?.length ? hints.initialModuleTypes : fallbackInitialModuleTypes
    ),
    createRealtimeCommandExecutionTool()
  ];
}

export function createRealtimeClientSecretPayload(options: RealtimeSessionOptions & InitialRealtimeSessionHints = {}) {
  return createCoreRealtimeClientSecretPayload({
    ...options,
    tools: createInitialRealtimeTools(options)
  });
}
