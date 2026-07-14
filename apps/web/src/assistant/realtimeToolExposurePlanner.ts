import {
  type AssistantToolSpec,
  type CompactAssistantContext,
  type RealtimeScopedModuleContext,
  type WidgetAssistantRegistry
} from "@xiaozhuoban/assistant-core";
import { REALTIME_ADD_WIDGET_TOOL_NAME, findRealtimeWidgetType, realtimeWidgetAliases } from "./realtimeRoutingPolicy";

export type RealtimeToolExposurePlan = {
  input: string;
  selectedModules: string[];
  exposedTools: AssistantToolSpec[];
  scopedContexts: RealtimeScopedModuleContext[];
  reasons: Record<string, string[]>;
  excludedReasons: Record<string, string>;
  confidence: number;
};

export type RealtimeToolExposurePlannerOptions = {
  maxTools?: number;
  maxModules?: number;
  maxToolsPerModule?: number;
};

type ToolCandidate = {
  tool: AssistantToolSpec;
  score: number;
  moduleType: string;
  reasons: string[];
};

const DEFAULT_MAX_TOOLS = 16;
const DEFAULT_MAX_MODULES = 4;
const DEFAULT_MAX_TOOLS_PER_MODULE = 8;

const WINDOW_TOOL_NAMES = new Set([
  REALTIME_ADD_WIDGET_TOOL_NAME,
  "widget.focus",
  "widget.fullscreen_focus",
  "widget.remove",
  "widget.move",
  "widget.resize",
  "widget.bring_to_front"
]);

const DESTRUCTIVE_WORDS = /(清空|删除|移除|删掉|全部删|清除|清理|覆盖)/;
const OPEN_OR_CREATE_WORDS = /(打开|新增|新建|创建|唤出|调出|放一个|来一个|开一个|播放|听|看|查)/;
const TARGET_REQUIRED_PENALTY = 40;
const MARKET_WORDS = /(行情|股票|股价|个股|指数|纳指|纳斯达克|NASDAQ|NDX|恒生|上证|美股|A股|港股)/i;
const MARKET_TICKER_QUERY_PATTERN = /(?:(?:查|查询|搜索|搜).{0,8}\b[A-Z]{1,6}\b|(?:看|打开).{0,8}\b[A-Z]{1,6}\b.{0,8}(?:股票|股价|行情))/i;
const TV_CHANNEL_CODE_PATTERN = /\b(?:BBC|CNN|CNA|HBO|CCTV|CGTN|NHK|TVB|Bloomberg)\b/i;
const TV_CHANNEL_QUERY_PATTERN = /(?:看|打开|播放|切到|换到|想看|我要看|我想看).{0,12}\b(?:BBC|CNN|CNA|HBO|CCTV|CGTN|NHK|TVB|Bloomberg)\b/i;

const MODULE_INTENT_PATTERNS: Record<string, RegExp> = {
  calculator: /(计算器|算一下|计算.*多少|[一二三四五六七八九十百千万\d]+\s*(加|减|乘|除)|十二乘十二)/,
  clipboard: /(剪贴板|复制|保存|存起来|口令|验证码|清理.*记录)/,
  converter: /(换算|单位|转成|摄氏|华氏|Fahrenheit|斤|公斤|克|米|公里)/i,
  countdown: /(倒计时|计时器|定时|计时|分钟后|秒|小时|以后叫我|一分半|半小时|提醒我)/,
  dialClock: /(表盘|钟表|时钟|夜间模式|别太亮)/,
  headline: /(新闻|头条|刚刚有什么)/,
  market: /(行情|股票|股价|个股|指数|纳指|纳斯达克|NASDAQ|NDX|恒生|上证|美股|A股|港股|(?:(?:查|查询|搜索|搜).{0,8}\b[A-Z]{1,6}\b|(?:看|打开).{0,8}\b[A-Z]{1,6}\b.{0,8}(?:股票|股价|行情)))/i,
  messageBoard: /(留言板|留言|回复收到|发一句)/,
  music: /(音乐|歌曲|歌|播放器|王菲|陈奕迅|周杰伦|红豆|十年|轻松|放松|睡前|白噪音|自然声|钢琴|歌单|试听|Apple Music|token|登录)/,
  note: /(便签|笔记|记下|会议纪要|记一下|写下|写上|追加|备忘)/,
  recorder: /(录音|录一段|刚才录音|回放)/,
  todo: /(待办|任务|清单|提醒|叫我|复盘|买牛奶|买咖啡豆|订酒店|提交报告|勾掉|完成)/,
  translate: /(翻译|中文|英文|good night)/i,
  tv: /(电视|直播|CCTV|BBC|CNN|CNA|HBO|CGTN|NHK|TVB|Bloomberg|频道|电视台|电影频道|央视)/i,
  weather: /(天气|气温|冷不冷|冷|热|下雨|带伞|出门|北京|上海|杭州|广州|成都|武汉|波士顿|洛杉矶)/
};

