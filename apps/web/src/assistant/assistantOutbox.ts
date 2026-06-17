import { MutationOutbox, type OutboxMutation, type OutboxStorage } from "@xiaozhuoban/assistant-core";
import type { AppRepository } from "@xiaozhuoban/data";
import type { Board, WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";

const OUTBOX_KEY = "xiaozhuoban.assistant.outbox.v1";

export type AssistantCloudMutation =
  | { type: "board.upsert"; payload: { board: Board } }
  | { type: "board.delete"; payload: { boardId: string; fallbackBoard?: Board; fallbackInstances?: WidgetInstance[] } }
  | { type: "widget.upsert"; payload: { instance: WidgetInstance } }
  | { type: "widget.upsert_many"; payload: { instances: WidgetInstance[] } }
  | { type: "widget.delete"; payload: { widgetId: string } }
  | { type: "widget_definition.upsert"; payload: { definition: WidgetDefinition } }
  | { type: "widget_definition.upsert_many"; payload: { definitions: WidgetDefinition[] } }
  | { type: "backup.import"; payload: { board: Board; definitions: WidgetDefinition[]; instances: WidgetInstance[] } };

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

export async function getAssistantOutboxStatus(): Promise<{ pendingCount: number; lastError?: string }> {
  const mutations = await assistantMutationOutbox.list();
  const pending = mutations.filter((mutation) => mutation.status === "pending" || mutation.status === "failed");
  const failed = [...pending]
    .filter((mutation) => Boolean(mutation.error))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    pendingCount: pending.length,
    lastError: failed?.error
  };
}

export async function retryAssistantOutbox(repository: AppRepository): Promise<OutboxMutation[]> {
  return assistantMutationOutbox.retry({
    async sync(mutation) {
      if (mutation.type === "board.upsert") {
        await repository.upsertBoard(mutation.payload.board as Board);
        return;
      }
      if (mutation.type === "board.delete") {
        await repository.deleteBoard(String(mutation.payload.boardId));
        const fallbackBoard = mutation.payload.fallbackBoard as Board | undefined;
        const fallbackInstances = Array.isArray(mutation.payload.fallbackInstances)
          ? (mutation.payload.fallbackInstances as WidgetInstance[])
          : [];
        if (fallbackBoard) {
          await repository.upsertBoard(fallbackBoard);
        }
        if (fallbackInstances.length > 0) {
          await repository.upsertInstances(fallbackInstances);
        }
        return;
      }
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
      if (mutation.type === "widget_definition.upsert") {
        await repository.upsertDefinition(mutation.payload.definition as WidgetDefinition);
        return;
      }
      if (mutation.type === "widget_definition.upsert_many") {
        await repository.upsertDefinitions(mutation.payload.definitions as WidgetDefinition[]);
        return;
      }
      if (mutation.type === "backup.import") {
        await repository.upsertBoard(mutation.payload.board as Board);
        const definitions = Array.isArray(mutation.payload.definitions)
          ? (mutation.payload.definitions as WidgetDefinition[])
          : [];
        const instances = Array.isArray(mutation.payload.instances)
          ? (mutation.payload.instances as WidgetInstance[])
          : [];
        if (definitions.length > 0) {
          await repository.upsertDefinitions(definitions);
        }
        if (instances.length > 0) {
          await repository.upsertInstances(instances);
        }
        return;
      }
      throw new Error(`Unsupported outbox mutation: ${mutation.type}`);
    }
  });
}
