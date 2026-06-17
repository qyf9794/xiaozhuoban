import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const COUNTDOWN_MODULE_TYPE = "countdown";

export const countdownAliases = ["倒计时", "计时器", "定时器", "定时"];

export const countdownCapabilities = ["设置倒计时", "暂停", "继续", "重置", "关闭窗口"];

export const countdownShortcutExamples = ["定时十分钟", "暂停计时", "继续定时器", "重置定时", "取消倒计时"];

export const countdownShortcuts: ShortcutRule[] = [
  {
    id: "countdown.set",
    intent: "countdown_set",
    actions: ["倒计时", "定时", "计时"],
    examples: ["定时十分钟", "帮我把倒计时设为 10 分钟"],
    risk: "safe"
  },
  {
    id: "countdown.control",
    intent: "countdown_control",
    actions: ["暂停", "继续", "重置", "取消"],
    examples: ["暂停计时", "继续定时器", "重置定时"],
    risk: "safe"
  }
];

export function createCountdownDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? COUNTDOWN_MODULE_TYPE,
    type: COUNTDOWN_MODULE_TYPE,
    name: definition?.name ?? "倒计时",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
