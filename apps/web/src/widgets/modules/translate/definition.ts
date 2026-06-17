import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const TRANSLATE_MODULE_TYPE = "translate";

export const translateAliases = ["翻译", "翻译器", "什么意思"];

export const translateCapabilities = ["打开翻译", "翻译文本", "设置目标语言", "关闭窗口"];

export const translateShortcutExamples = ["翻译一下 hello", "hello 是什么意思"];

export const translateShortcuts: ShortcutRule[] = [
  {
    id: "translate.draft",
    intent: "translate_text",
    actions: ["翻译"],
    examples: ["翻译一下 hello", "hello 是什么意思"],
    risk: "safe"
  }
];

export function createTranslateDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? TRANSLATE_MODULE_TYPE,
    type: TRANSLATE_MODULE_TYPE,
    name: definition?.name ?? "翻译",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
