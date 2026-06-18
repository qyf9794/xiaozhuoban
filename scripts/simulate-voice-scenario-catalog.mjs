import fs from "node:fs";
import path from "node:path";

const catalogPath = path.join("docs", "realtime-voice-scenario-command-catalog-700.md");
const reportPath = path.join("docs", "realtime-voice-scenario-catalog-simulation-report.md");

const widgetAliases = {
  note: ["便签", "笔记"],
  todo: ["待办", "任务", "清单", "提醒"],
  tv: ["电视", "直播", "CCTV", "央视", "电影频道", "体育频道"],
  music: ["音乐", "歌曲", "歌", "播放器", "王菲", "陈奕迅", "周杰伦", "孙燕姿", "林俊杰", "张学友", "邓紫棋", "五月天", "Beyond", "蔡健雅", "李宗盛", "Taylor Swift", "Adele", "Coldplay", "王力宏", "刘若英", "梁静茹", "放松", "轻柔钢琴"],
  worldClock: ["世界时钟", "世界时间", "时区", "北京伦敦纽约", "东京", "巴黎", "纽约", "洛杉矶", "当地时间"],
  dialClock: ["表盘", "钟表", "时钟", "夜间模式", "夜灯"],
  translate: ["翻译", "英文", "中文", "什么意思"],
  converter: ["换算", "公里", "米", "公斤", "千克", "克", "斤", "华氏", "摄氏", "平方米", "平方厘米"],
  clipboard: ["剪贴板", "复制", "固定保存", "验证码", "口令", "token"],
  recorder: ["录音", "录一段", "回放", "会议开始", "会议结束"],
  messageBoard: ["留言板", "留言", "给大家说", "发送"],
  weather: ["天气", "冷不冷", "下雨", "带伞", "体感", "适合出门", "适合跑步", "适合洗车"],
  countdown: ["倒计时", "计时器", "定时", "分钟后", "小时后", "秒", "泡茶", "专注"],
  headline: ["新闻", "头条", "摘要"],
  market: ["行情", "股票", "指数", "纳指", "道指", "恒生", "上证", "深证", "美股", "A股", "全球指数"],
  calculator: ["计算", "加", "减", "乘", "除"]
};

const widgetToolDefaults = {
  note: "note.write",
  todo: "todo.add_item",
  tv: "tv.play",
  music: "music.play",
  worldClock: "worldClock.set_zones",
  dialClock: "dialClock.set_night_mode",
  translate: "translate.set_draft",
  converter: "converter.set",
  clipboard: "clipboard.add_text",
  recorder: "recorder.start",
  messageBoard: "messageBoard.send",
  weather: "weather.set_city",
  countdown: "countdown.set",
  headline: "headline.request_refresh",
  market: "market.set_indices",
  calculator: "calculator.set_display"
};

function parseCatalog() {
  const text = fs.readFileSync(catalogPath, "utf8");
  return [...text.matchAll(/^(\d{3})\. (.+)$/gm)].map((match) => ({
    id: Number(match[1]),
    text: match[2]
  }));
}

function includesAny(text, aliases) {
  return aliases.some((alias) => text.includes(alias));
}

function pushUnique(items, item) {
  if (!items.includes(item)) items.push(item);
}

function mentionedWidgets(text) {
  return Object.entries(widgetAliases)
    .filter(([, aliases]) => includesAny(text, aliases))
    .map(([type]) => type);
}

function isTranslationOnly(text) {
  return /翻译/.test(text) && /(不要执行|只翻译|不是执行|写到便签)/.test(text);
}

function isMentionOnly(text) {
  return /(写到便签|记到便签|待办.*加一条|添加待办|记录|日志|诊断|监控|保存|翻译|不是发送|不要加载.*发送工具|不能发送)/.test(text) && /(关闭留言板|关闭|打开|播放|执行|工具|命令|发送)/.test(text);
}

