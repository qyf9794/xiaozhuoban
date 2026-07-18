import { getCommandPolicyPromptLines } from "@xiaozhuoban/assistant-core";

export const REALTIME_ADD_WIDGET_TOOL_NAME = "board.add_widget";

const REALTIME_INTENT_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  // Realtime ASR may switch between simplified and traditional Chinese within
  // one persistent session. Canonicalize common action vocabulary before any
  // module or tool scoring so every router consumes the same intent text.
  [/繼續/g, "继续"],
  [/接著/g, "接着"],
  [/剛才/g, "刚才"],
  [/暫停/g, "暂停"],
  [/暫時/g, "暂时"],
  [/別/g, "别"],
  [/倫/g, "伦"],
  [/陳/g, "陈"],
  [/後/g, "后"],
  [/紅/g, "红"],
  [/傷/g, "伤"],
  [/這/g, "这"],
  [/個/g, "个"],
  [/來一首/g, "来一首"],
  [/來首/g, "来首"],
  [/來個/g, "来个"],
  [/來點/g, "来点"],
  [/幫/g, "帮"],
  [/給/g, "给"],
  [/請/g, "请"],
  [/換/g, "换"],
  [/聽/g, "听"],
  [/最後/g, "最后"],
  [/(?:待辦|代辦|代办|to[ -]?do)/gi, "待办"],
  [/留言版/g, "留言板"],
  [/便簽/g, "便签"],
  [/(?:記一下|記下|記錄)/g, "记一下"],
  [/剪貼板/g, "剪贴板"],
  [/倒計時/g, "倒计时"],
  [/計時器/g, "计时器"],
  [/計算器/g, "计算器"],
  [/計算/g, "计算"],
  [/世界時鐘/g, "世界时钟"],
  [/世界時間/g, "世界时间"],
  [/時區/g, "时区"],
  [/時鐘/g, "时钟"],
  [/錄音機/g, "录音机"],
  [/錄音/g, "录音"],
  [/翻譯/g, "翻译"],
  [/電視/g, "电视"],
  [/頻道/g, "频道"],
  [/音樂/g, "音乐"],
  [/播放機/g, "播放器"],
  [/天氣/g, "天气"],
  [/新聞/g, "新闻"],
  [/頭條/g, "头条"],
  [/關閉/g, "关闭"],
  [/關掉/g, "关掉"],
  [/打開/g, "打开"],
  [/移動/g, "移动"],
  [/縮小/g, "缩小"],
  [/調大/g, "调大"],
  [/調小/g, "调小"]
];

export function normalizeRealtimeIntentText(input: string | undefined): string {
  let text = (input ?? "").normalize("NFKC");
  for (const [pattern, replacement] of REALTIME_INTENT_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.trim();
}

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
  const text = normalizeRealtimeIntentText(input);
  return (realtimeWidgetAliases[type] ?? []).some((alias) => text.includes(alias));
}

export function findRealtimeWidgetType(input: string | undefined, targetHint?: string): string | undefined {
  return Object.keys(realtimeWidgetAliases).find(
    (type) => inputMentionsRealtimeWidgetType(input, type) || inputMentionsRealtimeWidgetType(targetHint, type)
  );
}
