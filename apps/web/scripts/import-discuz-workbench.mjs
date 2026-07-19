#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const options = { mode: "dry-run", source: "/Users/qianyifeng/CodexProjects/Discuz", userId: "", boardId: "", batchId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.mode = "apply";
    else if (arg === "--dry-run") options.mode = "dry-run";
    else if (arg === "--rollback") options.mode = "rollback";
    else if (arg === "--source") options.source = path.resolve(argv[++index] || options.source);
    else if (arg === "--user-id") options.userId = argv[++index] || "";
    else if (arg === "--board-id") options.boardId = argv[++index] || "";
    else if (arg === "--batch-id") options.batchId = argv[++index] || "";
  }
  return options;
}

function loadLocalEnv() {
  for (const file of [path.resolve(".env.local"), path.resolve(".env")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

function query(dbPath, sql) {
  const result = spawnSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `sqlite3 exited ${result.status}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : [];
}

function checksumFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function loadSource(source) {
  const dbPath = path.join(source, "data", "discuz.sqlite");
  if (!existsSync(dbPath)) throw new Error(`Discuz database not found: ${dbPath}`);
  const topics = query(dbPath, "select * from topics order by created_at");
  const files = query(dbPath, "select * from files order by created_at");
  const notes = query(dbPath, "select * from notes order by created_at");
  const directions = query(dbPath, "select * from discussion_directions order by topic_id, sort_order, created_at");
  const records = query(dbPath, "select * from discussion_records order by created_at");
  const meetingMessages = query(dbPath, "select * from meeting_messages order by created_at");
  const discussionInputs = query(dbPath, "select * from discussion_inputs order by created_at");
  const fileEntries = files.map((file) => {
    const filePath = path.join(source, "data", "topics", file.topic_id, "uploads", file.stored_name);
    return {
      ...file,
      filePath,
      exists: existsSync(filePath),
      actualSize: existsSync(filePath) ? statSync(filePath).size : 0,
      sha256: existsSync(filePath) ? checksumFile(filePath) : null
    };
  });
  return { dbPath, topics, files: fileEntries, notes, directions, records, meetingMessages, discussionInputs };
}

function createReport(source) {
  return {
    sourceDatabase: source.dbPath,
    counts: {
      topics: source.topics.length,
      files: source.files.length,
      notes: source.notes.length,
      directions: source.directions.length,
      records: source.records.length,
      messages: source.meetingMessages.length + source.discussionInputs.length
    },
    fileBytes: source.files.reduce((sum, file) => sum + file.actualSize, 0),
    missingFiles: source.files.filter((file) => !file.exists).map((file) => file.original_name),
    checksum: createHash("sha256")
      .update(source.files.map((file) => `${file.id}:${file.sha256 || "missing"}`).sort().join("\n"))
      .digest("hex"),
    excluded: ["diagnostics", "settings", "API keys", "wallpaper", "microphone/model configuration"]
  };
}

function createAdminClient() {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for apply/rollback");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function upsertRows(supabase, table, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function applyImport(options, source, report) {
  if (!options.userId) throw new Error("--user-id is required for --apply");
  if (report.missingFiles.length) throw new Error(`Missing source files: ${report.missingFiles.join(", ")}`);
  const supabase = createAdminClient();
  const batchId = options.batchId || `discuz_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  const batch = await supabase.from("workbench_import_batches").insert({
    id: batchId,
    user_id: options.userId,
    source: source.dbPath,
    status: "running",
    report
  });
  if (batch.error) throw new Error(batch.error.message);
  try {
    await upsertRows(supabase, "workbench_topics", source.topics.map((row) => ({
      id: row.id,
      user_id: options.userId,
      board_id: options.boardId || null,
      title: row.title,
      import_batch_id: batchId,
      created_at: row.created_at,
      updated_at: row.updated_at
    })));
    const fileRows = [];
    for (const file of source.files) {
      const storagePath = `${options.userId}/${file.topic_id}/${file.id}/${file.original_name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-")}`;
      const upload = await supabase.storage.from("workbench-files").upload(storagePath, readFileSync(file.filePath), {
        contentType: file.mime_type || "application/octet-stream",
        upsert: true
      });
      if (upload.error) throw new Error(`upload ${file.original_name}: ${upload.error.message}`);
      fileRows.push({
        id: file.id,
        user_id: options.userId,
        topic_id: file.topic_id,
        role: file.role === "resource" ? "context" : file.role,
        name: file.original_name,
        mime_type: file.mime_type,
        storage_path: storagePath,
        extracted_text: file.extracted_text || null,
        size_bytes: file.size,
        import_batch_id: batchId,
        created_at: file.created_at,
        updated_at: file.updated_at
      });
    }
    await upsertRows(supabase, "workbench_files", fileRows);
    await upsertRows(supabase, "workbench_notes", source.notes.map((row) => ({
      id: row.id,
      user_id: options.userId,
      topic_id: row.topic_id,
      title: row.kind || "笔记",
      content: row.text,
      import_batch_id: batchId,
      created_at: row.created_at,
      updated_at: row.created_at
    })));
    await upsertRows(supabase, "workbench_directions", source.directions.map((row) => ({
      id: row.id,
      user_id: options.userId,
      topic_id: row.topic_id,
      text: row.text,
      completed: Boolean(row.completed),
      sort_order: row.sort_order,
      import_batch_id: batchId,
      created_at: row.created_at,
      updated_at: row.updated_at
    })));
    await upsertRows(supabase, "workbench_records", source.records.map((row) => ({
      id: row.id,
      user_id: options.userId,
      topic_id: row.topic_id,
      title: row.title,
      content: row.content,
      import_batch_id: batchId,
      created_at: row.created_at,
      updated_at: row.ended_at || row.created_at
    })));
    const messages = [
      ...source.meetingMessages.map((row, index) => ({
        id: `meeting_${row.id}`,
        user_id: options.userId,
        topic_id: row.topic_id,
        role: ["user", "assistant", "system", "tool"].includes(row.role) ? row.role : "assistant",
        content: row.text,
        metadata: { source: "meeting_messages", sourceId: row.id },
        sort_order: index,
        import_batch_id: batchId,
        created_at: row.created_at,
        updated_at: row.created_at
      })),
      ...source.discussionInputs.map((row, index) => ({
        id: `input_${row.id}`,
        user_id: options.userId,
        topic_id: row.topic_id,
        role: "user",
        content: row.text,
        metadata: { source: "discussion_inputs", inputSource: row.source, sourceId: row.id },
        sort_order: source.meetingMessages.length + index,
        import_batch_id: batchId,
        created_at: row.created_at,
        updated_at: row.created_at
      }))
    ];
    await upsertRows(supabase, "workbench_messages", messages);
    const complete = await supabase.from("workbench_import_batches").update({ status: "succeeded", report, completed_at: new Date().toISOString() }).eq("id", batchId);
    if (complete.error) throw new Error(complete.error.message);
    return { batchId, ...report };
  } catch (error) {
    await supabase.from("workbench_import_batches").update({ status: "failed", report: { ...report, error: error.message }, completed_at: new Date().toISOString() }).eq("id", batchId);
    throw error;
  }
}

async function rollbackImport(options) {
  if (!options.userId || !options.batchId) throw new Error("--user-id and --batch-id are required for --rollback");
  const supabase = createAdminClient();
  const files = await supabase.from("workbench_files").select("storage_path").eq("user_id", options.userId).eq("import_batch_id", options.batchId);
  if (files.error) throw new Error(files.error.message);
  const storagePaths = (files.data || []).map((row) => row.storage_path).filter(Boolean);
  if (storagePaths.length) {
    const removed = await supabase.storage.from("workbench-files").remove(storagePaths);
    if (removed.error) throw new Error(removed.error.message);
  }
  for (const table of ["workbench_messages", "workbench_records", "workbench_directions", "workbench_notes", "workbench_files", "workbench_topics"]) {
    const result = await supabase.from(table).delete().eq("user_id", options.userId).eq("import_batch_id", options.batchId);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
  }
  const batch = await supabase.from("workbench_import_batches").update({ status: "rolled_back", completed_at: new Date().toISOString() }).eq("id", options.batchId).eq("user_id", options.userId);
  if (batch.error) throw new Error(batch.error.message);
  return { batchId: options.batchId, status: "rolled_back", removedFiles: storagePaths.length };
}

const options = parseArgs(process.argv.slice(2));
try {
  if (options.mode === "rollback") {
    console.log(JSON.stringify(await rollbackImport(options), null, 2));
  } else {
    const source = loadSource(options.source);
    const report = createReport(source);
    console.log(JSON.stringify(options.mode === "apply" ? await applyImport(options, source, report) : { mode: "dry-run", ...report }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
