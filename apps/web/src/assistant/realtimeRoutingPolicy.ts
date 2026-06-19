import { getCommandPolicyPromptLines } from "@xiaozhuoban/assistant-core";

export const REALTIME_ADD_WIDGET_TOOL_NAME = "board.add_widget";

export const realtimeWidgetAliases: Record<string, string[]> = {
  note: ["便签", "笔记"],
  todo: ["待办", "任务", "清单"],
  tv: ["电视", "直播"],
  music: ["音乐", "歌曲", "歌", "播放器"],
  worldClock: ["世界时钟", "世界时间", "时区"],
  dialClock: ["时钟", "表盘", "钟表"],
  translate: ["翻译"],
  converter: ["换算", "单位"],
  clipboard: ["剪贴板"],
  recorder: ["录音"],
  messageBoard: ["留言板", "留言"],
  weather: ["天气"],
  countdown: ["倒计时", "计时器"],
  headline: ["新闻", "头条"],
  market: ["行情", "股票", "指数"],
  calculator: ["计算器"]
};

export const realtimeToolSelectionPolicyLines = getCommandPolicyPromptLines();

export const realtimeToolSelectionSessionPolicyLines = getCommandPolicyPromptLines({ includeSessionOnly: true });

export const realtimePlanSelectionPolicyLines = getCommandPolicyPromptLines();

export function inputMentionsRealtimeWidgetType(input: string | undefined, type: string): boolean {
  const text = input ?? "";
  return (realtimeWidgetAliases[type] ?? []).some((alias) => text.includes(alias));
}

export function findRealtimeWidgetType(input: string | undefined, targetHint?: string): string | undefined {
  return Object.keys(realtimeWidgetAliases).find(
    (type) => inputMentionsRealtimeWidgetType(input, type) || inputMentionsRealtimeWidgetType(targetHint, type)
  );
}
