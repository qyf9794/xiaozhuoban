import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { ResponseInput, ResponseInputContent } from "openai/resources/responses/responses";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WORKBENCH_BACKGROUND_MODEL,
  WorkbenchAgentResultSchema,
  partitionWorkbenchCommands,
  type WorkbenchAgentResult,
  type WorkbenchCommand,
  type WorkbenchTask
} from "@xiaozhuoban/workbench-core";
import { createWorkbenchAdminClient } from "./server.js";

const agentResultJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "commands", "artifacts", "needsConfirmation"],
  properties: {
    reply: { type: "string" },
    commands: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "version", "args", "idempotencyKey"],
        properties: {
          type: { type: "string" },
          version: { type: "integer", minimum: 1 },
          args: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "topicId", "content", "text", "sortOrder", "directionId", "role", "fileId", "window"],
            properties: {
              id: { type: ["string", "null"] },
              title: { type: ["string", "null"] },
              topicId: { type: ["string", "null"] },
              content: { type: ["string", "null"] },
              text: { type: ["string", "null"] },
              sortOrder: { type: ["number", "null"] },
              directionId: { type: ["string", "null"] },
              role: { type: ["string", "null"] },
              fileId: { type: ["string", "null"] },
              window: { type: ["string", "null"] }
            }
          },
          idempotencyKey: { type: "string", minLength: 8 }
        }
      }
    },
    artifacts: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "name", "storagePath", "url", "mimeType"],
        properties: {
          id: { type: ["string", "null"] },
          kind: { type: "string", enum: ["file", "image", "note", "link"] },
          name: { type: "string" },
          storagePath: { type: ["string", "null"] },
          url: { type: ["string", "null"] },
          mimeType: { type: ["string", "null"] }
        }
      }
    },
    needsConfirmation: { type: "boolean" }
  }
} as const;

function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  return new OpenAI({ apiKey });
}

function safetyIdentifier(userId: string) {
  return `xz_workbench_${createHash("sha256").update(userId).digest("base64url")}`;
}

