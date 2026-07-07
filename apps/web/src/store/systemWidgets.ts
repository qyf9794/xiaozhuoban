import { createId, type WidgetDefinition } from "@xiaozhuoban/domain";
import { DEFAULT_TV_PLAYLIST_URL } from "../widgets/tvShared";
import { DIAL_CLOCK_MARK_COUNT } from "../widgets/dialClockShared";
import { DEFAULT_WORLD_CLOCK_ZONES } from "../widgets/worldClockShared";

export const systemWidgetTemplates: Array<Omit<WidgetDefinition, "id" | "createdAt" | "updatedAt">> = [
  {
    kind: "system",
    type: "note",
    name: "便签",
    version: 1,
    description: "Markdown/富文本便签",
    inputSchema: { fields: [{ key: "content", label: "内容", type: "textarea" }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "todo",
    name: "待办",
    version: 1,
    description: "支持子任务的待办清单",
    inputSchema: { fields: [{ key: "text", label: "任务", type: "text", validation: { required: true } }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "calculator",
    name: "计算器",
    version: 1,
    inputSchema: {
      fields: [
        { key: "a", label: "A", type: "number" },
        { key: "b", label: "B", type: "number" }
      ]
    },
    outputSchema: { fields: [{ key: "sum", label: "和", type: "number" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {
      derived: [{ target: "sum", expression: "count_filled" }]
    },
    storagePolicy: { strategy: "ephemeral" }
  },
  {
    kind: "system",
    type: "countdown",
    name: "倒计时",
    version: 1,
    inputSchema: { fields: [{ key: "target", label: "目标时间", type: "date" }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "weather",
    name: "天气",
    version: 1,
    inputSchema: { fields: [{ key: "city", label: "城市", type: "text", defaultValue: "Shanghai" }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "headline",
    name: "重大新闻",
    version: 1,
    description: "实时热点新闻",
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ key: "items", label: "新闻", type: "text" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "market",
    name: "全球指数",
    version: 1,
    description: "实时全球指数与走势",
    inputSchema: { fields: [{ key: "indexCode", label: "指数", type: "select" }] },
    outputSchema: { fields: [{ key: "series", label: "走势", type: "text" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "music",
    name: "音乐播放器",
    version: 1,
    inputSchema: { fields: [{ key: "playlistUrl", label: "播放列表链接", type: "text" }] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "tv",
    name: "电视播放",
    version: 1,
    description: "订阅 m3u 直播源并按频道播放",
    inputSchema: {
      fields: [{ key: "playlistUrl", label: "直播订阅链接", type: "text", defaultValue: DEFAULT_TV_PLAYLIST_URL }]
    },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "dialClock",
    name: "时钟",
    version: 1,
    description: "玻璃背板的 BALMUDA 风格圆盘时钟",
    inputSchema: { fields: [] },
    outputSchema: {
      fields: [
        { key: "hour", label: "小时", type: "number" },
        { key: "minute", label: "分钟", type: "number" },
        { key: "second", label: "秒", type: "number" },
        { key: "markers", label: "刻度", type: "text", defaultValue: String(DIAL_CLOCK_MARK_COUNT) }
      ]
    },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "worldClock",
    name: "世界时钟",
    version: 1,
    description: "显示中国与世界主要城市的数字时钟",
    inputSchema: {
      fields: [{ key: "zones", label: "时区列表", type: "text", defaultValue: DEFAULT_WORLD_CLOCK_ZONES.join(",") }]
    },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "translate",
    name: "快速翻译",
    version: 1,
    description: "中英快速互译",
    inputSchema: {
      fields: [
        { key: "sourceText", label: "原文", type: "textarea" },
        { key: "sourceLang", label: "源语言", type: "select", options: ["自动", "中文", "英文"] },
        { key: "targetLang", label: "目标语言", type: "select", options: ["中文", "英文"] }
      ]
    },
    outputSchema: { fields: [{ key: "translatedText", label: "译文", type: "textarea" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "clipboard",
    name: "剪贴板历史",
    version: 1,
    description: "记录最近复制文本",
    inputSchema: { fields: [] },
    outputSchema: { fields: [{ key: "items", label: "历史", type: "textarea" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "converter",
    name: "单位换算",
    version: 1,
    description: "长度/重量/温度换算",
    inputSchema: {
      fields: [
        { key: "category", label: "类别", type: "select", options: ["长度", "重量", "温度"] },
        { key: "value", label: "数值", type: "number" }
      ]
    },
    outputSchema: { fields: [{ key: "result", label: "结果", type: "text" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "recorder",
    name: "录音机",
    version: 1,
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "messageBoard",
    name: "留言板",
    version: 1,
    description: "在线用户可实时同步留言",
    inputSchema: { fields: [{ key: "message", label: "留言内容", type: "textarea" }] },
    outputSchema: { fields: [{ key: "messages", label: "留言列表", type: "textarea" }] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "gomoku",
    name: "五子棋",
    version: 1,
    description: "轻量五子棋，支持人机与在线对战",
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "monopoly",
    name: "大富翁",
    version: 1,
    description: "轻量在线大富翁，支持 2-4 人邀请开局",
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  },
  {
    kind: "system",
    type: "guandan",
    name: "掼蛋",
    version: 1,
    description: "四人在线掼蛋，支持邀请开局、贡还牌与升级",
    inputSchema: { fields: [] },
    outputSchema: { fields: [] },
    uiSchema: { layout: "single-column" },
    logicSpec: {},
    storagePolicy: { strategy: "local" }
  }
];

export function createMissingSystemDefinitions(
  definitions: WidgetDefinition[],
  createdAt: string
): WidgetDefinition[] {
  const systemTypes = new Set(definitions.filter((item) => item.kind === "system").map((item) => item.type));
  return systemWidgetTemplates
    .filter((widget) => !systemTypes.has(widget.type))
    .map((item) => ({
      ...item,
      id: createId(`wd_${item.type}`),
      createdAt,
      updatedAt: createdAt
    }));
}
