import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const WEATHER_MODULE_TYPE = "weather";

export const weatherAliases = ["天气", "weather"];

export const weatherCapabilities = ["打开天气", "查询城市天气", "切换城市", "关闭窗口"];

export const weatherShortcutExamples = ["北京天气", "帮我查一下北京天气", "上海天气", "帝都天气", "魔都天气"];

export const weatherShortcuts: ShortcutRule[] = [
  {
    id: "weather.query",
    intent: "query_weather",
    actions: ["查", "查询", "看"],
    examples: ["北京天气", "帮我查一下北京天气", "上海天气"],
    risk: "safe"
  }
];

export function createWeatherDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? WEATHER_MODULE_TYPE,
    type: WEATHER_MODULE_TYPE,
    name: definition?.name ?? "天气",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