function mapTask(row: Record<string, unknown>): WorkbenchTask {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    topicId: typeof row.topic_id === "string" ? row.topic_id : null,
    prompt: String(row.prompt ?? ""),
    status: String(row.status ?? "queued") as WorkbenchTask["status"],
    responseId: typeof row.response_id === "string" ? row.response_id : null,
    reply: typeof row.reply === "string" ? row.reply : null,
    error: typeof row.error === "string" ? row.error : null,
    result: row.result && typeof row.result === "object" ? (row.result as WorkbenchAgentResult) : null,
    unread: row.unread !== false,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

async function buildTaskInput(
  supabase: SupabaseClient,
  input: { userId: string; topicId?: string | null; selectedFileId?: string | null; prompt: string }
): Promise<ResponseInput> {
  const context: string[] = [];
  const content: ResponseInputContent[] = [{ type: "input_text", text: input.prompt }];
  if (input.topicId) {
    const [topic, files, directions, notes] = await Promise.all([
      supabase.from("workbench_topics").select("id,title,summary").eq("id", input.topicId).eq("user_id", input.userId).maybeSingle(),
      supabase.from("workbench_files").select("id,name,role,mime_type,storage_path,extracted_text").eq("topic_id", input.topicId).eq("user_id", input.userId).limit(24),
      supabase.from("workbench_directions").select("text,completed,sort_order").eq("topic_id", input.topicId).eq("user_id", input.userId).order("sort_order"),
      supabase.from("workbench_notes").select("title,content").eq("topic_id", input.topicId).eq("user_id", input.userId).limit(12)
    ]);
    if (topic.data) context.push(`主题：${topic.data.title}\n摘要：${topic.data.summary ?? ""}`);
    if (directions.data?.length) context.push(`讨论方向：\n${directions.data.map((item) => `- [${item.completed ? "x" : " "}] ${item.text}`).join("\n")}`);
    if (notes.data?.length) context.push(`已有笔记：\n${notes.data.map((item) => `## ${item.title}\n${String(item.content).slice(0, 4000)}`).join("\n")}`);
    if (files.data?.length) {
      context.push(`文件：\n${files.data.map((item) => `- ${item.name} (${item.role}, ${item.mime_type || "unknown"})`).join("\n")}`);
      for (const file of files.data) {
        if (file.extracted_text) context.push(`文件内容 ${file.name}：\n${String(file.extracted_text).slice(0, 12_000)}`);
        if (file.id === input.selectedFileId && String(file.mime_type || "").startsWith("image/") && file.storage_path) {
          const signed = await supabase.storage.from("workbench-files").createSignedUrl(String(file.storage_path), 600);
          if (signed.data?.signedUrl) content.push({ type: "input_image", image_url: signed.data.signedUrl, detail: "auto" });
        }
      }
    }
  }
  if (context.length) content.unshift({ type: "input_text", text: `以下是已授权的工作台上下文：\n\n${context.join("\n\n")}` });
  return [{ type: "message", role: "user", content }];
}

export async function createDurableWorkbenchTask(input: {
  userId: string;
  topicId?: string | null;
  selectedFileId?: string | null;
  prompt: string;
}) {
  const supabase = createWorkbenchAdminClient();
  if (input.topicId) {
    const topic = await supabase
      .from("workbench_topics")
      .select("id")
      .eq("id", input.topicId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (topic.error) throw new Error(topic.error.message);
    if (!topic.data) throw new Error("WORKBENCH_TOPIC_NOT_FOUND");
  }
  if (input.selectedFileId) {
    const file = await supabase
      .from("workbench_files")
      .select("id,topic_id")
      .eq("id", input.selectedFileId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (file.error) throw new Error(file.error.message);
    if (!file.data || (input.topicId && file.data.topic_id !== input.topicId)) {
      throw new Error("WORKBENCH_FILE_NOT_FOUND");
    }
  }
  const taskId = `task_${randomUUID()}`;
  const { data: inserted, error: insertError } = await supabase
    .from("workbench_tasks")
    .insert({ id: taskId, user_id: input.userId, topic_id: input.topicId ?? null, prompt: input.prompt, status: "queued", unread: true })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);
  try {
    const client = createOpenAIClient();
    const response = await client.responses.create({
      model: process.env.WORKBENCH_BACKGROUND_MODEL || WORKBENCH_BACKGROUND_MODEL,
      background: true,
      store: true,
      safety_identifier: safetyIdentifier(input.userId),
      metadata: { workbench_task_id: taskId },
      instructions: [
        "你是小桌板 AI 工作台的后台分析器。完成复杂分析、识图、生图或联网研究。",
        "只能返回符合 schema 的结果。reply 给用户可直接播报；commands 只能使用已允许的 workbench.* 命令。",
        "不要把普通回答伪装成操作命令，不要生成 shell、SQL、网络请求或任意代码执行命令。",
        "允许命令：workbench.topic.create、workbench.topic.rename、workbench.topic.select、workbench.note.create、workbench.direction.add、workbench.direction.complete、workbench.window.open、workbench.window.close、workbench.file.move、workbench.file.delete、workbench.topic.delete。",
        "删除和移动命令必须将 needsConfirmation 设为 true。每个命令必须提供稳定且唯一的 idempotencyKey。",
        "commands.args 中未使用的字段必须返回 null；artifacts 中不可用的可选值也必须返回 null。"
      ].join("\n"),
      input: await buildTaskInput(supabase, input),
      tools: [{ type: "web_search" }, { type: "image_generation" }],
      text: {
        format: {
          type: "json_schema",
          name: "workbench_agent_result",
          strict: true,
          schema: agentResultJsonSchema
        }
      }
    });
    const { data, error } = await supabase
      .from("workbench_tasks")
      .update({ status: response.status === "queued" ? "queued" : "running", response_id: response.id })
      .eq("id", taskId)
      .eq("user_id", input.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapTask(data as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "WORKBENCH_BACKGROUND_CREATE_FAILED";
    await supabase.from("workbench_tasks").update({ status: "failed", error: message }).eq("id", taskId).eq("user_id", input.userId);
    throw error;
  }
}

async function recordCommandExecution(supabase: SupabaseClient, task: WorkbenchTask, command: WorkbenchCommand, status: string, error?: string) {
  await supabase.from("workbench_command_executions").upsert(
    {
      id: `cmd_${createHash("sha256").update(`${task.userId}:${command.idempotencyKey}`).digest("hex").slice(0, 32)}`,
      user_id: task.userId,
      task_id: task.id,
      command_type: command.type,
      idempotency_key: command.idempotencyKey,
      args: command.args,
      status,
      error: error ?? null
    },
    { onConflict: "user_id,idempotency_key" }
  );
}

function throwIfQueryFailed(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

async function executeCommand(supabase: SupabaseClient, task: WorkbenchTask, command: WorkbenchCommand) {
  const existing = await supabase
    .from("workbench_command_executions")
    .select("status")
    .eq("user_id", task.userId)
    .eq("idempotency_key", command.idempotencyKey)
    .maybeSingle();
  if (existing.data?.status === "succeeded") return;
  const args = command.args;
  try {
    if (command.type === "workbench.topic.create") {
      throwIfQueryFailed(await supabase.from("workbench_topics").insert({
        id: typeof args.id === "string" ? args.id : `topic_${randomUUID()}`,
        user_id: task.userId,
        title: String(args.title || "新讨论")
      }));
    } else if (command.type === "workbench.topic.rename") {
      throwIfQueryFailed(await supabase.from("workbench_topics").update({ title: String(args.title || "新讨论") }).eq("id", String(args.topicId || task.topicId || "")).eq("user_id", task.userId));
    } else if (command.type === "workbench.note.create") {
      throwIfQueryFailed(await supabase.from("workbench_notes").insert({
        id: `note_${randomUUID()}`,
        user_id: task.userId,
        topic_id: String(args.topicId || task.topicId || ""),
        title: String(args.title || "AI 笔记"),
        content: String(args.content || "")
      }));
    } else if (command.type === "workbench.direction.add") {
      throwIfQueryFailed(await supabase.from("workbench_directions").insert({
        id: `direction_${randomUUID()}`,
        user_id: task.userId,
        topic_id: String(args.topicId || task.topicId || ""),
        text: String(args.text || ""),
        sort_order: Number(args.sortOrder || 0)
      }));
    } else if (command.type === "workbench.direction.complete") {
      throwIfQueryFailed(await supabase.from("workbench_directions").update({ completed: true }).eq("id", String(args.directionId || "")).eq("user_id", task.userId));
    } else if (command.type === "workbench.file.move") {
      const role = args.role === "primary" || args.role === "context" || args.role === "generated" ? args.role : "context";
      throwIfQueryFailed(await supabase.from("workbench_files").update({ role }).eq("id", String(args.fileId || "")).eq("user_id", task.userId));
    } else if (command.type === "workbench.file.delete") {
      const target = await supabase.from("workbench_files").select("storage_path").eq("id", String(args.fileId || "")).eq("user_id", task.userId).maybeSingle();
      throwIfQueryFailed(target);
      if (target.data?.storage_path) {
        throwIfQueryFailed(await supabase.storage.from("workbench-files").remove([String(target.data.storage_path)]));
      }
      throwIfQueryFailed(await supabase.from("workbench_files").delete().eq("id", String(args.fileId || "")).eq("user_id", task.userId));
    } else if (command.type === "workbench.topic.delete") {
      const topicId = String(args.topicId || task.topicId || "");
      const files = await supabase.from("workbench_files").select("storage_path").eq("topic_id", topicId).eq("user_id", task.userId);
      throwIfQueryFailed(files);
      const paths = (files.data ?? []).flatMap((file) => typeof file.storage_path === "string" ? [file.storage_path] : []);
      if (paths.length) throwIfQueryFailed(await supabase.storage.from("workbench-files").remove(paths));
      throwIfQueryFailed(await supabase.from("workbench_topics").delete().eq("id", topicId).eq("user_id", task.userId));
    } else if (command.type === "workbench.window.open" || command.type === "workbench.window.close" || command.type === "workbench.topic.select") {
      throwIfQueryFailed(await supabase.from("workbench_ui_state").upsert({
        user_id: task.userId,
        key: command.type === "workbench.topic.select" ? "active_topic_id" : `window:${String(args.window || "unknown")}`,
        value: command.type === "workbench.topic.select" ? { topicId: args.topicId } : { open: command.type.endsWith(".open") }
      }, { onConflict: "user_id,key" }));
    }
    await recordCommandExecution(supabase, task, command, "succeeded");
  } catch (error) {
    await recordCommandExecution(supabase, task, command, "failed", error instanceof Error ? error.message : "COMMAND_FAILED");
    throw error;
  }
}

async function persistGeneratedImages(supabase: SupabaseClient, task: WorkbenchTask, response: OpenAI.Responses.Response) {
  const artifacts: WorkbenchAgentResult["artifacts"] = [];
  for (const item of response.output) {
    if (item.type !== "image_generation_call" || typeof item.result !== "string") continue;
    const id = `image_${randomUUID()}`;
    const storagePath = `${task.userId}/${task.topicId || "unassigned"}/${id}/generated.png`;
    const upload = await supabase.storage.from("workbench-files").upload(storagePath, Buffer.from(item.result, "base64"), {
      contentType: "image/png",
      upsert: false
    });
    if (upload.error) throw new Error(upload.error.message);
    await supabase.from("workbench_files").insert({
      id,
      user_id: task.userId,
      topic_id: task.topicId,
      role: "generated",
      name: "AI 生成图片.png",
      mime_type: "image/png",
      storage_path: storagePath,
      size_bytes: Buffer.byteLength(item.result, "base64")
    });
    artifacts.push({ id, kind: "image", name: "AI 生成图片.png", storagePath, mimeType: "image/png" });
  }
  return artifacts;
}

export async function processWorkbenchTask(taskId: string) {
  const supabase = createWorkbenchAdminClient();
  const { data: row, error } = await supabase.from("workbench_tasks").select("*").eq("id", taskId).single();
  if (error) throw new Error(error.message);
  const task = mapTask(row as Record<string, unknown>);
  if (!task.responseId || ["succeeded", "cancelled"].includes(task.status)) return task;
  const claim = await supabase
    .from("workbench_tasks")
    .update({ status: "executing" })
    .eq("id", task.id)
    .in("status", ["queued", "running", "response_ready"])
    .select("id")
    .maybeSingle();
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data && task.status !== "executing") return task;
  try {
    const response = await createOpenAIClient().responses.retrieve(task.responseId);
    if (response.status === "queued" || response.status === "in_progress") {
      await supabase.from("workbench_tasks").update({ status: "running" }).eq("id", task.id);
      return { ...task, status: "running" as const };
    }
    if (response.status !== "completed") throw new Error(`OPENAI_RESPONSE_${response.status || "FAILED"}`);
    const parsed = WorkbenchAgentResultSchema.safeParse(JSON.parse(response.output_text || "{}"));
    if (!parsed.success) throw new Error("WORKBENCH_AGENT_RESULT_INVALID");
    const generated = await persistGeneratedImages(supabase, task, response);
    const result: WorkbenchAgentResult = { ...parsed.data, artifacts: [...parsed.data.artifacts, ...generated] };
    const partitioned = partitionWorkbenchCommands(result.commands);
    if (partitioned.rejected.length) throw new Error("WORKBENCH_AGENT_COMMAND_REJECTED");
    for (const command of partitioned.safe) await executeCommand(supabase, task, command);
    const nextStatus = partitioned.confirmation.length ? "awaiting_confirmation" : "succeeded";
    const { data: updated, error: updateError } = await supabase
      .from("workbench_tasks")
      .update({ status: nextStatus, result, reply: result.reply, error: null, unread: true })
      .eq("id", task.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    return mapTask(updated as Record<string, unknown>);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "WORKBENCH_TASK_PROCESS_FAILED";
    const { data: updated } = await supabase
      .from("workbench_tasks")
      .update({ status: "failed", error: message, unread: true })
      .eq("id", task.id)
      .select("*")
      .single();
    if (updated) return mapTask(updated as Record<string, unknown>);
    throw caught;
  }
}

export async function cancelDurableWorkbenchTask(taskId: string, userId: string) {
  const supabase = createWorkbenchAdminClient();
  const { data: row, error } = await supabase.from("workbench_tasks").select("*").eq("id", taskId).eq("user_id", userId).single();
  if (error) throw new Error(error.message);
  const task = mapTask(row as Record<string, unknown>);
  if (task.responseId && ["queued", "running", "response_ready", "executing"].includes(task.status)) {
    await createOpenAIClient().responses.cancel(task.responseId).catch(() => undefined);
  }
  const { data, error: updateError } = await supabase.from("workbench_tasks").update({ status: "cancelled", unread: true }).eq("id", taskId).eq("user_id", userId).select("*").single();
  if (updateError) throw new Error(updateError.message);
  return mapTask(data as Record<string, unknown>);
}

export async function confirmDurableWorkbenchTask(taskId: string, userId: string) {
  const supabase = createWorkbenchAdminClient();
  const { data: row, error } = await supabase.from("workbench_tasks").select("*").eq("id", taskId).eq("user_id", userId).single();
  if (error) throw new Error(error.message);
  const task = mapTask(row as Record<string, unknown>);
  if (task.status !== "awaiting_confirmation" || !task.result) throw new Error("WORKBENCH_TASK_NOT_AWAITING_CONFIRMATION");
  const { confirmation, rejected } = partitionWorkbenchCommands(task.result.commands);
  if (rejected.length) throw new Error("WORKBENCH_AGENT_COMMAND_REJECTED");
  for (const command of confirmation) await executeCommand(supabase, task, command);
  const { data, error: updateError } = await supabase.from("workbench_tasks").update({ status: "succeeded", unread: true }).eq("id", taskId).eq("user_id", userId).select("*").single();
  if (updateError) throw new Error(updateError.message);
  return mapTask(data as Record<string, unknown>);
}

export async function findTaskByResponseId(responseId: string) {
  const supabase = createWorkbenchAdminClient();
  const { data, error } = await supabase.from("workbench_tasks").select("*").eq("response_id", responseId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTask(data as Record<string, unknown>) : null;
}

export async function markTaskResponseReady(taskId: string) {
  const supabase = createWorkbenchAdminClient();
  await supabase.from("workbench_tasks").update({ status: "response_ready" }).eq("id", taskId).in("status", ["queued", "running"]);
}

export async function listRecoverableTaskIds(limit = 10) {
  const supabase = createWorkbenchAdminClient();
  const cutoff = new Date(Date.now() - 30_000).toISOString();
  const { data, error } = await supabase
    .from("workbench_tasks")
    .select("id")
    .in("status", ["queued", "running", "response_ready", "executing"])
    .lt("updated_at", cutoff)
    .order("updated_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.id));
}