const TOOL_INTENT_PATTERNS: Record<string, RegExp> = {
  "app.sidebar.set": /(侧边栏|左边栏|侧栏)/,
  "app.fullscreen.set": /(全屏|沉浸|普通窗口)/,
  "app.settings.open": /(设置|语音入口|检查)/,
  "app.command_palette.open": /(命令面板|搜索命令|找功能|我要找功能)/,
  "app.ai_dialog.open": /(AI 小工具|新工具|做一个新工具)/,
  "app.wallpaper.pick": /(壁纸|背景|桌面背景|换壁纸|更换壁纸|换背景|选择壁纸)/,
  "assistant.reply": /(告诉我|回复|解释|为什么|提示|优先|确认|不能撤销|是否正在|不要影响)/,
  "assistant.runtime_diagnostics": /(记录|诊断|错误|失败|trace|状态|日志|保存|不要忘记|不要重复|没把握|交给 realtime|工具清单|弱网|断线|恢复会话|会话已建立|能力按需|高置信|低于|不要丢|全局工具摘要|不能播放|不要一直找)/i,
  "board.add_widget": /(打开|新增|新建|创建|再打开|来一个|放一个|放上去|开一个|实例|播放器|窗口)/,
  "board.auto_align": /(整理|对齐|整齐|排版|重新排版)/,
  "board.create": /(新开.*桌板|新建.*桌板|学习桌板)/,
  "board.rename": /(改名|重命名)/,
  "board.switch": /(切回|切换.*桌板|工作台)/,
  "board.delete": /(删除.*桌板|删掉.*桌板)/,
  "widget.bring_to_front": /(最前|置顶|前面|别被挡住|不要挡住|不要遮住|放最前)/,
  "widget.focus": /(聚焦|切到|切回|窗口|面板|前面|当前工具|当前小工具|设为当前|设成当前|作为当前)/,
  "widget.fullscreen_focus": /(全屏|沉浸)/,
  "widget.move": /(拖|移动|移到|挪|右上|左上|左下|右侧|底部|居中|旁边|并排|排成|放到|调到|固定在|盖住|遮住|挡住|不要挡住|不要遮住)/,
  "widget.remove": /(关闭|关掉|收起|收起来|移除|删掉|删除)/,
  "widget.resize": /(调大|调小|放大|缩小|调宽|宽一点|宽度|缩窄|太大|太小|大小|尺寸|文字放大|封面|长文本)/,
  "calculator.set_display": /(计算器|算一下|计算.*多少|[一二三四五六七八九十百千万\d]+\s*(加|减|乘|除)|十二乘十二)/,
  "clipboard.add_text": /(复制|保存|存起来|口令|验证码|固定保存)/,
  "clipboard.clear": /(清理剪贴板|清空剪贴板|清理.*记录|清理普通|保留 pinned|保留固定)/,
  "converter.set": /(换算|转成|摄氏|华氏|Fahrenheit|斤|公斤|克|米|公里)/i,
  "countdown.pause": /(暂停.*(计时|倒计时)|暂停现在的计时器)/,
  "countdown.reset": /(重置.*(计时|倒计时))/,
  "countdown.resume": /(继续.*(计时|倒计时)|继续刚才那个倒计时)/,
  "countdown.set": /(倒计时|定时|计时|分钟后|秒|小时|以后叫我|一分半|半小时|提醒我)/,
  "dialClock.set_night_mode": /(夜间模式|别太亮|钟表|表盘)/,
  "headline.request_refresh": /(新闻|头条|刚刚有什么)/,
  "market.set_indices": /(行情|股票|股价|个股|指数|纳指|纳斯达克|NASDAQ|NDX|恒生|上证|美股|A股|港股|(?:(?:查|查询|搜索|搜).{0,8}\b[A-Z]{1,6}\b|(?:看|打开).{0,8}\b[A-Z]{1,6}\b.{0,8}(?:股票|股价|行情)))/i,
  "messageBoard.clear_draft": /(清空留言|清理留言|留言输入)/,
  "messageBoard.send": /(留言板|留言|回复收到|发一句|发送消息|发送测试|我在测试)/,
  "music.auth_status": /(token|登录|已登录|账号|入口|试听|试听版|MusicKit|Apple Music|可用)/i,
  "music.next": /(下一首)/,
  "music.pause": /(暂停.*(音乐|歌)|音乐先暂停)/,
  "music.play": /(播放|来一首|来个|我想听|给我一首|王菲|陈奕迅|周杰伦|孙燕姿|Beyond|李宗盛|Taylor Swift|Adele|Coldplay|王力宏|梁静茹|钢琴|英文歌|红豆|十年|遇见|海阔天空|山丘|Lover|Hello|Yellow|勇气)/i,
  "music.previous": /(上一首)/,
  "music.resume": /(继续.*(歌|音乐|播放)|继续刚才的歌)/,
  "music.search": /(搜|搜索|找|轻松|放松|经典|白噪音|自然声|睡前)/,
  "note.clear": /(清空便签|清除便签)/,
  "note.write": /(便签|记下|会议纪要|记一下|备忘|写下|写上|追加|记录)/,
  "recorder.pause": /(暂停录音|暂停.*回放)/,
  "recorder.play": /(播放刚才录音|录音回放|回放)/,
  "recorder.start": /(开始录音|录一段|帮我录)/,
  "recorder.stop": /(停止录音)/,
  "todo.add_item": /(添加待办|待办|提醒|叫我|复盘|买牛奶|买咖啡豆|订酒店|提交报告|休息眼睛)/,
  "todo.clear_completed": /(清空.*已完成|清理.*已完成|清理已完成)/,
  "todo.complete_item": /(勾掉|完成.*待办|把.*勾掉)/,
  "translate.set_draft": /(翻译|中文|英文|good night)/i,
  "tv.fullscreen": /(电视.*全屏|全屏.*电视|全屏.*(?:播放|看|切到|换到|调到|CNA|BBC|CNN|NHK|Bloomberg|凤凰|France|DW|Al\s*Jazeera))/i,
  "tv.pause": /(暂停电视|电视.*暂停)/,
  "tv.play": /(播放 CCTV|打开.*电视|看.*电视|想看|BBC|CNN|CNA|HBO|CGTN|NHK|TVB|Bloomberg|频道|电视台|电影频道|央视|直播)/i,
  "tv.select_channel": /(CCTV|BBC|CNN|CNA|HBO|CGTN|NHK|TVB|Bloomberg|频道|电视台|电影频道|切到.*电视|电视切到|想看)/i,
  "weather.set_city": /(天气|冷不冷|冷|热|下雨|带伞|出门|北京|上海|杭州|广州|成都|武汉|波士顿|洛杉矶)/,
  "worldClock.set_zones": /(世界时钟|世界时间|本地时间|当地时间|时间|时区|几点|东京|巴黎|纽约|伦敦|北京)/
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function includesAny(input: string, values: string[]): boolean {
  return values.some((value) => Boolean(value) && input.includes(value));
}

function toolModuleType(tool: AssistantToolSpec): string {
  if (tool.widgetType) return tool.widgetType;
  if (tool.name.startsWith("app.")) return "app";
  if (tool.name.startsWith("board.")) return "board";
  if (tool.name.startsWith("widget.")) return "widget";
  return tool.name.split(".")[0] || "tool";
}

function widgetsOfType(context: CompactAssistantContext, moduleType: string) {
  return context.widgets.filter((widget) => widget.type === moduleType);
}

function hasDefinitionForType(context: CompactAssistantContext, moduleType: string): boolean {
  return Boolean(context.availableDefinitions?.some((definition) => definition.type === moduleType));
}

function moduleAliases(moduleType: string, registry?: WidgetAssistantRegistry): string[] {
  const module = registry?.get(moduleType);
  const catalog = registry?.getRealtimeCatalog().find((item) => item.type === moduleType);
  return unique([moduleType, ...(realtimeWidgetAliases[moduleType] ?? []), ...(module?.aliases ?? []), ...(catalog?.aliases ?? [])]);
}

function moduleTextHints(moduleType: string, registry?: WidgetAssistantRegistry): string[] {
  const catalog = registry?.getRealtimeCatalog().find((item) => item.type === moduleType);
  const module = registry?.get(moduleType);
  return unique([
    ...moduleAliases(moduleType, registry),
    ...(catalog?.capabilities ?? []),
    ...(catalog?.shortcutExamples ?? []),
    ...(module?.shortcuts.flatMap((shortcut) => shortcut.examples) ?? [])
  ]);
}

function readWidgetAssistantStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function contextTvChannelNames(context: CompactAssistantContext): string[] {
  return [
    ...context.widgets
      .filter((widget) => widget.type === "tv")
      .flatMap((widget) => [
        ...readWidgetAssistantStringList(widget.assistantState?.channelNames),
        ...readWidgetAssistantStringList(widget.assistantState?.assistantChannelNames)
      ]),
    ...readWidgetAssistantStringList(context.moduleStates?.tv?.channelNames),
    ...readWidgetAssistantStringList(context.moduleStates?.tv?.assistantChannelNames)
  ];
}

function hasTvChannelNameMatch(input: string, context: CompactAssistantContext): boolean {
  const normalizedInput = input.toLowerCase();
  return contextTvChannelNames(context).some((name) => {
    const compactName = name.toLowerCase();
    return compactName.length > 1 && (normalizedInput.includes(compactName) || (TV_CHANNEL_CODE_PATTERN.test(name) && TV_CHANNEL_CODE_PATTERN.test(input)));
  });
}

function isTvChannelIntent(input: string, context: CompactAssistantContext): boolean {
  if (MARKET_WORDS.test(input) || MARKET_TICKER_QUERY_PATTERN.test(input)) return false;
  return TV_CHANNEL_QUERY_PATTERN.test(input) || (/(电视|频道|直播)/.test(input) && TV_CHANNEL_CODE_PATTERN.test(input)) || hasTvChannelNameMatch(input, context);
}

function scoreModule(input: string, moduleType: string, context: CompactAssistantContext, registry?: WidgetAssistantRegistry): number {
  let score = 0;
  const aliases = moduleAliases(moduleType, registry);
  const hints = moduleTextHints(moduleType, registry);
  const intentPattern = MODULE_INTENT_PATTERNS[moduleType];
  const hasPatternMatch = Boolean(intentPattern?.test(input));
  const hasTextMatch = includesAny(input, aliases) || includesAny(input, hints) || hasPatternMatch;
  if (!hasTextMatch) return 0;
  if (includesAny(input, aliases)) score += 40;
  if (includesAny(input, hints)) score += 30;
  if (hasPatternMatch) score += 40;
  if (widgetsOfType(context, moduleType).length > 0) score += 10;
  if (context.focusedWidget?.type === moduleType) score += 10;
  if (hasDefinitionForType(context, moduleType) && OPEN_OR_CREATE_WORDS.test(input)) score += 10;
  if (moduleType === "tv" && isTvChannelIntent(input, context)) score += 50;
  return score;
}

function selectModules(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  registry: WidgetAssistantRegistry | undefined,
  maxModules: number
): string[] {
  const knownModules = unique([
    ...tools.map(toolModuleType),
    ...(registry?.getRealtimeCatalog().map((item) => item.type) ?? []),
    ...Object.keys(realtimeWidgetAliases)
  ]).filter((moduleType) => !["app", "board", "widget", "assistant"].includes(moduleType));
  const patternSelected = Object.entries(MODULE_INTENT_PATTERNS)
    .filter(([moduleType, pattern]) => knownModules.includes(moduleType) && pattern.test(input))
    .map(([moduleType]) => moduleType);
  const toolIntentSelected = tools
    .filter((tool) => TOOL_INTENT_PATTERNS[tool.name]?.test(input))
    .map(toolModuleType)
    .filter((moduleType) => knownModules.includes(moduleType));

  const scored = knownModules
    .map((moduleType) => ({ moduleType, score: scoreModule(input, moduleType, context, registry) }))
    .filter((item) => item.score >= 30)
    .sort((left, right) => right.score - left.score || left.moduleType.localeCompare(right.moduleType));

  const explicitWidgetType = findRealtimeWidgetType(input);
  const selected = unique([
    ...(explicitWidgetType ? [explicitWidgetType] : []),
    ...(knownModules.includes("tv") && isTvChannelIntent(input, context) ? ["tv"] : []),
    ...patternSelected,
    ...toolIntentSelected,
    ...scored.map((item) => item.moduleType)
  ]).slice(0, maxModules);

  return selected;
}

function isRelevantWindowTool(tool: AssistantToolSpec, input: string, selectedModules: string[]): boolean {
  if (!WINDOW_TOOL_NAMES.has(tool.name)) return false;
  if (tool.name === REALTIME_ADD_WIDGET_TOOL_NAME) {
    return selectedModules.length > 0 && (OPEN_OR_CREATE_WORDS.test(input) || Boolean(TOOL_INTENT_PATTERNS[REALTIME_ADD_WIDGET_TOOL_NAME]?.test(input)));
  }
  if (tool.name === "widget.remove") return Boolean(TOOL_INTENT_PATTERNS["widget.remove"]?.test(input));
  if (tool.name === "widget.fullscreen_focus") return /(全屏|沉浸)/.test(input);
  if (tool.name === "widget.focus") return /(聚焦|切到|前面|最前|置顶|打开|看|播放|听|当前工具|当前小工具|设为当前|设成当前|作为当前)/.test(input);
  if (tool.name === "widget.bring_to_front") return Boolean(TOOL_INTENT_PATTERNS["widget.bring_to_front"]?.test(input));
  if (tool.name === "widget.move") return Boolean(TOOL_INTENT_PATTERNS["widget.move"]?.test(input));
  if (tool.name === "widget.resize") return Boolean(TOOL_INTENT_PATTERNS["widget.resize"]?.test(input));
  return selectedModules.length > 0;
}

function canUseTargetTool(tool: AssistantToolSpec, context: CompactAssistantContext, moduleType: string): boolean {
  if (!tool.requiresTarget && !tool.name.startsWith("widget.")) return true;
  if (moduleType === "widget") return context.widgets.length > 0;
  return widgetsOfType(context, moduleType).length > 0 || hasDefinitionForType(context, moduleType);
}

function scoreTool(
  input: string,
  tool: AssistantToolSpec,
  context: CompactAssistantContext,
  selectedModules: string[],
  registry?: WidgetAssistantRegistry
): ToolCandidate | null {
  if (tool.scope === "deferred") return null;
  if (tool.risk === "destructive" && !DESTRUCTIVE_WORDS.test(input)) return null;

  const moduleType = toolModuleType(tool);
  const reasons: string[] = [];
  let score = 0;
  const selected = selectedModules.includes(moduleType);
  const isWindowTool = WINDOW_TOOL_NAMES.has(tool.name);
  const aliases = moduleAliases(moduleType, registry);
  const toolPattern = TOOL_INTENT_PATTERNS[tool.name];
  const hasToolIntentMatch = Boolean(toolPattern?.test(input));

  if (selected) {
    score += 40;
    reasons.push("selected_module");
  }
  if (hasToolIntentMatch) {
    score += 50;
    reasons.push("tool_intent_match");
  }
  if (tool.name === "music.auth_status" && /(登录|已登录|账号|入口|token|试听|MusicKit|Apple Music|可用)/i.test(input)) {
    score += 80;
    reasons.push("auth_status_intent");
  }
  if (tool.widgetType && includesAny(input, aliases)) {
    score += 40;
    reasons.push("module_alias_match");
  }
  if (includesAny(input, tool.examples ?? [])) {
    score += 30;
    reasons.push("tool_example_match");
  }
  if (tool.description && includesAny(input, [tool.description])) {
    score += 10;
    reasons.push("tool_description_match");
  }
  if (tool.widgetType && widgetsOfType(context, tool.widgetType).length > 0) {
    score += 25;
    reasons.push("mounted_widget");
  }
  if (tool.widgetType && context.focusedWidget?.type === tool.widgetType) {
    score += 20;
    reasons.push("focused_widget");
  }
  if (!tool.risk || tool.risk === "safe") {
    score += 20;
    reasons.push("safe_tool");
  }
  if ((tool.argumentKeys?.length ?? 0) > 0) {
    score += 5;
    reasons.push("declared_arguments");
  }
  if (!canUseTargetTool(tool, context, tool.widgetType ?? selectedModules[0] ?? moduleType)) {
    score -= TARGET_REQUIRED_PENALTY;
    reasons.push("target_unavailable");
  }
  if (isWindowTool && isRelevantWindowTool(tool, input, selectedModules)) {
    score += 25;
    reasons.push("relevant_window_tool");
  }
  if (tool.name === REALTIME_ADD_WIDGET_TOOL_NAME && selectedModules.some((module) => hasDefinitionForType(context, module))) {
    score += 25;
    reasons.push("definition_available");
  }

  const globallyRelevant =
    (moduleType === "app" && /(侧边栏|左边栏|侧栏|全屏|设置|搜索|命令面板|小桌板|AI 小工具|新工具)/.test(input)) ||
    (moduleType === "assistant" && /(告诉我|回复|解释|记录|诊断|错误|失败|trace|不要忘记|不要重复回复)/.test(input)) ||
    (moduleType === "board" && /(桌面|桌板|整理|排列|对齐|新桌板|切换桌板|工作台|重命名|改名|删除桌板)/.test(input));
  if (globallyRelevant) {
    score += 35;
    reasons.push("global_desktop_match");
  }

  const hasIntentReason = reasons.some((reason) =>
    [
      "selected_module",
      "module_alias_match",
      "tool_example_match",
      "tool_description_match",
      "relevant_window_tool",
      "definition_available",
      "global_desktop_match",
      "tool_intent_match",
      "mounted_widget",
      "focused_widget"
    ].includes(reason)
  );
  if (!hasIntentReason) return null;
  if (!selected && tool.widgetType && !isWindowTool) return null;
  if (isWindowTool && !isRelevantWindowTool(tool, input, selectedModules)) return null;
  if (score <= 0) return null;

  return { tool, score, moduleType, reasons };
}

function candidateLimitForModule(moduleType: string, selectedModules: string[], maxToolsPerModule: number): number {
  if (["app", "board", "widget"].includes(moduleType)) return Math.min(maxToolsPerModule, 4);
  return selectedModules.length > 1 ? Math.min(maxToolsPerModule, 5) : maxToolsPerModule;
}

export function buildRealtimeToolExposurePlan(
  input: string,
  context: CompactAssistantContext,
  tools: AssistantToolSpec[],
  registry?: WidgetAssistantRegistry,
  options: RealtimeToolExposurePlannerOptions = {}
): RealtimeToolExposurePlan {
  const text = input.trim();
  const maxTools = options.maxTools ?? DEFAULT_MAX_TOOLS;
  const maxModules = options.maxModules ?? DEFAULT_MAX_MODULES;
  const maxToolsPerModule = options.maxToolsPerModule ?? DEFAULT_MAX_TOOLS_PER_MODULE;
  const selectedModules = selectModules(text, context, tools, registry, maxModules);
  const selectedModuleSet = new Set(selectedModules);
  const candidates = tools
    .map((tool) => scoreTool(text, tool, context, selectedModules, registry))
    .filter((candidate): candidate is ToolCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name));

  const countsByModule = new Map<string, number>();
  const exposed: ToolCandidate[] = [];
  const excludedReasons: Record<string, string> = {};

  for (const candidate of candidates) {
    const count = countsByModule.get(candidate.moduleType) ?? 0;
    if (count >= candidateLimitForModule(candidate.moduleType, selectedModules, maxToolsPerModule)) {
      excludedReasons[candidate.tool.name] = "module_tool_limit";
      continue;
    }
    if (exposed.length >= maxTools) {
      excludedReasons[candidate.tool.name] = "global_tool_limit";
      continue;
    }
    exposed.push(candidate);
    countsByModule.set(candidate.moduleType, count + 1);
  }

  for (const tool of tools) {
    if (exposed.some((candidate) => candidate.tool.name === tool.name) || excludedReasons[tool.name]) continue;
    if (tool.scope === "deferred") {
      excludedReasons[tool.name] = "deferred_scope";
      continue;
    }
    const moduleType = toolModuleType(tool);
    if (tool.widgetType && !selectedModuleSet.has(tool.widgetType)) {
      excludedReasons[tool.name] = "module_mismatch";
      continue;
    }
    if (tool.risk === "destructive" && !DESTRUCTIVE_WORDS.test(text)) {
      excludedReasons[tool.name] = "destructive_not_requested";
      continue;
    }
    excludedReasons[tool.name] = "low_score";
  }

  const scopedContexts = selectedModules
    .map((moduleType) =>
      registry?.getScopedContextForModule(moduleType, {
        userText: text,
        selectedToolHint: exposed.find((candidate) => candidate.moduleType === moduleType)?.tool.name,
        compactContext: context,
        tools
      })
    )
    .filter((value): value is RealtimeScopedModuleContext => Boolean(value));

  const highestScore = exposed[0]?.score ?? 0;
  return {
    input: text,
    selectedModules,
    exposedTools: exposed.map((candidate) => candidate.tool),
    scopedContexts,
    reasons: Object.fromEntries(exposed.map((candidate) => [candidate.tool.name, candidate.reasons])),
    excludedReasons,
    confidence: Math.max(0, Math.min(1, highestScore / 120))
  };
}
