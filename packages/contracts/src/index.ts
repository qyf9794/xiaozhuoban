export const API_CONTRACTS = {
  syncPush: "POST /v1/sync/push",
  syncPull: "POST /v1/sync/pull",
  templatesImport: "POST /v1/templates/import",
  templatesList: "GET /v1/templates"
} as const;

export interface SyncPushRequest {
  workspaceId: string;
  changes: Array<Record<string, unknown>>;
}

export interface SyncPullRequest {
  workspaceId: string;
  cursor?: string;
}

export interface TemplatesImportRequest {
  payload: string;
  format: "json";
}
