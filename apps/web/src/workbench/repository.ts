import type {
  WorkbenchDirection,
  WorkbenchFile,
  WorkbenchRecord,
  WorkbenchTask,
  WorkbenchTopic
} from "@xiaozhuoban/workbench-core";
import { WORKBENCH_STORAGE_BUCKET } from "@xiaozhuoban/workbench-core";
import { supabase, supabaseConfigError } from "../lib/supabase";

type WorkbenchSnapshot = {
  topics: WorkbenchTopic[];
  files: WorkbenchFile[];
  directions: WorkbenchDirection[];
  records: WorkbenchRecord[];
  tasks: WorkbenchTask[];
};

const emptySnapshot: WorkbenchSnapshot = { topics: [], files: [], directions: [], records: [], tasks: [] };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapTopic(row: Record<string, unknown>): WorkbenchTopic {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    boardId: typeof row.board_id === "string" ? row.board_id : null,
    title: asString(row.title),
    summary: typeof row.summary === "string" ? row.summary : null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at)
  };
}

function mapFile(row: Record<string, unknown>): WorkbenchFile {
  const role = row.role === "context" || row.role === "generated" ? row.role : "primary";
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    topicId: asString(row.topic_id),
    role,
    name: asString(row.name),
    mimeType: typeof row.mime_type === "string" ? row.mime_type : null,
    storagePath: typeof row.storage_path === "string" ? row.storage_path : null,
    extractedText: typeof row.extracted_text === "string" ? row.extracted_text : null,
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at)
  };
}

function mapDirection(row: Record<string, unknown>): WorkbenchDirection {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    topicId: asString(row.topic_id),
    text: asString(row.text),
    completed: row.completed === true,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at)
  };
}

function mapRecord(row: Record<string, unknown>): WorkbenchRecord {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    topicId: asString(row.topic_id),
    title: asString(row.title),
    content: asString(row.content),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at)
  };
}

export function mapWorkbenchTask(row: Record<string, unknown>): WorkbenchTask {
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    topicId: typeof row.topic_id === "string" ? row.topic_id : null,
    prompt: asString(row.prompt),
    status: (asString(row.status) || "queued") as WorkbenchTask["status"],
    responseId: typeof row.response_id === "string" ? row.response_id : null,
    reply: typeof row.reply === "string" ? row.reply : null,
    error: typeof row.error === "string" ? row.error : null,
    result: row.result && typeof row.result === "object" ? (row.result as WorkbenchTask["result"]) : null,
    unread: row.unread !== false,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at)
  };
}

export async function loadWorkbenchSnapshot(userId: string): Promise<WorkbenchSnapshot> {
  if (supabaseConfigError) return emptySnapshot;
  const [topics, files, directions, records, tasks] = await Promise.all([
    supabase.from("workbench_topics").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("workbench_files").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("workbench_directions").select("*").eq("user_id", userId).order("sort_order", { ascending: true }),
    supabase.from("workbench_records").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("workbench_tasks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
  ]);
  const firstError = topics.error ?? files.error ?? directions.error ?? records.error ?? tasks.error;
  if (firstError) throw new Error(firstError.message);
  return {
    topics: (topics.data ?? []).map((row) => mapTopic(row as Record<string, unknown>)),
    files: (files.data ?? []).map((row) => mapFile(row as Record<string, unknown>)),
    directions: (directions.data ?? []).map((row) => mapDirection(row as Record<string, unknown>)),
    records: (records.data ?? []).map((row) => mapRecord(row as Record<string, unknown>)),
    tasks: (tasks.data ?? []).map((row) => mapWorkbenchTask(row as Record<string, unknown>))
  };
}

export async function insertWorkbenchTopic(input: { id: string; userId: string; boardId?: string; title: string }) {
  if (supabaseConfigError) return;
  const { error } = await supabase.from("workbench_topics").insert({
    id: input.id,
    user_id: input.userId,
    board_id: input.boardId ?? null,
    title: input.title
  });
  if (error) throw new Error(error.message);
}

export async function insertWorkbenchDirection(input: WorkbenchDirection) {
  if (supabaseConfigError) return;
  const { error } = await supabase.from("workbench_directions").insert({
    id: input.id,
    user_id: input.userId,
    topic_id: input.topicId,
    text: input.text,
    completed: input.completed,
    sort_order: input.sortOrder
  });
  if (error) throw new Error(error.message);
}

function sanitizeFileName(name: string) {
  return name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "file";
}

export async function uploadWorkbenchFile(input: {
  id: string;
  userId: string;
  topicId: string;
  role: WorkbenchFile["role"];
  file: File;
}): Promise<WorkbenchFile> {
  const now = new Date().toISOString();
  const storagePath = `${input.userId}/${input.topicId}/${input.id}/${sanitizeFileName(input.file.name)}`;
  const record: WorkbenchFile = {
    id: input.id,
    userId: input.userId,
    topicId: input.topicId,
    role: input.role,
    name: input.file.name,
    mimeType: input.file.type || null,
    storagePath,
    extractedText: null,
    sizeBytes: input.file.size,
    createdAt: now,
    updatedAt: now
  };
  if (supabaseConfigError) return record;
  const upload = await supabase.storage.from(WORKBENCH_STORAGE_BUCKET).upload(storagePath, input.file, {
    cacheControl: "3600",
    upsert: false,
    contentType: input.file.type || undefined
  });
  if (upload.error) throw new Error(upload.error.message);
  const { error } = await supabase.from("workbench_files").insert({
    id: record.id,
    user_id: record.userId,
    topic_id: record.topicId,
    role: record.role,
    name: record.name,
    mime_type: record.mimeType,
    storage_path: record.storagePath,
    size_bytes: record.sizeBytes
  });
  if (error) {
    await supabase.storage.from(WORKBENCH_STORAGE_BUCKET).remove([storagePath]);
    throw new Error(error.message);
  }
  return record;
}

export async function createWorkbenchSignedUrl(storagePath: string) {
  if (supabaseConfigError) return "";
  const { data, error } = await supabase.storage.from(WORKBENCH_STORAGE_BUCKET).createSignedUrl(storagePath, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function updateWorkbenchDirectionCompleted(id: string, completed: boolean) {
  if (supabaseConfigError) return;
  const { error } = await supabase.from("workbench_directions").update({ completed }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markWorkbenchTaskRead(id: string) {
  if (supabaseConfigError) return;
  const { error } = await supabase.from("workbench_tasks").update({ unread: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export function subscribeToWorkbenchTasks(userId: string, onTask: (task: WorkbenchTask) => void) {
  if (supabaseConfigError) return () => undefined;
  const channel = supabase
    .channel(`workbench-tasks:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "workbench_tasks", filter: `user_id=eq.${userId}` },
      (payload) => {
        if (payload.new && typeof payload.new === "object") {
          onTask(mapWorkbenchTask(payload.new as Record<string, unknown>));
        }
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
