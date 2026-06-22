import { normalizeText } from "./commandPlanner";

export type ShortcutDeferralCategory =
  | "correction_or_negation"
  | "text_entry"
  | "navigation"
  | "multi_step"
  | "music_semantic"
  | "weather_semantic"
  | "time_workflow"
  | "note_todo_workflow"
  | "clipboard_workflow"
  | "translation_workflow"
  | "calculation_workflow"
  | "news_market_workflow"
  | "recorder_workflow"
  | "message_board_safety"
  | "tv_workflow"
  | "window_layout"
  | "stateful_widget_reference";

export interface ShortcutDeferralRule {
  id: string;
  category: ShortcutDeferralCategory;
  reason: string;
  pattern: RegExp;
}

export interface ShortcutDeferralMatch {
  defer: true;
  rule: ShortcutDeferralRule;
}

export interface ShortcutDeferralNoMatch {
  defer: false;
}

export type ShortcutDeferralResult = ShortcutDeferralMatch | ShortcutDeferralNoMatch;

const shortcutDeferralAllowPatterns: RegExp[] = [
  /(?:斤|公斤|千克|克|米|公里|摄氏|华氏).{0,12}(?:换算|多少|是多少)|(?:换算|多少|是多少).{0,12}(?:斤|公斤|千克|克|米|公里|摄氏|华氏)/,
  /^清空剪贴板，然后添加一条待办[:：]/
];

