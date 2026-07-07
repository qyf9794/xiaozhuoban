import type { AssistantToolResultStatus } from "@xiaozhuoban/assistant-core";

const SUCCESS_PREFIXES = ["好了", "可以", "完成了", "处理好了"] as const;

const WIDGET_TYPE_LABELS: Record<string, string> = {
  calculator: "计算器",
  clipboard: "剪贴板",
  converter: "换算器",
  countdown: "倒计时",
  dialClock: "表盘时钟",
  headline: "新闻",
  market: "行情",
  messageBoard: "留言板",
  music: "音乐播放器",
  note: "便签",
  recorder: "录音机",
  todo: "待办",
  translate: "翻译",
  tv: "电视",
  weather: "天气",
  worldClock: "世界时钟"
};

function stableIndex(seed: string, modulo: number): number {
  if (modulo <= 1) return 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % modulo;
}

function stripEndingPunctuation(value: string): string {
  return value.replace(/[。.!！\s]+$/g, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function widgetTypeFromData(data: unknown): string {
  if (!isRecord(data)) return "";
  const widgetType = data.widgetType;
  return typeof widgetType === "string" ? widgetType : "";
}

function normalizeSuccessMessage(message: string, toolName?: string, data?: unknown): string {
  const compact = stripEndingPunctuation(message.replace(/\s+/g, " "));
  const widgetType = widgetTypeFromData(data);
  const widgetLabel = widgetType ? WIDGET_TYPE_LABELS[widgetType] ?? "小工具" : "";

  if (toolName === "board.add_widget" && widgetLabel) {
    return `已打开${widgetLabel}`;
  }
  if (toolName === "widget.remove") return widgetLabel ? `已关闭${widgetLabel}` : "已关闭";
  if (toolName === "widget.move") return widgetLabel ? `${widgetLabel}位置已调整` : "位置已调整";
  if (toolName === "widget.resize") return widgetLabel ? `${widgetLabel}大小已调整` : "大小已调整";
  if (toolName === "widget.bring_to_front") return widgetLabel ? `${widgetLabel}已置顶` : "已置顶";
  if (toolName === "widget.fullscreen_focus") return widgetLabel ? `${widgetLabel}已全屏` : "已全屏";
  if (toolName === "widget.focus") return widgetLabel ? `已切到${widgetLabel}` : "已切到对应小工具";

  return compact || "已完成";
}

export function formatAssistantResultMessage(options: {
  status: AssistantToolResultStatus | string;
  message?: string;
  toolName?: string;
  data?: unknown;
  seed?: string;
}): string {
  const rawMessage = options.message?.trim() ?? "";
  if (options.status === "success") {
    const base = normalizeSuccessMessage(rawMessage, options.toolName, options.data);
    const seed = [options.seed, options.toolName, base].filter(Boolean).join("|");
    if (base.length > 18) {
      return `${base}。`;
    }
    const prefix = SUCCESS_PREFIXES[stableIndex(seed, SUCCESS_PREFIXES.length)] ?? "好了";
    if (base === "已完成") return `${prefix}。`;
    return `${prefix}，${base}。`;
  }
  if (options.status === "needs_confirmation") return rawMessage || "请确认。";
  if (options.status === "needs_clarification") return rawMessage || "再说短一点。";
  if (options.status === "cancelled") return rawMessage || "已取消。";
  if (options.status === "timed_out") return "执行超时。";
  return rawMessage || "暂时做不了。";
}
