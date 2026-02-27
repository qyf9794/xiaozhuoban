import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Board,
  BoardBackground,
  LayoutMode,
  WidgetDefinition,
  WidgetInstance,
  Workspace,
  WorkspacePermissions
} from "@xiaozhuoban/domain";

interface WorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  theme: Workspace["theme"];
  permissions: WorkspacePermissions | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface BoardRow {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  layout_mode: LayoutMode;
  zoom: number;
  locked: boolean;
  background: BoardBackground | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface WidgetDefinitionRow {
  id: string;
  user_id: string;
  kind: WidgetDefinition["kind"];
  type: string;
  name: string;
  version: number;
  description: string | null;
  input_schema: WidgetDefinition["inputSchema"];
  output_schema: WidgetDefinition["outputSchema"];
  ui_schema: WidgetDefinition["uiSchema"];
  logic_spec: WidgetDefinition["logicSpec"];
  storage_policy: WidgetDefinition["storagePolicy"];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface WidgetInstanceRow {
  id: string;
  user_id: string;
  board_id: string;
  definition_id: string;
  state: Record<string, unknown> | null;
  bindings: WidgetInstance["bindings"] | null;
  position: WidgetInstance["position"] | null;
  size: WidgetInstance["size"] | null;
  z_index: number;
  locked: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function workspaceFromRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    theme: row.theme,
    permissions: row.permissions ?? { editable: true, shareable: false },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function workspaceToRow(workspace: Workspace, userId: string): WorkspaceRow {
  return {
    id: workspace.id,
    user_id: userId,
    name: workspace.name,
    theme: workspace.theme,
    permissions: workspace.permissions,
    created_at: workspace.createdAt,
    updated_at: workspace.updatedAt,
    deleted_at: null
  };
}

function boardFromRow(row: BoardRow): Board {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    layoutMode: row.layout_mode,
    zoom: row.zoom,
    locked: row.locked,
    background: row.background ?? { type: "color", value: "#e8ebf0" },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function boardToRow(board: Board, userId: string): BoardRow {
  return {
    id: board.id,
    user_id: userId,
    workspace_id: board.workspaceId,
    name: board.name,
    layout_mode: board.layoutMode,
    zoom: board.zoom,
    locked: board.locked,
    background: board.background,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
    deleted_at: null
  };
}

function widgetDefinitionFromRow(row: WidgetDefinitionRow): WidgetDefinition {
  return {
    id: row.id,
    kind: row.kind,
    type: row.type,
    name: row.name,
    version: row.version,
    description: row.description ?? undefined,
    inputSchema: row.input_schema,
    outputSchema: row.output_schema,
    uiSchema: row.ui_schema,
    logicSpec: row.logic_spec,
    storagePolicy: row.storage_policy,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function widgetDefinitionToRow(definition: WidgetDefinition, userId: string): WidgetDefinitionRow {
  return {
    id: definition.id,
    user_id: userId,
    kind: definition.kind,
    type: definition.type,
    name: definition.name,
    version: definition.version,
    description: definition.description ?? null,
    input_schema: definition.inputSchema,
    output_schema: definition.outputSchema,
    ui_schema: definition.uiSchema,
    logic_spec: definition.logicSpec,
    storage_policy: definition.storagePolicy,
    created_at: definition.createdAt,
    updated_at: definition.updatedAt,
    deleted_at: null
  };
}

function widgetInstanceFromRow(row: WidgetInstanceRow): WidgetInstance {
  return {
    id: row.id,
    boardId: row.board_id,
    definitionId: row.definition_id,
    state: row.state ?? {},
    bindings: row.bindings ?? [],
    position: row.position ?? { x: 0, y: 0 },
    size: row.size ?? { w: 240, h: 180 },
    zIndex: row.z_index,
    locked: row.locked,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function widgetInstanceToRow(instance: WidgetInstance, userId: string): WidgetInstanceRow {
  return {
    id: instance.id,
    user_id: userId,
    board_id: instance.boardId,
    definition_id: instance.definitionId,
    state: instance.state,
    bindings: instance.bindings,
    position: instance.position,
    size: instance.size,
    z_index: instance.zIndex,
    locked: instance.locked,
    created_at: instance.createdAt,
    updated_at: instance.updatedAt,
    deleted_at: null
  };
}

export class SupabaseRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string
  ) {}

  async list(): Promise<Workspace[]> {
    const { data, error } = await this.client
      .from("workspaces")
      .select("*")
      .eq("user_id", this.userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: true });
    throwIfError(error);
    return ((data as WorkspaceRow[] | null) ?? []).map(workspaceFromRow);
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    const { error } = await this.client.from("workspaces").upsert(workspaceToRow(workspace, this.userId), {
      onConflict: "id"
    });
    throwIfError(error);
  }

  async listByWorkspace(workspaceId: string): Promise<Board[]> {
    const { data, error } = await this.client
      .from("boards")
      .select("*")
      .eq("user_id", this.userId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: true });
    throwIfError(error);
    return ((data as BoardRow[] | null) ?? []).map(boardFromRow);
  }

  async upsertBoard(board: Board): Promise<void> {
    const { error } = await this.client.from("boards").upsert(boardToRow(board, this.userId), {
      onConflict: "id"
    });
    throwIfError(error);
  }

  async deleteBoard(boardId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error: boardError } = await this.client
      .from("boards")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", boardId)
      .eq("user_id", this.userId)
      .is("deleted_at", null);
    throwIfError(boardError);

    const { error: widgetError } = await this.client
      .from("widget_instances")
      .update({ deleted_at: now, updated_at: now })
      .eq("board_id", boardId)
      .eq("user_id", this.userId)
      .is("deleted_at", null);
    throwIfError(widgetError);
  }

  async listByBoard(boardId: string): Promise<WidgetInstance[]> {
    const { data, error } = await this.client
      .from("widget_instances")
      .select("*")
      .eq("user_id", this.userId)
      .eq("board_id", boardId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: true });
    throwIfError(error);
    return ((data as WidgetInstanceRow[] | null) ?? []).map(widgetInstanceFromRow);
  }

  async upsertInstance(instance: WidgetInstance): Promise<void> {
    const { error } = await this.client.from("widget_instances").upsert(widgetInstanceToRow(instance, this.userId), {
      onConflict: "id"
    });
    throwIfError(error);
  }

  async deleteInstance(instanceId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("widget_instances")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", instanceId)
      .eq("user_id", this.userId)
      .is("deleted_at", null);
    throwIfError(error);
  }

  async listDefinitions(): Promise<WidgetDefinition[]> {
    const { data, error } = await this.client
      .from("widget_definitions")
      .select("*")
      .eq("user_id", this.userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: true });
    throwIfError(error);
    return ((data as WidgetDefinitionRow[] | null) ?? []).map(widgetDefinitionFromRow);
  }

  async upsertDefinition(definition: WidgetDefinition): Promise<void> {
    const { error } = await this.client
      .from("widget_definitions")
      .upsert(widgetDefinitionToRow(definition, this.userId), {
        onConflict: "id"
      });
    throwIfError(error);
  }

  async clearAll(): Promise<void> {
    const now = new Date().toISOString();
    const tables = ["widget_instances", "widget_definitions", "boards", "workspaces"] as const;
    for (const table of tables) {
      const { error } = await this.client
        .from(table)
        .update({ deleted_at: now, updated_at: now })
        .eq("user_id", this.userId)
        .is("deleted_at", null);
      throwIfError(error);
    }
  }
}
