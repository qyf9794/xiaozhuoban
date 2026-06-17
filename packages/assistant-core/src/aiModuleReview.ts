import type { ShortcutRule, WidgetAssistantModule, WidgetAssistantRegistry } from "./moduleRegistry";

export type AiGeneratedModuleLogicKind = "static" | "expression" | "http_readonly";

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
  logicSpec?: {
    kind: string;
    [key: string]: unknown;
  };
}

export interface AiModuleReviewIssue {
  code:
    | "INVALID_MANIFEST"
    | "INVALID_TYPE"
    | "TOOL_CONFLICT"
    | "TOOL_SCOPE_INVALID"
    | "ALIAS_CONFLICT"
    | "UNSAFE_LOGIC"
    | "MISSING_SCHEMA"
    | "SCHEMA_ALLOWS_EXTRA_FIELDS";
  message: string;
}

export interface AiModuleInstallPreview {
  manifest: AiGeneratedModuleManifest;
  canInstall: boolean;
  issues: AiModuleReviewIssue[];
  summary: string;
}

export interface AiModuleManifestParseResult {
  success: boolean;
  manifest?: AiGeneratedModuleManifest;
  issues: AiModuleReviewIssue[];
}

export interface AiModuleSandboxCase {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  expectValid: boolean;
}

export interface AiModuleSandboxResult {
  passed: boolean;
  results: Array<{
    id: string;
    tool: string;
    passed: boolean;
    message: string;
  }>;
}

export interface AiModuleInstallSession {
  preview: AiModuleInstallPreview;
  sandbox: AiModuleSandboxResult;
  canRequestConfirmation: boolean;
}

const allowedLogicKinds = new Set(["static", "expression", "http_readonly"]);
const forbiddenLogicKeys = new Set(["code", "sourceCode", "reactCode", "componentCode", "functionBody", "eval", "script"]);

function isValidModuleType(type: string): boolean {
  return /^[a-z][a-zA-Z0-9_]*$/.test(type);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isShortcutRuleArray(value: unknown): value is ShortcutRule[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.intent === "string" &&
        Array.isArray(item.examples) &&
        item.examples.every((example) => typeof example === "string") &&
        (item.risk === "safe" || item.risk === "confirm" || item.risk === "destructive")
    )
  );
}

function isRisk(value: unknown): value is "safe" | "confirm" | "destructive" {
  return value === "safe" || value === "confirm" || value === "destructive";
}

function isToolManifestArray(value: unknown): value is AiGeneratedModuleManifest["tools"] {
  const allowedToolKeys = new Set(["name", "description", "argsSchema", "risk"]);
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        Object.keys(item).every((key) => allowedToolKeys.has(key)) &&
        typeof item.name === "string" &&
        typeof item.description === "string" &&
        isRecord(item.argsSchema) &&
        isRisk(item.risk)
    )
  );
}

function schemaAllowsExtraFields(schema: Record<string, unknown>): boolean {
  return schema.type !== "object" || schema.additionalProperties !== false;
}

function hasForbiddenLogicPayload(logicSpec: Record<string, unknown> | undefined): boolean {
  if (!logicSpec) return false;
  return Object.keys(logicSpec).some((key) => forbiddenLogicKeys.has(key));
}

export function parseAiGeneratedModuleManifest(value: unknown): AiModuleManifestParseResult {
  const issues: AiModuleReviewIssue[] = [];
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ code: "INVALID_MANIFEST", message: "AI 模块 manifest 必须是对象" }]
    };
  }

  const allowedManifestKeys = new Set(["type", "displayName", "aliases", "shortcuts", "tools", "logicSpec"]);
  const extraKeys = Object.keys(value).filter((key) => !allowedManifestKeys.has(key));
  if (extraKeys.length > 0) {
    issues.push({ code: "INVALID_MANIFEST", message: `manifest 包含未声明字段：${extraKeys.join(",")}` });
  }
  if (typeof value.type !== "string" || !value.type.trim()) {
    issues.push({ code: "INVALID_MANIFEST", message: "manifest.type 必须是非空字符串" });
  }
  if (typeof value.displayName !== "string" || !value.displayName.trim()) {
    issues.push({ code: "INVALID_MANIFEST", message: "manifest.displayName 必须是非空字符串" });
  }
  if (!isStringArray(value.aliases)) {
    issues.push({ code: "INVALID_MANIFEST", message: "manifest.aliases 必须是非空字符串数组" });
  }
  if (!isShortcutRuleArray(value.shortcuts)) {
    issues.push({ code: "INVALID_MANIFEST", message: "manifest.shortcuts 必须是受限快捷命令数组" });
  }
  if (!isToolManifestArray(value.tools)) {
    issues.push({ code: "INVALID_MANIFEST", message: "manifest.tools 必须是受限工具数组" });
  }
  if (value.logicSpec !== undefined) {
    if (!isRecord(value.logicSpec)) {
      issues.push({ code: "INVALID_MANIFEST", message: "manifest.logicSpec 必须是对象" });
    } else if (typeof value.logicSpec.kind !== "string") {
      issues.push({ code: "INVALID_MANIFEST", message: "manifest.logicSpec.kind 必须是字符串" });
    }
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  return {
    success: true,
    issues: [],
    manifest: {
      type: value.type as string,
      displayName: value.displayName as string,
      aliases: value.aliases as string[],
      shortcuts: value.shortcuts as ShortcutRule[],
      tools: value.tools as AiGeneratedModuleManifest["tools"],
      logicSpec: value.logicSpec as AiGeneratedModuleManifest["logicSpec"]
    }
  };
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
  const seenTools = new Set<string>();
  for (const tool of manifest.tools) {
    if (!tool.name.startsWith(`${manifest.type}.`)) {
      issues.push({ code: "TOOL_SCOPE_INVALID", message: `生成工具必须保留在模块命名空间内：${tool.name}` });
    }
    if (seenTools.has(tool.name)) {
      issues.push({ code: "TOOL_CONFLICT", message: `manifest 内工具名重复：${tool.name}` });
    }
    seenTools.add(tool.name);
    if (existingTools.has(tool.name)) {
      issues.push({ code: "TOOL_CONFLICT", message: `工具名冲突：${tool.name}` });
    }
    if (!tool.argsSchema || typeof tool.argsSchema !== "object") {
      issues.push({ code: "MISSING_SCHEMA", message: `工具缺少 args schema：${tool.name}` });
    } else if (schemaAllowsExtraFields(tool.argsSchema)) {
      issues.push({ code: "SCHEMA_ALLOWS_EXTRA_FIELDS", message: `工具 schema 必须拒绝额外字段：${tool.name}` });
    }
  }
  const aliases = new Set(registry.list({ includeDisabled: true }).flatMap((module) => module.aliases));
  for (const alias of manifest.aliases) {
    if (aliases.has(alias)) {
      issues.push({ code: "ALIAS_CONFLICT", message: `别名冲突：${alias}` });
    }
  }
  const logicKind = typeof manifest.logicSpec?.kind === "string" ? manifest.logicSpec.kind : "static";
  if (!allowedLogicKinds.has(logicKind) || hasForbiddenLogicPayload(manifest.logicSpec)) {
    issues.push({ code: "UNSAFE_LOGIC", message: "logicSpec 只能使用白名单类型" });
  }
  return {
    manifest,
    canInstall: issues.length === 0,
    issues,
    summary: `${manifest.displayName} 将注册 ${manifest.tools.length} 个工具、${manifest.shortcuts.length} 条快捷命令；安装前必须用户确认`
  };
}