function classify(command) {
  const text = command.text;
  const tools = [];
  const notes = [];
  const widgets = mentionedWidgets(text);

  if (/侧栏|侧边栏|左边栏/.test(text)) pushUnique(tools, "app.sidebar.set");
  if (/进入.*全屏|退出全屏|沉浸|普通窗口/.test(text) && !/电视全屏|窗口全屏/.test(text)) pushUnique(tools, "app.fullscreen.set");
  if (/打开.*设置|显示设置|配置/.test(text)) pushUnique(tools, "app.settings.open");
  if (/命令面板|搜索面板|找功能/.test(text)) pushUnique(tools, "app.command_palette.open");
  if (/AI 小工具|AI 生成|新工具/.test(text)) pushUnique(tools, "app.ai_dialog.open");

  if (/新建.*桌板|创建.*桌板|新开.*桌板/.test(text)) pushUnique(tools, "board.create");
  if (/改名|重命名|命名为|名字先叫/.test(text) && /桌板/.test(text)) pushUnique(tools, "board.rename");
  if (!/设置/.test(text) && (/(切回|切到|回到|打开).*桌板|回到工作台|回默认/.test(text))) pushUnique(tools, "board.switch");
  if (/整理|自动整理|排版|排列|对齐|网格/.test(text) && /(桌面|小工具|窗口|桌板)/.test(text)) pushUnique(tools, "board.auto_align");

  if (!isTranslationOnly(text) && !isMentionOnly(text) && /(关闭|关掉|收起|删除|移除|保留|只保留)/.test(text)) {
    for (const widget of widgets) {
      if (!["translate", "converter", "calculator"].includes(widget)) pushUnique(tools, "widget.remove");
    }
  }
  if (/放最前|置顶|别被挡住|盖住/.test(text)) pushUnique(tools, "widget.bring_to_front");
  if (/移到|拖到|放到|固定在|并排|右上角|左下角|右侧|左侧|底部|中间|中央/.test(text)) pushUnique(tools, "widget.move");
  if (/放大|调大|缩小|调小|调宽|宽一点|宽度|太小/.test(text)) pushUnique(tools, "widget.resize");
  if (/聚焦|切到.*窗口|放到前面|放最前/.test(text)) pushUnique(tools, "widget.focus");
  if (/全屏看|窗口全屏|电视全屏|面板放大/.test(text)) pushUnique(tools, "widget.fullscreen_focus");
  if (/打开.*(音乐|电视|天气|倒计时|待办|剪贴板|翻译|计算器|行情|新闻|世界时钟|录音机|表盘|时钟|留言板)|再打开|新增一个|新增.*窗口|如果.*没开|如果.*没有/.test(text)) {
    pushUnique(tools, "board.add_widget");
  }

  if (/暂停.*音乐|音乐.*暂停|先暂停当前歌曲/.test(text)) pushUnique(tools, "music.pause");
  if (/继续.*歌|继续音乐/.test(text)) pushUnique(tools, "music.resume");
  if (/下一首/.test(text)) pushUnique(tools, "music.next");
  if (/上一首/.test(text)) pushUnique(tools, "music.previous");
  if (/搜|搜索|找|来点|听点|想听|播放|来一首|放一点|放首|换成|放松|轻柔钢琴/.test(text) && widgets.includes("music") && !/放最前|播放器放到前面|播放器.*置顶/.test(text)) {
    const shouldSearch = /先搜索不要|展示列表|先不播放|不要立刻播放|不一定播放|重新搜索|重新搜|不要沿用|不是上一首/.test(text);
    pushUnique(tools, shouldSearch ? "music.search" : "music.play");
  }

  if (/暂停.*电视|电视.*暂停|电视音频先暂停/.test(text)) pushUnique(tools, "tv.pause");
  if (/电视全屏|CCTV.*全屏|全屏.*电视/.test(text)) pushUnique(tools, "tv.fullscreen");
  if (/CCTV|央视|电影频道|体育频道|新闻直播|电视/.test(text) && /(播放|切到|选择|打开|看)/.test(text)) {
    pushUnique(tools, /切到|选择/.test(text) ? "tv.select_channel" : "tv.play");
  }

  if (widgets.includes("weather")) pushUnique(tools, "weather.set_city");
  if (widgets.includes("countdown")) {
    if (/暂停|停止/.test(text)) pushUnique(tools, "countdown.pause");
    else if (/继续|恢复/.test(text)) pushUnique(tools, "countdown.resume");
    else if (/重置|重新设/.test(text)) pushUnique(tools, "countdown.reset");
    else pushUnique(tools, "countdown.set");
  }
  if (/便签|笔记|写下|记下|追加/.test(text)) pushUnique(tools, /清空|清一下/.test(text) ? "note.clear" : "note.write");
  if (/待办|提醒|叫我|标记完成|勾掉|已完成/.test(text)) {
    if (/完成|勾掉|标记/.test(text)) pushUnique(tools, "todo.complete_item");
    else pushUnique(tools, "todo.add_item");
  }
  if (widgets.includes("clipboard")) pushUnique(tools, /清理|清空|删除/.test(text) ? "clipboard.clear" : "clipboard.add_text");
  if (isTranslationOnly(text) || widgets.includes("translate")) pushUnique(tools, "translate.set_draft");
  if (widgets.includes("converter")) pushUnique(tools, "converter.set");
  if (/计算|加|减|乘|除/.test(text)) pushUnique(tools, "calculator.set_display");
  if (widgets.includes("worldClock")) pushUnique(tools, "worldClock.set_zones");
  if (widgets.includes("dialClock")) pushUnique(tools, "dialClock.set_night_mode");
  if (widgets.includes("headline")) pushUnique(tools, "headline.request_refresh");
  if (widgets.includes("market")) pushUnique(tools, "market.set_indices");
  if (widgets.includes("recorder")) {
    if (/停止/.test(text)) pushUnique(tools, "recorder.stop");
    else if (/暂停/.test(text)) pushUnique(tools, "recorder.pause");
    else if (/播放|回放|检查/.test(text)) pushUnique(tools, "recorder.play");
    else pushUnique(tools, "recorder.start");
  }
  if (!isTranslationOnly(text) && !isMentionOnly(text) && widgets.includes("messageBoard")) {
    if (/发送|发一句|留言板发|回复|给大家说/.test(text)) pushUnique(tools, "messageBoard.send");
  }

  if (!tools.length && /(没把握|低于零点九|realtime|工具目录|弱网|断开|连接|回复|最终工具计划|前端是否成功|前端成功|后端失败|日志|诊断|监控|重复次数|DOM 状态|模拟弱网|没有工具|缺音乐工具|刷新页面|默认小工具|并发执行|实际执行的工具列表|同一条语音|不要丢第二个)/i.test(text)) {
    pushUnique(tools, "assistant.runtime_diagnostics");
    notes.push("virtual-diagnostics-action");
  }
  if (!tools.length && /登录|授权|MusicKit|试听|完整播放|开发者 token|账号状态|搜索结果出现/i.test(text)) {
    pushUnique(tools, "music.auth_status");
    notes.push("virtual-auth-action");
  }
  if (!tools.length && /撤销/.test(text)) {
    pushUnique(tools, "assistant.reply");
    notes.push("no-undo-tool-reply");
  }
  if (!tools.length && /关闭.*(全部|所有).*小工具|全部媒体小工具/.test(text)) {
    pushUnique(tools, "widget.remove");
  }
  if (!tools.length && /(桌面布局|排紧凑)/.test(text)) {
    pushUnique(tools, "board.auto_align");
  }
  if (!tools.length && widgets.length) {
    for (const widget of widgets) pushUnique(tools, widgetToolDefaults[widget]);
    notes.push("fallback-widget-default");
  }

  const hazards = [];
  if (/关闭留言板/.test(text) && !isMentionOnly(text) && tools.includes("messageBoard.send")) hazards.push("close-message-board-must-not-send");
  if (isTranslationOnly(text) && (tools.includes("widget.remove") || tools.includes("messageBoard.send"))) hazards.push("translation-only-must-not-execute");
  if (/打开时钟/.test(text) && !/世界时钟|世界时间|时区|东京|巴黎|纽约|伦敦/.test(text) && tools.includes("worldClock.set_zones")) {
    hazards.push("plain-clock-should-target-dial-clock");
  }
  if (/轻松音乐|放松|轻柔|背景音乐/.test(text) && /上一首|沿用/.test(text) && !tools.includes("music.search")) hazards.push("music-mood-must-search-new-query");

  const requiresRealtime = command.id > 200 || tools.length > 1 || /如果|不要|先|然后|同时|顺便|不对|不是|啊|没把握|重试|失败|断开|日志/.test(text);
  return {
    ...command,
    tools,
    widgets,
    route: requiresRealtime ? "realtime-simulated" : "local-or-realtime",
    hazards,
    notes,
    status: tools.length && !hazards.length ? "pass" : "needs_review"
  };
}

