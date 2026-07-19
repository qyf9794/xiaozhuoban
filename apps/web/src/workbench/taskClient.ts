import type { WorkbenchTask } from "@xiaozhuoban/workbench-core";
import { useAuthStore } from "../auth/authStore";

async function workbenchRequest<T>(path: string, init: RequestInit): Promise<T> {
  const accessToken = useAuthStore.getState().session?.access_token;
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers
    }
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `WORKBENCH_REQUEST_${response.status}`);
  return body;
}

export async function createWorkbenchTask(input: { prompt: string; topicId?: string | null; selectedFileId?: string | null }): Promise<WorkbenchTask> {
  const result = await workbenchRequest<{ task: WorkbenchTask }>("/api/workbench/tasks", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.task;
}

export async function cancelWorkbenchTask(taskId: string): Promise<WorkbenchTask> {
  const result = await workbenchRequest<{ task: WorkbenchTask }>("/api/workbench/task-action", {
    method: "POST",
    body: JSON.stringify({ taskId, action: "cancel" })
  });
  return result.task;
}

export async function confirmWorkbenchTask(taskId: string): Promise<WorkbenchTask> {
  const result = await workbenchRequest<{ task: WorkbenchTask }>("/api/workbench/task-action", {
    method: "POST",
    body: JSON.stringify({ taskId, action: "confirm" })
  });
  return result.task;
}
