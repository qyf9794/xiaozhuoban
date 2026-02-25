import Dexie, { type Table } from "dexie";
import type { Board, WidgetDefinition, WidgetInstance, Workspace } from "@xiaozhuoban/domain";

export interface WorkspaceRepository {
  list(): Promise<Workspace[]>;
  upsertWorkspace(workspace: Workspace): Promise<void>;
}

export interface BoardRepository {
  listByWorkspace(workspaceId: string): Promise<Board[]>;
  upsertBoard(board: Board): Promise<void>;
  deleteBoard(boardId: string): Promise<void>;
}

export interface WidgetRepository {
  listByBoard(boardId: string): Promise<WidgetInstance[]>;
  upsertInstance(instance: WidgetInstance): Promise<void>;
  deleteInstance(instanceId: string): Promise<void>;
  listDefinitions(): Promise<WidgetDefinition[]>;
  upsertDefinition(definition: WidgetDefinition): Promise<void>;
}

export interface AppRepository extends WorkspaceRepository, BoardRepository, WidgetRepository {
  clearAll(): Promise<void>;
}

export class InMemoryRepository implements AppRepository {
  private workspaces = new Map<string, Workspace>();
  private boards = new Map<string, Board>();
  private widgetDefs = new Map<string, WidgetDefinition>();
  private widgetInstances = new Map<string, WidgetInstance>();

  async list(): Promise<Workspace[]> {
    return [...this.workspaces.values()];
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id, workspace);
  }

  async listByWorkspace(workspaceId: string): Promise<Board[]> {
    return [...this.boards.values()].filter((board) => board.workspaceId === workspaceId);
  }

  async upsertBoard(board: Board): Promise<void> {
    this.boards.set(board.id, board);
  }

  async deleteBoard(boardId: string): Promise<void> {
    this.boards.delete(boardId);
    for (const [id, instance] of this.widgetInstances.entries()) {
      if (instance.boardId === boardId) {
        this.widgetInstances.delete(id);
      }
    }
  }

  async listByBoard(boardId: string): Promise<WidgetInstance[]> {
    return [...this.widgetInstances.values()].filter((item) => item.boardId === boardId);
  }

  async upsertInstance(instance: WidgetInstance): Promise<void> {
    this.widgetInstances.set(instance.id, instance);
  }

  async deleteInstance(instanceId: string): Promise<void> {
    this.widgetInstances.delete(instanceId);
  }

  async listDefinitions(): Promise<WidgetDefinition[]> {
    return [...this.widgetDefs.values()];
  }

  async upsertDefinition(definition: WidgetDefinition): Promise<void> {
    this.widgetDefs.set(definition.id, definition);
  }

  async clearAll(): Promise<void> {
    this.workspaces.clear();
    this.boards.clear();
    this.widgetDefs.clear();
    this.widgetInstances.clear();
  }
}

class WorkspaceDexieDb extends Dexie {
  workspaces!: Table<Workspace, string>;
  boards!: Table<Board, string>;
  widgetDefs!: Table<WidgetDefinition, string>;
  widgetInstances!: Table<WidgetInstance, string>;

  constructor(name = "xiaozhuoban") {
    super(name);

    this.version(1).stores({
      workspaces: "id,name,updatedAt",
      boards: "id,workspaceId,layoutMode,updatedAt",
      widgetDefs: "id,type,name,updatedAt",
      widgetInstances: "id,boardId,definitionId,updatedAt"
    });
  }
}

export class DexieRepository implements AppRepository {
  private readonly db: WorkspaceDexieDb;

  constructor(name?: string) {
    this.db = new WorkspaceDexieDb(name);
  }

  async list(): Promise<Workspace[]> {
    return this.db.workspaces.toArray();
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    await this.db.workspaces.put(workspace);
  }

  async listByWorkspace(workspaceId: string): Promise<Board[]> {
    return this.db.boards.where("workspaceId").equals(workspaceId).toArray();
  }

  async upsertBoard(board: Board): Promise<void> {
    await this.db.boards.put(board);
  }

  async deleteBoard(boardId: string): Promise<void> {
    await this.db.transaction("rw", this.db.boards, this.db.widgetInstances, async () => {
      await this.db.boards.delete(boardId);
      const widgetIds = await this.db.widgetInstances.where("boardId").equals(boardId).primaryKeys();
      await this.db.widgetInstances.bulkDelete(widgetIds as string[]);
    });
  }

  async listByBoard(boardId: string): Promise<WidgetInstance[]> {
    return this.db.widgetInstances.where("boardId").equals(boardId).toArray();
  }

  async upsertInstance(instance: WidgetInstance): Promise<void> {
    await this.db.widgetInstances.put(instance);
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await this.db.widgetInstances.delete(instanceId);
  }

  async listDefinitions(): Promise<WidgetDefinition[]> {
    return this.db.widgetDefs.toArray();
  }

  async upsertDefinition(definition: WidgetDefinition): Promise<void> {
    await this.db.widgetDefs.put(definition);
  }

  async clearAll(): Promise<void> {
    await this.db.transaction(
      "rw",
      this.db.workspaces,
      this.db.boards,
      this.db.widgetDefs,
      this.db.widgetInstances,
      async () => {
        await this.db.widgetInstances.clear();
        await this.db.widgetDefs.clear();
        await this.db.boards.clear();
        await this.db.workspaces.clear();
      }
    );
  }
}
