import { z } from "zod";

export type WorkbenchPresentationMode = "closed" | "desktop-rail" | "mobile-push";

export const workbenchTaskStatuses = [
  "queued",
  "running",
  "response_ready",
  "executing",
  "awaiting_confirmation",
  "succeeded",
  "failed",
  "cancelled"
] as const;

export const WorkbenchTaskStatusSchema = z.enum(workbenchTaskStatuses);
export type WorkbenchTaskStatus = z.infer<typeof WorkbenchTaskStatusSchema>;

export const WorkbenchCommandSchema = z.object({
  type: z.string().trim().min(1).max(96).regex(/^[a-z0-9_.-]+$/i),
  version: z.number().int().positive().default(1),
  args: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(8).max(160)
});

export type WorkbenchCommand = z.infer<typeof WorkbenchCommandSchema>;
export type WorkbenchCommandRisk = "safe" | "confirm" | "destructive";

export const WorkbenchArtifactSchema = z.object({
  id: z.string().trim().min(1).max(160).nullable().optional(),
  kind: z.enum(["file", "image", "note", "link"]),
  name: z.string().trim().min(1).max(240),
  storagePath: z.string().trim().max(1024).nullable().optional(),
  url: z.string().url().nullable().optional(),
  mimeType: z.string().trim().max(160).nullable().optional()
});

export const WorkbenchAgentResultSchema = z.object({
  reply: z.string().trim().min(1).max(12_000),
  commands: z.array(WorkbenchCommandSchema).max(24).default([]),
  artifacts: z.array(WorkbenchArtifactSchema).max(24).default([]),
  needsConfirmation: z.boolean().default(false)
});

export type WorkbenchAgentResult = z.infer<typeof WorkbenchAgentResultSchema>;

export interface WorkbenchTopic {
  id: string;
  userId: string;
  boardId?: string | null;
  title: string;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WorkbenchFileRole = "primary" | "context" | "generated";

export interface WorkbenchFile {
  id: string;
  userId: string;
  topicId: string;
  role: WorkbenchFileRole;
  name: string;
  mimeType?: string | null;
  storagePath?: string | null;
  extractedText?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkbenchDirection {
  id: string;
  userId: string;
  topicId: string;
  text: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkbenchRecord {
  id: string;
  userId: string;
  topicId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkbenchTask {
  id: string;
  userId: string;
  topicId?: string | null;
  prompt: string;
  status: WorkbenchTaskStatus;
  responseId?: string | null;
  reply?: string | null;
  error?: string | null;
  result?: WorkbenchAgentResult | null;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkbenchCommandDefinition {
  type: string;
  risk: WorkbenchCommandRisk;
  description: string;
}

const definitions = [
  { type: "workbench.topic.create", risk: "safe", description: "Create a workbench topic." },
  { type: "workbench.topic.rename", risk: "safe", description: "Rename a workbench topic." },
  { type: "workbench.topic.select", risk: "safe", description: "Select a workbench topic." },
  { type: "workbench.note.create", risk: "safe", description: "Create a note in the active topic." },
  { type: "workbench.direction.add", risk: "safe", description: "Add a discussion direction." },
  { type: "workbench.direction.complete", risk: "safe", description: "Complete a discussion direction." },
  { type: "workbench.window.open", risk: "safe", description: "Open a workbench tool window." },
  { type: "workbench.window.close", risk: "safe", description: "Close a workbench tool window." },
  { type: "workbench.file.move", risk: "confirm", description: "Move a file between workbench areas." },
  { type: "workbench.file.delete", risk: "destructive", description: "Delete a workbench file." },
  { type: "workbench.topic.delete", risk: "destructive", description: "Delete a topic and its content." }
] as const satisfies readonly WorkbenchCommandDefinition[];

export const WORKBENCH_COMMAND_DEFINITIONS: readonly WorkbenchCommandDefinition[] = definitions;
const definitionByType = new Map(definitions.map((definition) => [definition.type, definition]));

export function getWorkbenchCommandDefinition(type: string): WorkbenchCommandDefinition | null {
  return definitionByType.get(type as (typeof definitions)[number]["type"]) ?? null;
}

export function validateWorkbenchCommand(value: unknown):
  | { ok: true; command: WorkbenchCommand; definition: WorkbenchCommandDefinition }
  | { ok: false; error: string } {
  const parsed = WorkbenchCommandSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: "INVALID_COMMAND" };
  const definition = getWorkbenchCommandDefinition(parsed.data.type);
  if (!definition) return { ok: false, error: "UNKNOWN_COMMAND" };
  return { ok: true, command: parsed.data, definition };
}

export function partitionWorkbenchCommands(commands: readonly WorkbenchCommand[]) {
  const safe: WorkbenchCommand[] = [];
  const confirmation: WorkbenchCommand[] = [];
  const rejected: WorkbenchCommand[] = [];
  for (const command of commands) {
    const validated = validateWorkbenchCommand(command);
    if (!validated.ok) {
      rejected.push(command);
    } else if (validated.definition.risk === "safe") {
      safe.push(validated.command);
    } else {
      confirmation.push(validated.command);
    }
  }
  return { safe, confirmation, rejected };
}

export const WORKBENCH_BACKGROUND_MODEL = "gpt-5.6-luna";
export const WORKBENCH_IMAGE_MODEL = "gpt-image-2";
export const WORKBENCH_REALTIME_MODEL = "gpt-realtime-2.1-mini";
export const WORKBENCH_STORAGE_BUCKET = "workbench-files";
