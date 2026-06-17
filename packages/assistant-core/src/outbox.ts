export type OutboxMutationStatus = "pending" | "syncing" | "failed" | "synced";

export interface OutboxMutation {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  operationId?: string;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  status: OutboxMutationStatus;
  error?: string;
}

export interface OutboxStorage {
  load: () => Promise<OutboxMutation[]> | OutboxMutation[];
  save: (mutations: OutboxMutation[]) => Promise<void> | void;
}

export interface OutboxSyncAdapter {
  sync: (mutation: OutboxMutation) => Promise<void> | void;
}

export interface OutboxRetryPolicy {
  maxRetries: number;
}

function createOutboxId() {
  return `mutation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class InMemoryOutboxStorage implements OutboxStorage {
  private mutations: OutboxMutation[] = [];

  load(): OutboxMutation[] {
    return [...this.mutations];
  }

  save(mutations: OutboxMutation[]): void {
    this.mutations = mutations.map((mutation) => ({ ...mutation }));
  }
}

export class MutationOutbox {
  constructor(
    private readonly storage: OutboxStorage = new InMemoryOutboxStorage(),
    private readonly retryPolicy: OutboxRetryPolicy = { maxRetries: 3 },
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async enqueue(input: {
    type: string;
    payload: Record<string, unknown>;
    operationId?: string;
    id?: string;
  }): Promise<OutboxMutation> {
    const mutations = await this.storage.load();
    const mutation: OutboxMutation = {
      id: input.id ?? createOutboxId(),
      type: input.type,
      payload: input.payload,
      operationId: input.operationId,
      createdAt: this.now(),
      updatedAt: this.now(),
      retryCount: 0,
      status: "pending"
    };
    await this.storage.save([...mutations, mutation]);
    return mutation;
  }

  async list(): Promise<OutboxMutation[]> {
    return this.storage.load();
  }

  async pendingCount(): Promise<number> {
    return (await this.storage.load()).filter((mutation) => mutation.status === "pending" || mutation.status === "failed").length;
  }

  async retry(adapter: OutboxSyncAdapter): Promise<OutboxMutation[]> {
    const mutations = await this.storage.load();
    const next: OutboxMutation[] = [];
    for (const mutation of mutations) {
      if (mutation.status === "synced") continue;
      if (mutation.retryCount >= this.retryPolicy.maxRetries) {
        next.push({ ...mutation, status: "failed", updatedAt: this.now(), error: mutation.error ?? "超过最大重试次数" });
        continue;
      }
      try {
        await adapter.sync({ ...mutation, status: "syncing", updatedAt: this.now() });
      } catch (error) {
        next.push({
          ...mutation,
          status: "failed",
          updatedAt: this.now(),
          retryCount: mutation.retryCount + 1,
          error: error instanceof Error ? error.message : "同步失败"
        });
        continue;
      }
    }
    await this.storage.save(next);
    return next;
  }
}
