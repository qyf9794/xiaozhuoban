import type { AssistantToolSpec, RealtimeModuleCatalogItem } from "@xiaozhuoban/assistant-core";

export type RealtimeCapabilityCatalogItem = RealtimeModuleCatalogItem & {
  catalogVersion: string;
  toolNames: string[];
  concurrencyKeys: string[];
  loadLevel: "catalog" | "scoped";
};

const GROUP_ALIASES: Record<string, string[]> = {
  app: ["小桌板", "窗口", "侧栏", "全屏", "设置", "搜索"],
  board: ["桌板", "桌面", "布局", "整理", "排列"],
  widget: ["小工具", "窗口", "关闭", "移动", "缩放", "置顶"]
};

const GROUP_NAMES: Record<string, string> = {
  app: "小桌板窗口",
  board: "桌板",
  widget: "小工具窗口"
};

function toCatalogType(tool: AssistantToolSpec) {
  if (tool.widgetType) return tool.widgetType;
  if (tool.name.startsWith("app.")) return "app";
  if (tool.name.startsWith("board.")) return "board";
  if (tool.name.startsWith("widget.")) return "widget";
  return tool.name.split(".")[0] || "tool";
}

function compactDescription(tool: AssistantToolSpec) {
  const risk = tool.risk && tool.risk !== "safe" ? `risk=${tool.risk}` : "";
  const target = tool.requiresTarget ? "requiresTarget" : "";
  const concurrency = tool.concurrencyKey ? `concurrency=${tool.concurrencyKey}` : "";
  return [tool.name, tool.description, target, risk, concurrency].filter(Boolean).join(" | ");
}

function unique(items: Array<string | undefined>) {
  return [...new Set(items.filter((item): item is string => Boolean(item)))];
}

function stableCatalogValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stableCatalogValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "catalogVersion")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableCatalogValue(item)])
    );
  }
  return value;
}

function hashStableCatalog(value: unknown): string {
  const text = JSON.stringify(stableCatalogValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createRealtimeCapabilityCatalogVersion(catalog: Array<Omit<RealtimeCapabilityCatalogItem, "catalogVersion">>): string {
  return `cat_${hashStableCatalog(catalog)}`;
}

export function createRealtimeCapabilityCatalog(
  tools: AssistantToolSpec[],
  moduleCatalog: RealtimeModuleCatalogItem[] = []
): RealtimeCapabilityCatalogItem[] {
  const activeTools = tools.filter((tool) => tool.scope !== "deferred");
  const modulesByType = new Map(moduleCatalog.map((module) => [module.type, module]));
  const grouped = new Map<string, AssistantToolSpec[]>();

  activeTools.forEach((tool) => {
    const type = toCatalogType(tool);
    grouped.set(type, [...(grouped.get(type) ?? []), tool]);
  });

  const catalog = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, groupTools]): Omit<RealtimeCapabilityCatalogItem, "catalogVersion"> => {
      const module = modulesByType.get(type);
      return {
        type,
        displayName: module?.displayName ?? GROUP_NAMES[type] ?? type,
        aliases: unique([...(module?.aliases ?? []), ...(GROUP_ALIASES[type] ?? [])]),
        capabilities: unique([...(module?.capabilities ?? []), ...groupTools.map(compactDescription)]),
        shortcutExamples: unique([...(module?.shortcutExamples ?? []), ...groupTools.flatMap((tool) => tool.examples ?? [])]).slice(0, 8),
        riskSummary: unique([
          ...(module?.riskSummary ?? []),
          ...groupTools.map((tool) => (tool.risk && tool.risk !== "safe" ? `${tool.name}:${tool.risk}` : undefined))
        ]),
        toolNames: groupTools.map((tool) => tool.name),
        concurrencyKeys: unique(groupTools.map((tool) => tool.concurrencyKey)),
        loadLevel: "catalog"
      };
    });
  const catalogVersion = createRealtimeCapabilityCatalogVersion(catalog);
  return catalog.map((item) => ({ catalogVersion, ...item }));
}
