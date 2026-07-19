import type { IncomingMessage, ServerResponse } from "node:http";
import { createDurableWorkbenchTask } from "../../src/api/workbench/taskService.js";
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
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 12_000) : "";
    const topicId = typeof body.topicId === "string" ? body.topicId : null;
    const selectedFileId = typeof body.selectedFileId === "string" ? body.selectedFileId : null;
    if (!prompt) {
      sendJson(response, 400, { error: "WORKBENCH_PROMPT_REQUIRED" });
      return;
    }
    const task = await createDurableWorkbenchTask({ userId: auth.user.id, prompt, topicId, selectedFileId });
    sendJson(response, 202, { task });
  } catch (error) {
    sendJson(response, 502, { error: "WORKBENCH_TASK_CREATE_FAILED", message: error instanceof Error ? error.message : "Task creation failed" });
  }
}