export const shortcutDeferralRules: ShortcutDeferralRule[] = [
  {
    id: "correction-negation-confirmation",
    category: "correction_or_negation",
    reason: "corrections, negations, confirmations, and conditional phrasing need Realtime planning before local execution",
    pattern:
      /(如果|不要|别|只|仅|检查|准备|名字先叫|草稿|误触|恢复普通窗口|当前在全屏|登录音乐|语音入口|所有弹窗|只留下|不要新建|不对|不是|啊不是|准确说|刚才说错|哦再|算了|其实|识别成|不是我要的|没把握|需要弹确认|弹确认|先确认|等我确认|确认后执行|前先告诉|统一确认)/
  },
  {
    id: "explicit-text-entry",
    category: "text_entry",
    reason: "commands that type specific text into an interface need scoped tool context",
    pattern: /输入.+(?:字|词|内容)/
  },
  {
    id: "page-navigation",
    category: "navigation",
    reason: "page navigation can change execution context and should be planned by Realtime",
    pattern: /切到.+页面/
  },
  {
    id: "multi-step-board-and-widget",
    category: "multi_step",
    reason: "multi-step board or widget lifecycle commands should not be partially executed as local shortcuts",
    pattern:
      /(?:切到|切回|回到|新开|新建|创建|打开).{0,20}(?:后|再|然后|同时|，|,).{0,24}(?:打开|添加|启动|把|放上|移动|调到)|(?:关闭|关掉|关上|删掉|删除|移除).{0,20}(?:后|再|然后|同时|，|,).{0,24}(?:打开|添加|新建|新开)|(?:打开|开一下|唤出|再开).{0,20}(?:后|并|同时|然后|，|,).{0,24}(?:把|移动|固定|用于|对比|放到|放在|排成|摆到|启动|添加)/
  },
  {
    id: "music-search-then-play",
    category: "music_semantic",
    reason: "music search/play workflows require Realtime to decide search, playback, auth, and recovery order",
    pattern:
      /(?:打开|调出|唤出).{0,12}(?:音乐|播放器).{0,24}(?:搜索|搜|找).{0,24}(?:播放|并播放)|(?:音乐|歌曲|播放|来一首|我要听|想听|给我放|找).{0,30}(?:搜到后|播放后|如果没找到|没有打开|先打开|歌词搜索|不要继续上一首|别只放试听|不要换成|找到原唱|按歌曲名|播放失败)/
  },
  {
    id: "music-mood-with-timer",
    category: "music_semantic",
    reason: "mood music plus timing/reminder phrasing is multi-intent and should be planned by Realtime",
    pattern: /(?:播放|放点|放一点|来点|想听|听点|找).{0,24}(?:音乐|歌|钢琴|民谣|背景|白噪音|自然声|粤语|轻松|舒缓).{0,30}(?:分钟后|小时后|提醒|倒计时|叫我)/
  },
  {
    id: "weather-cross-tool",
    category: "weather_semantic",
    reason: "weather decisions combined with other widgets need Realtime planning",
    pattern: /(?:天气|冷不冷|会不会下雨|适合|带伞|体感温度|洗车).{0,36}(?:顺便|同时|再|然后|并|后|如果|先|，|,).{0,44}(?:便签|待办|提醒|世界时钟|本地时间|时间|空气|摘要|换算|华氏|摄氏|留言板|倒计时|翻译|英文|聚焦|放最前|对比|写到|写入|记到)/
  },
  {
    id: "weather-decision-question",
    category: "weather_semantic",
    reason: "weather suitability questions require semantic interpretation instead of literal local routing",
    pattern: /(?:适合洗车|适合带伞|适不适合跑步|会不会下雨|体感温度)/
  },
  {
    id: "time-cross-tool",
    category: "time_workflow",
    reason: "time, clock, countdown, and reminder workflows combined with other actions require planning",
    pattern:
      /(?:时间|几点|时钟|世界时钟|表盘时钟|打开时钟|倒计时|计时器|提醒我|分钟后|半小时后|明早九点).{0,36}(?:并|同时|然后|再|后|而不是|优先|不要|别|名称叫).{0,44}(?:表盘|世界时钟|夜间模式|轻音乐|音乐|便签|原因|喝水|部署日志|泡茶|五分钟|天气|待办|录音|电视|客户回电话|休息|放最前|纽约|旧金山|缩小)|(?:打开表盘而不是世界时钟|打开时钟时优先打开表盘时钟|世界时钟只保留|表盘时钟放到桌面中央|暂停计时器.*音乐|明早九点提醒我给客户回电话)/
  },
  {
    id: "note-todo-cross-tool",
    category: "note_todo_workflow",
    reason: "note, todo, and reminder writes that reference other tool state should use Realtime planning",
    pattern:
      /(?:便签|待办|任务|提醒).{0,12}(?:记下|写下|保存|追加|新增|添加|加一条|设为|标记|勾掉|清理|清空).{0,48}(?:音乐|播放|完整歌曲|realtime|Vercel|日志|留言板|关闭|录音|翻译|新闻|摘要|天气|token|多轮|重复|当前|备注|确认|轻松|搜索|桌面问题|部署完成)|(?:记下|写下|保存|追加|新增|添加|加一条).{0,28}(?:便签|待办|任务|提醒).{0,48}(?:音乐|播放|完整歌曲|realtime|Vercel|日志|留言板|关闭|录音|翻译|新闻|摘要|天气|token|多轮|重复|当前|备注|确认|轻松|搜索|桌面问题)/i
  },
  {
    id: "note-todo-stateful-reference",
    category: "note_todo_workflow",
    reason: "stateful note and todo references require current frontend state",
    pattern:
      /(?:刚才搜索到|搜索到的).{0,24}(?:追加到便签|写到便签|记到便签)|(?:把|将).{0,20}(?:这项待办|部署完成).{0,12}(?:勾掉|标记完成|完成)|(?:清空便签|清理已完成待办|先弹确认|先让我确认|前先让我确认|前先弹确认|前先弹统一确认|之前先确认|先问我确认|必须先问我确认|需要弹确认)|(?:关闭|关掉|关上|收起|删除|删掉|移除|清理|清空).{0,32}(?:保留|先确认|等我确认|确认后执行|前先告诉|统一确认)|(?:会议纪要|hello realtime|新闻摘要|当前播放歌曲|天气城市).{0,24}(?:便签|录音|翻译|追加|保存|新增|打开)|(?:明天下午三点|今天晚上九点|五分钟后提醒我看倒计时).{0,32}(?:提醒|Vercel|复盘|声音)/i
  },
  {
    id: "clipboard-stateful-workflow",
    category: "clipboard_workflow",
    reason: "clipboard commands involving pinned/current/generated values require stateful planning",
    pattern:
      /(?:剪贴板|复制|固定保存|保存命令).{0,64}(?:不要|固定|保留|并|后|前先|当前|翻译|便签|表盘|提醒|完成提示|未固定|占位|部署|项目口令|本地路径|搜索关键词|今天日期|客服回复模板|演示账号|音乐登录状态)|(?:临时验证码|demo@example|demo-token|Vercel 项目名|WiFi 密码提示|搜索关键词|会议链接|客服回复模板|本地路径|当前歌曲名|翻译结果|打开表盘时钟|今天日期|部署 id|音乐登录状态检查步骤).{0,40}(?:剪贴板|复制|保存|固定|存起来|新增|添加|不要|提醒)|固定保存.{0,40}(?:Vercel 项目名|音乐登录状态|项目口令|demo-token|xiaozhuoban)|(?:清理|清空).{0,16}剪贴板.{0,32}(?:保留|固定|确认|完成提示|未固定|测试记录)/i
  },
  {
    id: "translation-cross-tool",
    category: "translation_workflow",
    reason: "translation commands combined with copy, music, or notes need Realtime planning",
    pattern: /(?:翻译|译成).{0,48}(?:复制结果|剪贴板|便签|写入|写到|不要执行|关闭命令|播放轻松音乐|preview mode|0\.9|realtime|备忘|适合出门)|(?:good night realtime|good morning|今天适合出门吗|播放轻松音乐).{0,24}(?:翻译|译成)|(?:写到|写入).{0,16}便签.{0,24}(?:并|同时|再|然后).{0,24}(?:翻译|译成)/i
  },
  {
    id: "calculation-cross-tool",
    category: "calculation_workflow",
    reason: "calculation or conversion commands with follow-up actions need planning",
    pattern:
      /(?:计算|算).{0,48}(?:写进便签|写到便签|添加到剪贴板|显示在计算器|部署失败次数|再乘|然后|并)|(?:换算|转成|大概是多少).{0,48}(?:平方|分钟|小时|美元|人民币|汇率|公斤半|Fahrenheit|摄氏度|公里|米|斤)|(?:2\s*斤|两公斤半).{0,24}(?:克|换算)/i
  },
  {
    id: "news-market-cross-tool",
    category: "news_market_workflow",
    reason: "news and market commands often combine lookup, layout, and follow-up actions",
    pattern:
      /(?:新闻|头条|重大新闻|财经新闻|行情|全球指数|纳指|道指|恒生|上证|深证|美股).{0,40}(?:不要|别|只|顺便|同时|然后|后|如果|并|放到|置顶|聚焦|刷新失败|发一句|追加|提醒|关闭|命令面板)|(?:把新闻和天气并排放|打开重大新闻小工具后马上聚焦|不要打开行情窗口|不要播放电视|别误开音乐|关闭港股窗口)/
  },
  {
    id: "recorder-cross-tool",
    category: "recorder_workflow",
    reason: "recorder commands with media, notes, timers, layout, or state dependencies need planning",
    pattern:
      /(?:录音|录音机|录制|录一段|回放).{0,48}(?:并|同时|然后|再|后|之前|先|如果|不要|别|避免|旁边|封面|倒计时|提醒|便签|留言板|剪贴板|电视|音乐|表盘|待办|窗口|左上角|聚焦|测试编号|会议开始|会议结束|复现过程|检查声音)|(?:开始录音后|开始录音，然后|停止录音后|停止录音并|播放录音时|录音回放暂停后|打开录音机但先不要开始录|打开录音机，窗口放到左上角)/
  },
  {
    id: "message-board-safety",
    category: "message_board_safety",
    reason: "message board commands are easy to confuse between send, close, clear, and layout actions",
    pattern: /(?:留言板|留言|消息).{0,48}(?:不要|别|不是发送|同时|然后|如果|先|再|置顶|移到底部|移到|底部|多轮|部署完成|realtime|英文|重复|确认|碍事|收起来|清空输入框|天气摘要|音乐已经重新搜索|十分钟)|(?:把天气摘要发到留言板|关闭留言板和新闻窗口|关闭留言板时执行关闭)/i
  },
  {
    id: "tv-cross-tool",
    category: "tv_workflow",
    reason: "TV commands combined with media, timers, layout, or channel correction need planning",
    pattern:
      /(?:电视|直播|CCTV).{0,28}(?:，|,|然后|再|同时|后).{0,36}(?:音乐|录音|倒计时|提醒|侧边栏|侧栏|置顶|便签|新闻)|(?:电视|直播|CCTV).{0,28}(?:切到|再选|重新选择).{0,16}(?:CCTV|频道)|(?:暂停电视|电视.{0,8}暂停).{0,36}(?:继续播放音乐|开始录音|提醒|倒计时)|(?:关闭电视).{0,28}(?:同时|然后|再|，|,).{0,28}(?:音乐|继续播放)|(?:电视|直播).{0,24}(?:全屏).{0,24}(?:侧栏|侧边栏)|(?:电视卡住|重新选择\s*CCTV|新闻直播.{0,16}CCTV)/i
  },
  {
    id: "common-cross-tool-workflows",
    category: "multi_step",
    reason: "common cross-tool sequences should be planned as ordered Realtime steps",
    pattern:
      /(?:市场行情|重大新闻|纽约时间).{0,40}(?:排成一列|排一列|一列)|(?:翻译成中文|翻译).{0,32}(?:复制|剪贴板)|(?:添加待办|待办).{0,32}(?:同时|并|然后|再).{0,32}(?:明早|提醒)|(?:新建一条待办|加入待办|添加待办[:：]).{0,48}(?:realtime|语音|小工具|Apple Music|试听|断线|复盘|检查)|(?:realtime|语音|小工具|Apple Music|试听|断线|复盘|检查).{0,48}(?:加入待办|添加到待办)|(?:十五分钟后|明早八点|明早九点|半小时后).{0,32}(?:提醒|查看|继续|检查)|(?:查|看).{0,16}天气.{0,24}(?:决定|是否|适合|出门)|(?:打开计算器|计算器).{0,32}(?:今天|还有多少分钟|到六点)|(?:打开|切到|回到).{0,16}(?:工作台|项目冲刺).{0,32}(?:音乐播放器|放到最前|整理窗口|整理桌面)/i
  },
  {
    id: "weather-clock-zone-state",
    category: "stateful_widget_reference",
    reason: "weather and clock zone changes depend on existing widget state",
    pattern: /(?:天气改成|天气).{0,40}(?:世界时钟|伦敦|纽约|北京伦敦纽约)/
  },
  {
    id: "layout-organization",
    category: "window_layout",
    reason: "layout organization combined with focus or ordering needs current frontend state",
    pattern:
      /(?:隐藏|显示|先|并|同时).{0,16}(?:整理|排列|对齐)|(?:整理|排列|对齐).{0,16}(?:同时|然后|再|并|后).{0,24}(?:聚焦|切到|放最前|待办|窗口)?|(?:旧的|新的|另一个|再开|只保留|保留).{0,16}(?:小工具|窗口|倒计时|音乐|电视|待办|天气)|(?:两个|多个|所有).{0,8}窗口/
  },
  {
    id: "widget-appearance-and-media-state",
    category: "window_layout",
    reason: "widget appearance, fullscreen, audio, and size adjustments need execution state",
    pattern:
      /(?:表盘|时钟).{0,24}(?:调暗|夜间模式|打开夜间)|(?:倒计时|计时器).{0,28}(?:声音|暂停倒计时)|(?:天气卡片|卡片).{0,20}(?:放大|调大|方便读)|(?:退出全屏后|恢复普通窗口).{0,28}(?:音乐播放器|音乐|播放器)|(?:音乐|播放器).{0,28}(?:封面|播放控件|登录按钮|恢复正常大小)/
  },
  {
    id: "generic-window-layout",
    category: "window_layout",
    reason: "generic window movement and resizing need current widget targets",
    pattern:
      /窗口.{0,16}(?:拖到|移到|移动到|放到|放在|置顶|最前|调宽|调小|放大|缩小|退出全屏|盖住|挡住|压缩|恢复正常大小)|(?:窗口|面板|封面|播放控件|登录按钮|按钮|文字).{0,28}(?:太小|挡|覆盖|居中|放大|缩小|调宽|调小|右上角|正常大小|不要全屏|恢复正常|压缩)|(?:太小|太挡眼|挡眼|别挡|不要压缩).{0,28}(?:窗口|面板|封面|播放控件|登录按钮|按钮|文字|待办|倒计时|便签|电视)|(?:电视|音乐|天气|便签|待办|倒计时|新闻|行情|世界时钟).{0,8}窗口.{0,20}(?:太挡眼|挡眼|缩小|放大|右上角|右侧|左侧)/
  }
];

export function classifyShortcutDeferral(input: string): ShortcutDeferralResult {
  const normalized = normalizeText(input);
  if (normalized.length < 6) return { defer: false };
  if (shortcutDeferralAllowPatterns.some((pattern) => pattern.test(input))) {
    return { defer: false };
  }
  if (/打开天气查.+再打开世界时钟/.test(input)) {
    return { defer: false };
  }
  const rule = shortcutDeferralRules.find((candidate) => candidate.pattern.test(input));
  return rule ? { defer: true, rule } : { defer: false };
}
