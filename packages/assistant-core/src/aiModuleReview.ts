import type { ShortcutRule, WidgetAssistantModule, WidgetAssistantRegistry } from "./moduleRegistry";

export interface AiGeneratedModuleManifest {
  type: string;
  displayName: string;
  aliases: string[];
  shortcuts: ShortcutRule[];
  tools: Array<{
    name: string;
    description: string;
    argsSchema: Record<string, unknown>;
    risk: "safe" | "confirm" | "destructive";
  }>;
  logicSpec?: Record<string, unknown>;
}

export interface AiModuleReviewIssue {
  code: "INVALID_TYPE" | "TOOL_CONFLICT" | "ALIAS_CONFLICT" | "UNSAFE_LOGIC" | "MISSING_SCHEMA";
  message: string;
}

export interface AiModuleInstallPreview {
  manifest: AiGeneratedModuleManifest;
  canInstall: boolean;
  issues: AiModuleReviewIssue[];
  summary: string;
}

const allowedLogicKinds = new Set(["static", "expression", "http_readonly"]);

function isValidModuleType(type: string): boolean {
  return /^[a-z][a-zA-Z0-9_]*$/.test(type);
}

export function reviewAiGeneratedModule(
  manifest: AiGeneratedModuleManifest,
  registry: WidgetAssistantRegistry
): AiModuleInstallPreview {
  const issues: AiModuleReviewIssue[] = [];
  if (!isValidModuleType(manifest.type)) {
    issues.push({ code: "INVALID_TYPE", message: "模块 type 必须是安全标识符" });
  }
  const existingTools = new Set(registry.list({ includeDisabled: true }).flatMap((module) => module.tools.map((tool) => tool.spec.name)));
  for (const tool of manifest.tools) {
    if (existingTools.has(tool.name)) {
      issues.push({ code: "TOOL_CONFLICT", message: `工具名冲突：${tool.name}` });
    }
    if (!tool.argsSchema || typeof tool.argsSchema !== "object") {
      issues.push({ code: "MISSING_SCHEMA", message: `工具缺少 args schema：${tool.name}` });
    }
  }
  const aliases = new Set(registry.list({ includeDisabled: true }).flatMap((module) => module.aliases));
  for (const alias of manifest.aliases) {
    if (aliases.has(alias)) {
      issues.push({ code: "ALIAS_CONFLICT", message: `别名冲突：${alias}` });
    }
  }
  const logicKind = typeof manifest.logicSpec?.kind === "string" ? manifest.logicSpec.kind : "static";
  if (!allowedLogicKinds.has(logicKind)) {
    issues.push({ code: "UNSAFE_LOGIC", message: "logicSpec 只能使用白名单类型" });
  }
  return {
    manifest,
    canInstall: issues.length === 0,
    issues,
    summary: `${manifest.displayName} 将注册 ${manifest.tools.length} 个工具、${manifest.shortcuts.length} 条快捷命令；安装前必须用户确认`
  };
}

export function installReviewedModule(
  preview: AiModuleInstallPreview,
  module: WidgetAssistantModule,
  registry: WidgetAssistantRegistry,
  confirmed: boolean
): boolean {
  if (!confirmed || !preview.canInstall) {
    return false;
  }
  registry.register(module);
  return true;
}
