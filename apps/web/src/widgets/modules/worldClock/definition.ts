import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const WORLD_CLOCK_MODULE_TYPE = "worldClock";

export const worldClockAliases = ["世界时钟", "世界时间", "时区"];

export const worldClockCapabilities = ["打开世界时钟", "设置城市时区", "关闭窗口"];

export const worldClockShortcutExamples = ["NYC and Tokyo time", "看东京巴黎悉尼时间", "看东京时间"];

export const worldClockShortcuts: ShortcutRule[] = [
  {
    id: "worldClock.zones",
    intent: "world_clock_zones",
    actions: ["时间", "时区"],
    examples: ["NYC and Tokyo time", "看东京巴黎悉尼时间", "看东京时间"],
    risk: "safe"
  }
];

export function createWorldClockDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? WORLD_CLOCK_MODULE_TYPE,
    type: WORLD_CLOCK_MODULE_TYPE,
    name: definition?.name ?? "世界时钟",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
