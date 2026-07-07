import { createId, nowIso, type Board, type WidgetInstance, type Workspace } from "@xiaozhuoban/domain";
import { DexieRepository, InMemoryRepository, type AppRepository } from "@xiaozhuoban/data";

const defaultWorkspaceName = "默认工作空间";
const defaultBoardName = "我的桌板";

export function createRepository(): AppRepository {
  try {
    if (typeof window !== "undefined" && "indexedDB" in window) {
      return new DexieRepository();
    }
    return new InMemoryRepository();
  } catch {
    return new InMemoryRepository();
  }
}

export function makeWorkspace(name = defaultWorkspaceName): Workspace {
  const now = nowIso();
  return {
    id: createId("ws"),
    name,
    theme: "light",
    permissions: {
      editable: true,
      shareable: false
    },
    createdAt: now,
    updatedAt: now
  };
}

export function makeBoard(workspaceId: string, name = defaultBoardName): Board {
  const now = nowIso();
  return {
    id: createId("board"),
    workspaceId,
    name,
    layoutMode: "free",
    zoom: 1,
    locked: false,
    background: {
      type: "color",
      value: "#e8ebf0"
    },
    createdAt: now,
    updatedAt: now
  };
}

export async function persistBoardWithWidgets(
  repository: AppRepository,
  board: Board,
  widgetInstances: WidgetInstance[]
): Promise<void> {
  await repository.upsertBoard(board);
  if (widgetInstances.length > 0) {
    await repository.upsertInstances(widgetInstances);
  }
}
