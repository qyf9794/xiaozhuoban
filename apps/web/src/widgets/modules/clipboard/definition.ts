import type { ShortcutRule, WidgetAssistantDefinition } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";

export const CLIPBOARD_MODULE_TYPE = "clipboard";

export const clipboardAliases = ["剪贴板", "复制板"];

export const clipboardCapabilities = ["保存文本", "清空剪贴板", "关闭窗口"];

export const clipboardShortcutExamples = ["复制账号 demo 到剪贴板", "清一下剪贴板", "固定保存到剪贴板账号是 demo"];

export const clipboardShortcuts: ShortcutRule[] = [
  {
    id: "clipboard.add",
    intent: "clipboard_add",
    actions: ["复制", "保存"],
    examples: ["复制账号 demo 到剪贴板", "固定保存到剪贴板账号是 demo"],
    risk: "safe"
  },
  {
    id: "clipboard.clear",
    intent: "clipboard_clear",
    actions: ["清空", "清一下"],
    examples: ["清一下剪贴板", "清空剪贴板"],
    risk: "destructive"
  }
];

export function createClipboardDefinition(definition?: WidgetDefinition): WidgetAssistantDefinition {
  return {
    id: definition?.id ?? CLIPBOARD_MODULE_TYPE,
    type: CLIPBOARD_MODULE_TYPE,
    name: definition?.name ?? "剪贴板",
    description: definition?.description,
    category: "daily",
    multiInstance: true
  };
}
