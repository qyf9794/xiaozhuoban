import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const HEADLINE_MODULE_TYPE = "headline";

export const headlineAliases = ["新闻", "头条"];

export const headlineCapabilities = ["打开新闻", "刷新新闻", "关闭窗口"];

export const headlineShortcutExamples = ["今天有什么新闻", "最新头条", "暂停音乐，同时打开新闻"];

export const headlineShortcuts: ShortcutRule[] = [
  {
    id: "headline.refresh",
    intent: "headline_refresh",
    actions: ["新闻", "头条"],
    examples: ["今天有什么新闻", "最新头条"],
    risk: "safe"
  }
];

export function createHeadlineDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? HEADLINE_MODULE_TYPE,
    type: HEADLINE_MODULE_TYPE,
    name: definition?.name ?? "新闻",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
