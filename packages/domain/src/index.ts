export type UUID = string;

export type ThemeMode = "light" | "dark";

export interface WorkspacePermissions {
  editable: boolean;
  shareable: boolean;
}

export interface Workspace {
  id: UUID;
  name: string;
  theme: ThemeMode;
  permissions: WorkspacePermissions;
  createdAt: string;
  updatedAt: string;
}

export type LayoutMode = "grid" | "free";

export interface BoardBackground {
  type: "color" | "image";
  value: string;
}

export interface Board {
  id: UUID;
  workspaceId: UUID;
  name: string;
  layoutMode: LayoutMode;
  zoom: number;
  locked: boolean;
  background: BoardBackground;
  createdAt: string;
  updatedAt: string;
}

export type WidgetKind = "system" | "ai";

export type WidgetInputFieldType =
  | "text"
  | "number"
  | "select"
  | "date"
  | "checkbox"
  | "textarea";

export interface WidgetFieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  regex?: string;
  enum?: string[];
}

export interface WidgetInputField {
  key: string;
  label: string;
  type: WidgetInputFieldType;
  placeholder?: string;
  options?: string[];
  validation?: WidgetFieldValidation;
  defaultValue?: string | number | boolean;
}

export interface WidgetSchema {
  fields: WidgetInputField[];
}

export interface WidgetUiSchema {
  layout: "single-column" | "two-column";
  emphasizedFields?: string[];
}

export interface WidgetLogicSpec {
  derived?: Array<{
    target: string;
    expression: string;
  }>;
  onSubmit?: {
    message?: string;
    clearAfterSubmit?: boolean;
  };
}

export interface WidgetStoragePolicy {
  strategy: "local" | "ephemeral";
  retentionDays?: number;
}

export interface WidgetDefinition {
  id: UUID;
  kind: WidgetKind;
  type: string;
  name: string;
  version: number;
  description?: string;
  inputSchema: WidgetSchema;
  outputSchema: WidgetSchema;
  uiSchema: WidgetUiSchema;
  logicSpec: WidgetLogicSpec;
  storagePolicy: WidgetStoragePolicy;
  createdAt: string;
  updatedAt: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface WidgetBinding {
  variable: string;
  sourcePath: string;
}

export interface WidgetInstance {
  id: UUID;
  boardId: UUID;
  definitionId: UUID;
  state: Record<string, unknown>;
  bindings: WidgetBinding[];
  position: Point;
  size: Size;
  zIndex: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export type WidgetLinkTrigger = "onChange" | "onSubmit";

export interface WidgetLinkRule {
  id: UUID;
  boardId: UUID;
  sourceWidgetId: UUID;
  sourcePath: string;
  targetWidgetId: UUID;
  targetPath: string;
  trigger: WidgetLinkTrigger;
  transform?: string;
}

export interface WidgetDefinitionDraft {
  id: UUID;
  prompt: string;
  version: number;
  baseVersion?: number;
  definition: WidgetDefinition;
  createdAt: string;
}

export interface SearchHit {
  type: "workspace" | "board" | "widget" | "content";
  id: UUID;
  title: string;
  snippet?: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): UUID {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}
