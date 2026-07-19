import type { IncomingMessage, ServerResponse } from "node:http";
import OpenAI from "openai";
import { waitUntil } from "@vercel/functions";
import { findTaskByResponseId, markTaskResponseReady, processWorkbenchTask } from "../../src/api/workbench/taskService.js";
import { createWorkbenchAdminClient, isWorkbenchServerEnabled, readRawBody, sendJson } from "../../src/api/workbench/server.js";

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }
  if (!isWorkbenchServerEnabled()) {
    sendJson(response, 404, { error: "WORKBENCH_DISABLED" });
    return;
  }
  const webhookSecret = process.env.OPENAI_WEBHOOK_SECRET;
  if (!process.env.OPENAI_API_KEY || !webhookSecret) {
    sendJson(response, 500, { error: "OPENAI_WEBHOOK_CONFIG_MISSING" });
    return;
  }
  try {
    const rawBody = await readRawBody(request);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, webhookSecret });
    const event = await client.webhooks.unwrap(rawBody, request.headers);
    const webhookId = typeof request.headers["webhook-id"] === "string" ? request.headers["webhook-id"] : event.id;
    const supabase = createWorkbenchAdminClient();
    const inserted = await supabase.from("workbench_webhook_events").insert({ id: webhookId, event_type: event.type, payload: event });
    if (inserted.error?.code === "23505") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (inserted.error) throw new Error(inserted.error.message);
    if (event.type === "response.completed") {
      waitUntil((async () => {
        const task = await findTaskByResponseId(event.data.id);
        if (!task) return;
        await markTaskResponseReady(task.id);
        await processWorkbenchTask(task.id);
      })());
    }
    response.statusCode = 204;
    response.end();
  } catch (error) {
    if (error instanceof OpenAI.InvalidWebhookSignatureError) {
      sendJson(response, 400, { error: "OPENAI_WEBHOOK_SIGNATURE_INVALID" });
      return;
    }
    sendJson(response, 500, { error: "OPENAI_WEBHOOK_FAILED", message: error instanceof Error ? error.message : "Webhook failed" });
  }
}
