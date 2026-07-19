import type { IncomingMessage, ServerResponse } from "node:http";
import { listRecoverableTaskIds, processWorkbenchTask } from "../../src/api/workbench/taskService.js";
import { isWorkbenchServerEnabled, sendJson } from "../../src/api/workbench/server.js";

function isAuthorized(request: IncomingMessage) {
  const value = request.headers.authorization;
  const authorization = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("allow", "GET, POST");
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }
  if (!isWorkbenchServerEnabled()) {
    sendJson(response, 404, { error: "WORKBENCH_DISABLED" });
    return;
  }
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "UNAUTHORIZED" });
    return;
  }
  try {
    const taskIds = await listRecoverableTaskIds(10);
    const results = [];
    for (const taskId of taskIds) {
      try {
        const task = await processWorkbenchTask(taskId);
        results.push({ taskId, status: task.status });
      } catch (error) {
        results.push({ taskId, status: "failed", error: error instanceof Error ? error.message : "PROCESS_FAILED" });
      }
    }
    sendJson(response, 200, { ok: true, processed: results });
  } catch (error) {
    sendJson(response, 500, { error: "WORKBENCH_RECOVERY_FAILED", message: error instanceof Error ? error.message : "Recovery failed" });
  }
}
