import type { Board, WidgetDefinition, WidgetInstance, Workspace } from "@xiaozhuoban/domain";

export interface BackupSnapshotPayload {
  workspaces: Workspace[];
  boards: Board[];
  widgetDefinitions: WidgetDefinition[];
  widgetsByBoard: Record<string, WidgetInstance[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function parseBackupSnapshot(value: unknown): BackupSnapshotPayload | null {
  if (!isRecord(value)) return null;
  const workspaces = Array.isArray(value.workspaces) ? (value.workspaces as Workspace[]) : null;
  const boards = Array.isArray(value.boards) ? (value.boards as Board[]) : null;
  const widgetDefinitions = Array.isArray(value.widgetDefinitions)
    ? (value.widgetDefinitions as WidgetDefinition[])
    : null;
  const widgetsByBoard = isRecord(value.widgetsByBoard)
    ? (value.widgetsByBoard as Record<string, WidgetInstance[]>)
    : null;
  if (!workspaces || !boards || !widgetDefinitions || !widgetsByBoard) {
    return null;
  }
  if (workspaces.length === 0 || boards.length === 0) {
    return null;
  }
  return {
    workspaces,
    boards,
    widgetDefinitions,
    widgetsByBoard
  };
}
