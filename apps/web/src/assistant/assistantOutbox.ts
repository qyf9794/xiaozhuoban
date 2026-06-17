import { MutationOutbox, type OutboxMutation, type OutboxStorage } from "@xiaozhuoban/assistant-core";
import type { AppRepository } from "@xiaozhuoban/data";
import type { WidgetInstance } from "@xiaozhuoban/domain";

const OUTBOX_KEY = "xiaozhuoban.assistant.outbox.v1";

export type AssistantCloudMutation =
  | { type: "widget.upsert"; payload: { instance: WidgetInstance } }
  | { type: "widget.upsert_many"; payload: { instances: WidgetInstance[] } }
  | { type: "widget.delete"; payload: { widgetId: string } };

class LocalStorageOutboxStorage implements OutboxStorage {
  load(): OutboxMutation[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  save(mutations: OutboxMutation[]): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(mutations));
    globalThis.dispatchEvent?.(new CustomEvent("xiaozhuoban-assistant-outbox", { detail: { pending: mutations.length } }));
  }
}

export const assistantMutationOutbox = new MutationOutbox(new LocalStorageOutboxStorage());

export async function enqueueAssistantCloudMutation(
  mutation: AssistantCloudMutation,
  operationId?: string
): Promise<OutboxMutation> {
  return assistantMutationOutbox.enqueue({
    type: mutation.type,
    payload: mutation.payload as Record<string, unknown>,
    operationId
  });
}

export async function getAssistantOutboxPendingCount(): Promise<number> {
  return assistantMutationOutbox.pendingCount();
}

export async function retryAssistantOutbox(repository: AppRepository): Promise<OutboxMutation[]> {
  return assistantMutationOutbox.retry({
    async sync(mutation) {
      if (mutation.type === "widget.upsert") {
        await repository.upsertInstance(mutation.payload.instance as WidgetInstance);
        return;
      }
      if (mutation.type === "widget.upsert_many") {
        await repository.upsertInstances(mutation.payload.instances as WidgetInstance[]);
        return;
      }
      if (mutation.type === "widget.delete") {
        await repository.deleteInstance(String(mutation.payload.widgetId));
        return;
      }
      throw new Error(`Unsupported outbox mutation: ${mutation.type}`);
    }
  });
}
