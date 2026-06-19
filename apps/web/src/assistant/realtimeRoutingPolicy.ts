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

export const realtimeToolSelectionPolicyLines = [
  "如果用户说“打开 + 小工具名”，优先添加这个小工具；只有用户明确说切到、聚焦、回到已有窗口时才聚焦。",
  "打开电视、打开钟表、打开时钟、打开世界时钟、打开留言板、打开天气等窗口类命令必须选择 board.add_widget，不要选择 music.search 或 music.play。",
  "用户只说“打开时钟”时，目标是 dialClock/表盘时钟；只有明确说世界时钟、世界时间、时区或城市时间时才选 worldClock。",
  "music.search 和 music.play 只用于明确搜索/播放/暂停/切换音乐；非音乐窗口名即使当前焦点在音乐播放器，也不要传给音乐工具。",
  "用户说“整理桌面/排列桌面/对齐小工具”时，优先调用 board.auto_align。",
  "用户说“隐藏/显示/收起/展开侧栏/侧边栏”时，优先调用 app.sidebar.set。",
  "用户说“小桌板全屏/进入全屏/退出全屏”时，优先调用 app.fullscreen.set；不要误选 widget.fullscreen_focus。",
  "用户说“打开设置/显示设置菜单”时，优先调用 app.settings.open。",
  "用户说“打开搜索/命令面板”时，优先调用 app.command_palette.open；用户说“打开 AI 生成”时，优先调用 app.ai_dialog.open。",
  "如果用户说“关闭/关掉 + 小工具名”，优先调用 widget.remove 关闭这个小工具窗口。",
  "如果用户要求调整窗口、面板、封面、文字、按钮、位置或大小，优先选择 widget.move / widget.resize / widget.focus；不要把这类界面布局请求误选成播放、搜索、刷新、写入或发送内容。",
  "用户说“来个/来一首/想听/播放 + 歌手、歌曲或风格”时，默认调用 music.play；只有明确说搜索/找/不一定播放/先不播放/不要播放时才调用 music.search。",
  "如果用户说“暂停/继续/播放/下一首”等播放控制，优先调用对应媒体工具；点歌、歌手名加歌曲名时选择 music.play。"
];

export const realtimeToolSelectionSessionPolicyLines = [
  "如果用户只是问候、确认你是否在线、闲聊，或没有明确小桌板操作意图，不要调用工具，直接用一句很短的中文自然回复。",
  "如果用户要求播放某首歌、某位歌手或某张专辑，并且工具目录里有 music.play，直接选择 music.play，不要先选择 widget.focus 或 board.add_widget。",
  "如果用户说“打开 + 小工具名”，并且工具目录里有 board.add_widget，优先选择 board.add_widget；只有用户明确说切到、聚焦、回到已有窗口时才选择 widget.focus。",
  "打开电视、打开钟表、打开时钟、打开世界时钟、打开留言板、打开天气等窗口类命令必须选择 board.add_widget，不要选择 music.search 或 music.play。",
  "用户只说“打开时钟”时，目标是 dialClock/表盘时钟；只有明确说世界时钟、世界时间、时区或城市时间时才选 worldClock。",
  "music.search 和 music.play 只用于明确搜索/播放/暂停/切换音乐；非音乐窗口名即使当前焦点在音乐播放器，也不要传给音乐工具。",
  "用户说“整理桌面/排列桌面/对齐小工具”时，优先选择 board.auto_align。",
  "用户说“隐藏/显示/收起/展开侧栏/侧边栏”时，优先选择 app.sidebar.set。",
  "用户说“小桌板全屏/进入全屏/退出全屏”时，优先选择 app.fullscreen.set；不要误选 widget.fullscreen_focus。",
  "用户说“打开设置/显示设置菜单”时，优先选择 app.settings.open。",
  "用户说“打开搜索/命令面板”时，优先选择 app.command_palette.open；用户说“打开 AI 生成”时，优先选择 app.ai_dialog.open。",
  "如果用户说“关闭/关掉 + 小工具名”，优先选择 widget.remove 关闭这个小工具窗口。",
  "如果用户要求调整窗口、面板、封面、文字、按钮、位置或大小，优先选择 widget.move / widget.resize / widget.focus；不要把这类界面布局请求误选成播放、搜索、刷新、写入或发送内容。",
  "用户说“来个/来一首/想听/播放 + 歌手、歌曲或风格”时，默认选择 music.play；只有明确说搜索/找/不一定播放/先不播放/不要播放时才选择 music.search。",
  "如果用户说“暂停/继续/播放/下一首”等播放控制，优先选择对应媒体工具。"
];

export const realtimePlanSelectionPolicyLines = [
  "用户要求播放某首歌、某位歌手或某张专辑，并且工具目录里有 music.play，必须选择 music.play。",
  "用户说“来个/来一首/想听/播放 + 歌手、歌曲或风格”时，默认选择 music.play；只有明确说搜索/找/不一定播放/先不播放/不要播放时才选择 music.search。",
  "打开电视、打开钟表、打开时钟、打开世界时钟、打开留言板、打开天气等窗口类命令必须选择 board.add_widget，不要选择 music.search 或 music.play。",
  "用户只说“打开时钟”时选择 board.add_widget 且 selectedModule/targetHint 指向 dialClock/表盘；只有明确说世界时钟、世界时间、时区或城市时间时才指向 worldClock。",
  "music.search 和 music.play 只用于明确搜索/播放/暂停/切换音乐；非音乐窗口名即使当前焦点在音乐播放器，也不要传给音乐工具。",
  "用户说“整理桌面/排列桌面/对齐小工具”时，必须选择 board.auto_align。",
  "用户说“隐藏/显示侧栏、进入/退出全屏、打开设置、打开搜索/命令面板、打开 AI 生成”时，必须选择对应 app.* 工具。",
  "用户要求调整窗口、面板、封面、文字、按钮、位置或大小时，必须选择 widget.move / widget.resize / widget.focus 或对应 app.* 工具；不要选择播放、搜索、刷新、写入、待办或留言工具。"
];

export function inputMentionsRealtimeWidgetType(input: string | undefined, type: string): boolean {
  const text = input ?? "";
  return (realtimeWidgetAliases[type] ?? []).some((alias) => text.includes(alias));
}

export function findRealtimeWidgetType(input: string | undefined, targetHint?: string): string | undefined {
  return Object.keys(realtimeWidgetAliases).find(
    (type) => inputMentionsRealtimeWidgetType(input, type) || inputMentionsRealtimeWidgetType(targetHint, type)
  );
}