function validateAgainstObjectSchema(schema: Record<string, unknown>, args: Record<string, unknown>): { ok: boolean; message: string } {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const allowedKeys = Object.keys(properties);
  const extraKeys = Object.keys(args).filter((key) => !allowedKeys.includes(key));
  if (schemaAllowsExtraFields(schema) || extraKeys.length > 0) {
    return { ok: false, message: extraKeys.length > 0 ? `包含未声明参数：${extraKeys.join(",")}` : "schema 未拒绝额外字段" };
  }
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
  const missing = required.filter((key) => args[key] === undefined);
  if (missing.length > 0) {
    return { ok: false, message: `缺少必填参数：${missing.join(",")}` };
  }
  return { ok: true, message: "ok" };
}

function sampleValueForJsonSchema(schema: unknown): unknown {
  if (!isRecord(schema)) return "test";
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === "number" || schema.type === "integer") return 1;
  if (schema.type === "boolean") return true;
  if (schema.type === "array") return [];
  if (schema.type === "object") return {};
  return "test";
}

function createMinimalValidArgs(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
  return Object.fromEntries(required.map((key) => [key, sampleValueForJsonSchema(properties[key])]));
}

export function runAiModuleSandboxTests(manifest: AiGeneratedModuleManifest, cases: AiModuleSandboxCase[] = []): AiModuleSandboxResult {
  const toolMap = new Map(manifest.tools.map((tool) => [tool.name, tool]));
  const defaultCases: AiModuleSandboxCase[] = manifest.tools.flatMap((tool) => [
    { id: `${tool.name}:minimal-valid`, tool: tool.name, args: createMinimalValidArgs(tool.argsSchema), expectValid: true },
    { id: `${tool.name}:extra-field`, tool: tool.name, args: { __unexpected: true }, expectValid: false }
  ]);
  const results = (cases.length > 0 ? cases : defaultCases).map((testCase) => {
    const tool = toolMap.get(testCase.tool);
    if (!tool) {
      return { id: testCase.id, tool: testCase.tool, passed: false, message: "sandbox 引用了不存在的工具" };
    }
    const validation = validateAgainstObjectSchema(tool.argsSchema, testCase.args);
    const passed = testCase.expectValid ? validation.ok : !validation.ok;
    return {
      id: testCase.id,
      tool: testCase.tool,
      passed,
      message: passed ? "ok" : validation.message
    };
  });
  return {
    passed: results.every((result) => result.passed),
    results
  };
}

export function createAiModuleInstallSession(
  manifest: AiGeneratedModuleManifest,
  registry: WidgetAssistantRegistry,
  sandboxCases: AiModuleSandboxCase[] = []
): AiModuleInstallSession {
  const preview = reviewAiGeneratedModule(manifest, registry);
  const sandbox = preview.canInstall
    ? runAiModuleSandboxTests(manifest, sandboxCases)
    : { passed: false, results: [{ id: "review", tool: "*", passed: false, message: "review 未通过，跳过 sandbox" }] };
  return {
    preview,
    sandbox,
    canRequestConfirmation: preview.canInstall && sandbox.passed
  };
}

export function installReviewedModule(
  preview: AiModuleInstallPreview,
  module: WidgetAssistantModule,
  registry: WidgetAssistantRegistry,
  confirmed: boolean,
  options: { sandbox?: AiModuleSandboxResult } = {}
): boolean {
  if (!confirmed || !preview.canInstall || (options.sandbox && !options.sandbox.passed)) {
    return false;
  }
  registry.register(module);
  return true;
}
