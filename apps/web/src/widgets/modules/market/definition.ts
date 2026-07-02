import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const MARKET_MODULE_TYPE = "market";

export const marketAliases = ["行情", "市场", "指数", "美股", "A股", "港股"];

export const marketCapabilities = ["打开行情", "查询指数", "查询股票股价", "显示走势图", "刷新行情", "关闭窗口"];

export const marketShortcutExamples = ["看苹果股票", "查特斯拉股价", "看腾讯股票", "打开纳斯达克", "纳指给我看一眼", "美股怎么样", "A股行情", "看恒生指数"];

export const marketShortcuts: ShortcutRule[] = [
  {
    id: "market.indices",
    intent: "market_indices",
    actions: ["行情", "指数"],
    examples: ["看苹果股票", "查特斯拉股价", "看腾讯股票", "打开纳斯达克", "纳指给我看一眼", "美股怎么样", "A股行情", "看恒生指数"],
    risk: "safe"
  }
];

export function createMarketDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? MARKET_MODULE_TYPE,
    type: MARKET_MODULE_TYPE,
    name: definition?.name ?? "行情",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