const commands = parseCatalog();
if (commands.length !== 700) {
  throw new Error(`Expected 700 catalog commands, got ${commands.length}`);
}
const results = commands.map(classify);
const needsReview = results.filter((item) => item.status !== "pass");
const unknown = results.filter((item) => !item.tools.length);
const byTool = new Map();
for (const item of results) {
  for (const tool of item.tools) byTool.set(tool, (byTool.get(tool) ?? 0) + 1);
}

const lines = [
  "# Realtime Voice Scenario Catalog Simulation Report",
  "",
  "This is a deterministic catalog-level simulation. It classifies each command into expected tool coverage and flags known high-risk misroutes before the stronger Harness/browser simulation pass.",
  "",
  `- Catalog commands: ${commands.length}`,
  `- Classified commands: ${results.filter((item) => item.tools.length).length}`,
  `- Needs review: ${needsReview.length}`,
  `- Unknown tool intent: ${unknown.length}`,
  "",
  "## Tool Coverage",
  ""
];

for (const [tool, count] of [...byTool.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  lines.push(`- ${tool}: ${count}`);
}

lines.push("", "## Needs Review", "");
if (!needsReview.length) {
  lines.push("None.");
} else {
  for (const item of needsReview) {
    lines.push(`- ${String(item.id).padStart(3, "0")} ${item.text} :: tools=${item.tools.join(",") || "UNKNOWN"} hazards=${item.hazards.join(",") || "-"} notes=${item.notes.join(",") || "-"}`);
  }
}

lines.push("", "## Per-Command Results", "");
for (const item of results) {
  lines.push(`${String(item.id).padStart(3, "0")}. [${item.status}] route=${item.route}; tools=${item.tools.join(",") || "UNKNOWN"}; command=${item.text}`);
}

fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({
  reportPath,
  commands: commands.length,
  classified: results.filter((item) => item.tools.length).length,
  needsReview: needsReview.length,
  unknown: unknown.length,
  hazards: results.reduce((count, item) => count + item.hazards.length, 0),
  topTools: [...byTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
}, null, 2));
