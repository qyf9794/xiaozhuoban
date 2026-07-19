import type { IncomingMessage, ServerResponse } from "node:http";
import { cancelDurableWorkbenchTask, confirmDurableWorkbenchTask } from "../../src/api/workbench/taskService.js";
import { authenticateWorkbenchRequest, readJsonBody, sendJson } from "../../src/api/workbench/server.js";

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }
  const auth = await authenticateWorkbenchRequest(request);
  if (auth.ok === false) {
    sendJson(response, auth.status, { error: auth.error });
    return;
  }
  try {
    const body = await readJsonBody(request);
    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    const action = body.action === "cancel" || body.action === "confirm" ? body.action : null;
    if (!taskId || !action) {
      sendJson(response, 400, { error: "WORKBENCH_TASK_ACTION_INVALID" });
      return;
    }
    const task = action === "cancel"
      ? await cancelDurableWorkbenchTask(taskId, auth.user.id)
      : await confirmDurableWorkbenchTask(taskId, auth.user.id);
    sendJson(response, 200, { task });
  } catch (error) {
    sendJson(response, 409, { error: "WORKBENCH_TASK_ACTION_FAILED", message: error instanceof Error ? error.message : "Task action failed" });
  }
}
