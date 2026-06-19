# Realtime Voice Scenario Catalog Harness Report

Every row below was sent through `AssistantHarness.handleUserInput` with a deterministic Realtime command plan and simulated tool registry.

001. [pass] tools=app.sidebar.set; command=把左边栏先藏起来
002. [pass] tools=app.sidebar.set; command=侧边栏重新显示
003. [pass] tools=app.fullscreen.set; command=进入沉浸全屏
004. [pass] tools=app.fullscreen.set; command=退出全屏回普通窗口
005. [pass] tools=app.settings.open; command=打开小桌板设置
006. [pass] tools=app.command_palette.open; command=打开搜索命令面板
007. [pass] tools=app.ai_dialog.open; command=我要新建一个 AI 小工具
008. [pass] tools=board.auto_align; command=整理一下桌面所有小工具
009. [pass] tools=board.create; command=新开一个学习桌板
010. [pass] tools=board.rename; command=把当前桌板改名叫夜间工作
011. [pass] tools=board.switch; command=切回工作台桌板
012. [pass] tools=widget.move; command=把电视拖到右上角
013. [pass] tools=widget.resize; command=把电视面板调大一点
014. [pass] tools=widget.bring_to_front,widget.focus; command=把音乐播放器放最前
015. [pass] tools=widget.focus,weather.set_city; command=聚焦天气卡片
016. [pass] tools=widget.fullscreen_focus,tv.fullscreen,tv.play; command=全屏看电视
017. [pass] tools=widget.remove; command=关闭留言板
018. [pass] tools=board.add_widget,dialClock.set_night_mode; command=打开一个表盘时钟
019. [pass] tools=note.write; command=新建便签实例用于测试
020. [pass] tools=weather.set_city; command=查北京今天冷不冷
021. [pass] tools=weather.set_city; command=上海天气给我看一下
022. [pass] tools=weather.set_city,worldClock.set_zones; command=看看洛杉矶天气
023. [pass] tools=weather.set_city; command=杭州现在什么天气
024. [pass] tools=weather.set_city; command=帮我换到武汉天气
025. [pass] tools=weather.set_city; command=波士顿天气
026. [pass] tools=weather.set_city; command=广州天气怎么样
027. [pass] tools=weather.set_city; command=成都天气打开看看
028. [pass] tools=countdown.set; command=设一个三分钟倒计时
029. [pass] tools=countdown.set,todo.add_item; command=十分钟后提醒我
030. [pass] tools=countdown.pause; command=暂停现在的计时器
031. [pass] tools=countdown.resume; command=继续刚才那个倒计时
032. [pass] tools=countdown.reset; command=重置倒计时
033. [pass] tools=countdown.set; command=设置二十五秒计时
034. [pass] tools=countdown.set; command=半小时倒计时开始
035. [pass] tools=countdown.set; command=先定时一小时
036. [pass] tools=note.write; command=便签记下今天继续回归测试
037. [pass] tools=note.write,calculator.set_display; command=把会议纪要追加到便签
038. [pass] tools=note.clear; command=清空便签内容
039. [pass] tools=todo.add_item,calculator.set_display; command=添加待办买咖啡豆
040. [pass] tools=todo.add_item; command=明早九点提醒我提交报告
041. [pass] tools=todo.complete_item; command=把买牛奶这项勾掉
042. [pass] tools=clipboard.add_text; command=复制演示账号到剪贴板
043. [pass] tools=clipboard.add_text; command=固定保存项目口令 demo
044. [pass] tools=clipboard.clear; command=清理剪贴板普通记录
045. [pass] tools=translate.set_draft; command=把 hello world 翻译成中文
046. [pass] tools=translate.set_draft; command=你好翻译成英文
047. [pass] tools=calculator.set_display; command=十二加三十算一下
048. [pass] tools=converter.set; command=2斤是多少克
049. [pass] tools=converter.set; command=十二米换算公里
050. [pass] tools=converter.set; command=两公斤换算成克
051. [pass] tools=worldClock.set_zones; command=世界时钟显示北京伦敦纽约
052. [pass] tools=worldClock.set_zones; command=看东京和巴黎时间
053. [pass] tools=headline.request_refresh; command=刷新重大新闻
054. [pass] tools=headline.request_refresh; command=今天有什么头条新闻
055. [pass] tools=market.set_indices; command=看美股三大指数
056. [pass] tools=board.add_widget,market.set_indices; command=打开恒生和上证行情
057. [pass] tools=dialClock.set_night_mode; command=表盘开启夜间模式
058. [pass] tools=dialClock.set_night_mode; command=关闭时钟夜间模式
059. [pass] tools=messageBoard.send; command=留言板发一句我在测试
060. [pass] tools=music.search; command=搜一点轻松的音乐
061. [pass] tools=music.play; command=播放王菲的红豆
062. [pass] tools=music.play; command=来一首陈奕迅十年
063. [pass] tools=music.pause; command=音乐先暂停
064. [pass] tools=music.resume; command=继续刚才的歌
065. [pass] tools=music.next; command=下一首歌
066. [pass] tools=music.previous; command=上一首
067. [pass] tools=tv.select_channel; command=电视切到 CCTV13
068. [pass] tools=tv.play; command=播放 CCTV1
069. [pass] tools=tv.pause; command=暂停电视直播
070. [pass] tools=tv.fullscreen; command=电视全屏
071. [pass] tools=recorder.start; command=开始录音
072. [pass] tools=recorder.stop; command=停止录音
073. [pass] tools=recorder.play; command=播放刚才录音
074. [pass] tools=recorder.pause; command=暂停录音回放
075. [pass] tools=widget.remove; command=把音乐收起来
076. [pass] tools=widget.remove; command=把电视收起来
077. [pass] tools=widget.remove; command=把录音机收起来
078. [pass] tools=widget.remove; command=把天气收起来
079. [pass] tools=widget.remove; command=把倒计时收起来
080. [pass] tools=widget.remove; command=把待办收起来
081. [pass] tools=widget.remove; command=把剪贴板收起来
082. [pass] tools=widget.remove; command=把翻译收起来
083. [pass] tools=widget.remove; command=把计算器收起来
084. [pass] tools=widget.remove; command=把行情收起来
085. [pass] tools=widget.remove; command=把新闻收起来
086. [pass] tools=widget.remove; command=把世界时钟收起来
087. [pass] tools=widget.focus; command=切到音乐窗口
088. [pass] tools=widget.focus; command=切到电视窗口
089. [pass] tools=widget.focus; command=切到录音机窗口
090. [pass] tools=widget.focus; command=切到天气窗口
091. [pass] tools=widget.focus; command=切到待办窗口
092. [pass] tools=widget.focus; command=切到留言板窗口
093. [pass] tools=widget.focus; command=切到表盘时钟窗口
094. [pass] tools=widget.focus; command=切到便签窗口
095. [pass] tools=widget.focus; command=再打开一个音乐
096. [pass] tools=widget.focus; command=再打开一个电视
097. [pass] tools=widget.focus; command=再打开一个天气
098. [pass] tools=widget.focus; command=再打开一个倒计时
099. [pass] tools=widget.focus; command=再打开一个待办
100. [pass] tools=widget.focus; command=再打开一个剪贴板
101. [pass] tools=widget.focus; command=再打开一个翻译
102. [pass] tools=widget.focus; command=再打开一个计算器
103. [pass] tools=widget.focus; command=再打开一个行情
104. [pass] tools=widget.focus; command=再打开一个新闻
105. [pass] tools=widget.focus; command=再打开一个世界时钟
106. [pass] tools=widget.focus; command=再打开一个录音机
107. [pass] tools=music.play,weather.set_city; command=播放陈奕迅十年，然后查上海天气
108. [pass] tools=app.sidebar.set,app.settings.open; command=隐藏侧边栏，同时打开设置
109. [pass] tools=board.add_widget,tv.fullscreen,tv.select_channel; command=打开电视然后切到 CCTV5 再全屏
110. [pass] tools=note.write,todo.add_item,calculator.set_display; command=先记下买票，然后添加待办订酒店
111. [pass] tools=widget.remove; command=关闭音乐和留言板
112. [pass] tools=weather.set_city; command=外面适合出门吗看北京，场景1
113. [pass] tools=music.search; command=我想听点放松的不一定播放，场景1
114. [pass] tools=music.play; command=来个周杰伦经典，场景1
115. [pass] tools=todo.add_item; command=有空提醒我复盘语音测试，场景1
116. [pass] tools=translate.set_draft; command=good night 帮我看中文，场景1
117. [pass] tools=calculator.set_display; command=十二乘十二，场景1
118. [pass] tools=market.set_indices; command=纳指给我看一眼，场景1
119. [pass] tools=worldClock.set_zones; command=东京现在几点，场景1
120. [pass] tools=headline.request_refresh; command=看看刚刚有什么新闻，场景1
121. [pass] tools=recorder.start; command=帮我录一段，场景1
122. [pass] tools=tv.play; command=电影频道打开，场景1
123. [pass] tools=messageBoard.send; command=留言板回复收到，场景1
124. [pass] tools=clipboard.add_text; command=临时验证码存起来，场景1
125. [pass] tools=todo.add_item; command=一分半以后叫我，场景1
126. [pass] tools=dialClock.set_night_mode; command=钟表别太亮，场景1
127. [pass] tools=app.command_palette.open; command=我要找功能，场景1
128. [pass] tools=app.ai_dialog.open; command=帮我做一个新工具，场景1
129. [pass] tools=board.switch; command=回到工作台，场景1
130. [pass] tools=widget.bring_to_front; command=电视别被挡住，场景1
131. [pass] tools=widget.resize,widget.fullscreen_focus; command=音乐面板放大，场景1
132. [pass] tools=weather.set_city; command=外面适合出门吗看北京，场景2
133. [pass] tools=music.search; command=我想听点放松的不一定播放，场景2
134. [pass] tools=music.play; command=来个周杰伦经典，场景2
135. [pass] tools=todo.add_item; command=有空提醒我复盘语音测试，场景2
136. [pass] tools=translate.set_draft; command=good night 帮我看中文，场景2
137. [pass] tools=calculator.set_display; command=十二乘十二，场景2
138. [pass] tools=market.set_indices; command=纳指给我看一眼，场景2
139. [pass] tools=worldClock.set_zones; command=东京现在几点，场景2
140. [pass] tools=headline.request_refresh; command=看看刚刚有什么新闻，场景2
141. [pass] tools=recorder.start; command=帮我录一段，场景2
142. [pass] tools=tv.play; command=电影频道打开，场景2
143. [pass] tools=messageBoard.send; command=留言板回复收到，场景2
144. [pass] tools=clipboard.add_text; command=临时验证码存起来，场景2
145. [pass] tools=todo.add_item; command=一分半以后叫我，场景2
146. [pass] tools=dialClock.set_night_mode; command=钟表别太亮，场景2
147. [pass] tools=app.command_palette.open; command=我要找功能，场景2
148. [pass] tools=app.ai_dialog.open; command=帮我做一个新工具，场景2
149. [pass] tools=board.switch; command=回到工作台，场景2
150. [pass] tools=widget.bring_to_front; command=电视别被挡住，场景2
151. [pass] tools=widget.resize,widget.fullscreen_focus; command=音乐面板放大，场景2
152. [pass] tools=weather.set_city; command=外面适合出门吗看北京，场景3
153. [pass] tools=music.search; command=我想听点放松的不一定播放，场景3
154. [pass] tools=music.play; command=来个周杰伦经典，场景3
155. [pass] tools=todo.add_item; command=有空提醒我复盘语音测试，场景3
156. [pass] tools=translate.set_draft; command=good night 帮我看中文，场景3
157. [pass] tools=calculator.set_display; command=十二乘十二，场景3
158. [pass] tools=market.set_indices; command=纳指给我看一眼，场景3
159. [pass] tools=worldClock.set_zones; command=东京现在几点，场景3
160. [pass] tools=headline.request_refresh; command=看看刚刚有什么新闻，场景3
161. [pass] tools=recorder.start; command=帮我录一段，场景3
162. [pass] tools=tv.play; command=电影频道打开，场景3
163. [pass] tools=messageBoard.send; command=留言板回复收到，场景3
164. [pass] tools=clipboard.add_text; command=临时验证码存起来，场景3
165. [pass] tools=todo.add_item; command=一分半以后叫我，场景3
166. [pass] tools=dialClock.set_night_mode; command=钟表别太亮，场景3
167. [pass] tools=app.command_palette.open; command=我要找功能，场景3
168. [pass] tools=app.ai_dialog.open; command=帮我做一个新工具，场景3
169. [pass] tools=board.switch; command=回到工作台，场景3
170. [pass] tools=widget.bring_to_front; command=电视别被挡住，场景3
171. [pass] tools=widget.resize,widget.fullscreen_focus; command=音乐面板放大，场景3
172. [pass] tools=weather.set_city; command=外面适合出门吗看北京，场景4
173. [pass] tools=music.search; command=我想听点放松的不一定播放，场景4
174. [pass] tools=music.play; command=来个周杰伦经典，场景4
175. [pass] tools=todo.add_item; command=有空提醒我复盘语音测试，场景4
176. [pass] tools=translate.set_draft; command=good night 帮我看中文，场景4
177. [pass] tools=calculator.set_display; command=十二乘十二，场景4
178. [pass] tools=market.set_indices; command=纳指给我看一眼，场景4
179. [pass] tools=worldClock.set_zones; command=东京现在几点，场景4
180. [pass] tools=headline.request_refresh; command=看看刚刚有什么新闻，场景4
181. [pass] tools=recorder.start; command=帮我录一段，场景4
182. [pass] tools=tv.play; command=电影频道打开，场景4
183. [pass] tools=messageBoard.send; command=留言板回复收到，场景4
184. [pass] tools=clipboard.add_text; command=临时验证码存起来，场景4
185. [pass] tools=todo.add_item; command=一分半以后叫我，场景4
186. [pass] tools=dialClock.set_night_mode; command=钟表别太亮，场景4
187. [pass] tools=app.command_palette.open; command=我要找功能，场景4
188. [pass] tools=app.ai_dialog.open; command=帮我做一个新工具，场景4
189. [pass] tools=board.switch; command=回到工作台，场景4
190. [pass] tools=widget.bring_to_front; command=电视别被挡住，场景4
191. [pass] tools=widget.resize,widget.fullscreen_focus; command=音乐面板放大，场景4
192. [pass] tools=weather.set_city; command=外面适合出门吗看北京，场景5
193. [pass] tools=music.search; command=我想听点放松的不一定播放，场景5
194. [pass] tools=music.play; command=来个周杰伦经典，场景5
195. [pass] tools=todo.add_item; command=有空提醒我复盘语音测试，场景5
196. [pass] tools=translate.set_draft; command=good night 帮我看中文，场景5
197. [pass] tools=calculator.set_display; command=十二乘十二，场景5
198. [pass] tools=market.set_indices; command=纳指给我看一眼，场景5
199. [pass] tools=worldClock.set_zones; command=东京现在几点，场景5
200. [pass] tools=headline.request_refresh; command=看看刚刚有什么新闻，场景5
201. [pass] tools=app.sidebar.set,app.settings.open,widget.move; command=先把左侧边栏收起，然后打开设置检查语音入口
202. [pass] tools=app.fullscreen.set,app.command_palette.open,board.add_widget,music.play; command=进入全屏后马上退出，再打开命令面板找音乐播放器
203. [pass] tools=app.sidebar.set,widget.move; command=把侧边栏显示回来，同时把设置窗口放到最前面
204. [pass] tools=app.settings.open,app.command_palette.open,board.add_widget; command=打开设置，切到语音相关页面，如果没有就打开命令面板
205. [pass] tools=app.sidebar.set,board.auto_align; command=我想专心一下，隐藏侧栏并把当前桌面整理整齐
206. [pass] tools=app.fullscreen.set,app.command_palette.open,board.add_widget,weather.set_city; command=退出全屏，打开搜索面板，然后输入天气两个字
207. [pass] tools=app.fullscreen.set,widget.remove,music.play; command=进入沉浸模式，同时不要关闭正在播放的音乐
208. [pass] tools=app.settings.open,app.ai_dialog.open; command=打开小桌板设置，再新建一个 AI 小工具草稿
209. [pass] tools=app.command_palette.open; command=把所有弹窗先收起来，只留下命令面板
210. [pass] tools=app.sidebar.set,widget.move,widget.focus,weather.set_city; command=先显示侧边栏，再把音乐和天气两个窗口都放到前面
211. [pass] tools=app.settings.open,board.add_widget,recorder.play; command=打开设置后帮我检查有没有登录音乐的入口
212. [pass] tools=app.fullscreen.set,widget.focus,note.write; command=我刚才误触全屏了，恢复普通窗口并聚焦便签
213. [pass] tools=app.sidebar.set,app.ai_dialog.open,headline.request_refresh; command=隐藏侧栏，打开 AI 小工具窗口，名字先叫每日摘要
214. [pass] tools=app.command_palette.open; command=把命令面板打开，如果当前在全屏就先退出
215. [pass] tools=app.sidebar.set,app.fullscreen.set,widget.fullscreen_focus,tv.fullscreen,tv.play; command=进入全屏看电视，同时把侧边栏藏起来
216. [pass] tools=app.settings.open; command=把设置打开后不要新建工具，只让我看配置
217. [pass] tools=app.sidebar.set,app.fullscreen.set; command=现在先回到普通窗口，然后显示侧边栏
218. [pass] tools=app.command_palette.open,board.add_widget,worldClock.set_zones,dialClock.set_night_mode; command=打开搜索命令面板并准备查找世界时钟
219. [pass] tools=app.sidebar.set,widget.bring_to_front,widget.focus,dialClock.set_night_mode; command=把侧边栏切换一下，再把表盘时钟放最前
220. [pass] tools=app.settings.open; command=清理桌面前先打开设置让我确认
221. [pass] tools=board.create; command=新建一个叫晨间复盘的桌板，然后切过去
222. [pass] tools=board.rename,board.auto_align; command=把当前桌板改名成项目冲刺，并整理所有小工具
223. [pass] tools=board.switch,board.add_widget,headline.request_refresh,market.set_indices; command=切到工作台桌板后打开新闻和行情
224. [pass] tools=board.create,weather.set_city,todo.add_item,worldClock.set_zones,dialClock.set_night_mode; command=新开旅行计划桌板，把天气、世界时钟和待办都放上去
225. [pass] tools=board.switch,dialClock.set_night_mode; command=回到夜间工作桌板，同时把表盘时钟调成夜间模式
226. [pass] tools=board.create,board.add_widget,recorder.start; command=创建一个音乐练习桌板，再打开音乐和录音机
227. [pass] tools=calculator.set_display; command=把当前桌板改成语音回归测试，不要删除任何小工具
228. [pass] tools=widget.move; command=切回工作台，再把电视窗口移动到右上角
229. [pass] tools=board.create,note.write,todo.add_item,calculator.set_display; command=新建家庭事务桌板，添加待办、便签和留言板
230. [pass] tools=board.auto_align,widget.focus,music.play; command=把桌面自动整理一下，确认后再聚焦音乐播放器
231. [pass] tools=board.switch,board.add_widget,translate.set_draft,calculator.set_display; command=切到学习桌板，打开翻译和计算器
232. [pass] tools=board.create,board.add_widget,headline.request_refresh,market.set_indices; command=创建一个市场观察桌板，同时打开行情和重大新闻
233. [pass] tools=board.rename,board.add_widget,tv.play; command=把当前桌板重命名为今晚直播，然后打开电视
234. [pass] tools=weather.set_city; command=回到默认工作台，把天气卡片调到左上角
235. [pass] tools=board.create,countdown.set,note.write; command=新建一个临时桌板，只放倒计时和便签
236. [pass] tools=board.switch,board.auto_align,widget.focus; command=切到项目桌板后把所有窗口按网格排列
237. [pass] tools=board.rename,recorder.start; command=把当前桌板命名为会议记录，然后开始录音
238. [pass] tools=board.create,board.add_widget,note.write,translate.set_draft,worldClock.set_zones,dialClock.set_night_mode; command=创建阅读桌板，打开便签、翻译和世界时钟
239. [pass] tools=app.command_palette.open,board.switch; command=切回上一个桌板，如果找不到就打开命令面板
240. [pass] tools=board.auto_align,widget.remove,messageBoard.send; command=整理桌板之后把留言板关闭，不要发送留言
241. [pass] tools=widget.move,widget.resize,music.play; command=把音乐播放器移到左下角，再把封面区域放大一点
242. [pass] tools=widget.bring_to_front,widget.move,widget.resize,weather.set_city; command=把天气卡片缩小，电视窗口放到右上角并置顶
243. [pass] tools=widget.remove,note.write; command=关闭留言板，然后打开一个新的便签实例
244. [pass] tools=widget.fullscreen_focus; command=把电视窗口全屏，退出后仍然放在最前面
245. [pass] tools=widget.move,recorder.start; command=把录音机移到音乐旁边，两个窗口都不要遮住
246. [pass] tools=widget.move,worldClock.set_zones,dialClock.set_night_mode; command=把世界时钟放到右侧，把表盘时钟放到中间
247. [pass] tools=widget.resize,headline.request_refresh,market.set_indices; command=把行情窗口调宽，同时刷新重大新闻
248. [pass] tools=widget.focus; command=再打开一个倒计时，用完后把旧的倒计时关闭
249. [pass] tools=widget.move,widget.resize,converter.set,calculator.set_display; command=把计算器和换算器并排放，宽度都调小
250. [pass] tools=widget.move,widget.focus,note.write,translate.set_draft; command=把翻译窗口拖到便签下面，并聚焦翻译输入框
251. [pass] tools=widget.move,widget.resize,note.write,todo.complete_item; command=把待办窗口放大，完成后把便签放到最前
252. [pass] tools=widget.remove,weather.set_city,todo.add_item,headline.request_refresh; command=关闭天气和新闻，只保留音乐、电视、待办
253. [pass] tools=widget.move,board.add_widget,clipboard.add_text; command=打开剪贴板后把它固定在屏幕右侧
254. [pass] tools=widget.resize,dialClock.set_night_mode; command=把表盘时钟调小一点，别挡住音乐封面
255. [pass] tools=widget.move,board.add_widget,tv.play; command=把电视从右上角移到左侧，再打开全屏预览
256. [pass] tools=widget.remove,music.play; command=关闭所有临时小工具，但保留音乐播放器
257. [pass] tools=widget.move; command=把留言板打开，移动到桌面底部居中
258. [pass] tools=weather.set_city; command=再开一个天气窗口用于对比北京和上海
259. [pass] tools=app.fullscreen.set,widget.resize; command=把音乐窗口退出全屏，然后调整到宽度 520
260. [pass] tools=board.auto_align; command=把所有打开的小工具重新排版，确认后执行
261. [pass] tools=music.play; command=播放王菲的红豆，搜到后直接开始播放
262. [pass] tools=music.previous; command=我要听陈奕迅的十年，不要继续上一首
263. [pass] tools=music.search; command=搜索周杰伦晴天，然后播放第一个完整结果
264. [pass] tools=music.search; command=来一首孙燕姿遇见，如果没找到就先展示搜索结果
265. [pass] tools=widget.bring_to_front,widget.focus; command=播放林俊杰江南，同时把音乐播放器放最前
266. [pass] tools=music.play; command=找张学友吻别，别只放试听片段
267. [pass] tools=board.add_widget,music.play; command=打开音乐播放器，搜索邓紫棋泡沫并播放
268. [pass] tools=music.search; command=给我放五月天倔强，播放后把歌词搜索也打开
269. [pass] tools=music.play; command=播放 Beyond 海阔天空，不要换成同名翻唱
270. [pass] tools=music.pause,music.search; command=搜蔡健雅红色高跟鞋，先暂停当前歌曲再播放
271. [pass] tools=music.play; command=我想听李宗盛山丘，找到原唱版本
272. [pass] tools=music.play,note.write; command=播放 Taylor Swift 的 Lover，然后把音量状态记到便签
273. [pass] tools=music.search; command=来一首 Adele 的 Hello，搜索词就用 Adele Hello
274. [pass] tools=music.play,translate.set_draft; command=播放 Coldplay Yellow，别解析成颜色翻译
275. [pass] tools=music.play; command=搜王力宏唯一并播放，播放失败就告诉我原因
276. [pass] tools=music.play; command=给我放刘若英后来，播放器没有打开就先打开
277. [pass] tools=music.play,countdown.set; command=播放梁静茹勇气，然后把倒计时设为四分钟
278. [pass] tools=music.play; command=找陈奕迅孤勇者，播放前确认不是十年
279. [pass] tools=music.search; command=我要听王菲容易受伤的女人，按歌曲名搜索
280. [pass] tools=music.previous,music.search; command=播放轻松音乐时重新搜索，不要沿用上一首
281. [pass] tools=music.search; command=我想听点轻松的中文歌，先搜索不要立刻播放
282. [pass] tools=music.search; command=放一点适合写代码的纯音乐，结果要重新搜索
283. [pass] tools=music.play; command=来点不吵的背景音乐，别播刚才那首
284. [pass] tools=music.play; command=找适合睡前的歌，播放器放在桌面左下
285. [pass] tools=music.search; command=我想听轻快但不太吵的音乐，先展示列表
286. [pass] tools=music.play,countdown.set,todo.add_item; command=播放舒缓钢琴，三分钟后提醒我休息眼睛
287. [pass] tools=music.play; command=来点粤语老歌，如果识别不准就交给 realtime
288. [pass] tools=music.search; command=刚才不是这首，重新搜陈奕迅的十年
289. [pass] tools=music.play; command=不要播放试听版，优先用已登录的音乐账号
290. [pass] tools=music.play; command=给我找运动时听的歌，并把下一首按钮准备好
291. [pass] tools=music.play; command=换成轻松一点的，不要继续现在的歌曲
292. [pass] tools=music.search; command=搜索雨天适合听的音乐，只要歌曲不要电台
293. [pass] tools=music.pause,music.play,tv.pause; command=找午休背景音乐，播放前把电视暂停
294. [pass] tools=music.search; command=我说的是轻松音乐，不是上一首，重新搜索
295. [pass] tools=music.play; command=给我一首安静的英文歌，先搜完整曲库
296. [pass] tools=music.play; command=播放适合开车的歌，但音量不要改
297. [pass] tools=music.search; command=搜白噪音或自然声，不要打开电视
298. [pass] tools=music.play; command=来点周末感觉的歌，如果没把握就让我确认
299. [pass] tools=music.pause,music.play; command=先暂停当前歌曲，再找轻柔民谣
300. [pass] tools=music.play; command=把音乐换成专注模式用的播放列表
301. [pass] tools=board.add_widget,tv.select_channel,tv.fullscreen; command=打开电视并切到 CCTV5，完成后全屏
302. [pass] tools=tv.play,headline.request_refresh; command=播放 CCTV13 新闻频道，然后刷新重大新闻
303. [pass] tools=tv.select_channel; command=电视切到电影频道，但不要关闭音乐
304. [pass] tools=tv.pause,music.resume; command=暂停电视直播，继续播放音乐
305. [pass] tools=tv.select_channel; command=把电视从全屏退出来，再切到 CCTV1
306. [pass] tools=board.add_widget,tv.select_channel; command=我想看体育频道，先打开电视再选 CCTV5
307. [pass] tools=app.sidebar.set,tv.fullscreen; command=电视全屏后把侧边栏隐藏
308. [pass] tools=board.add_widget,tv.play,widget.move; command=打开 CCTV6，同时把电视窗口放到右上角
309. [pass] tools=tv.pause,recorder.start; command=把电视音频先暂停，然后开始录音
310. [pass] tools=tv.select_channel; command=切到 CCTV13，如果失败就保留频道选择界面
311. [pass] tools=board.add_widget,tv.play,widget.move; command=打开电视，但不要遮住天气卡片
312. [pass] tools=tv.play,countdown.set; command=播放 CCTV1 综合频道，再设十分钟倒计时
313. [pass] tools=tv.play,headline.request_refresh; command=帮我看新闻直播，优先 CCTV13
314. [pass] tools=widget.resize,widget.bring_to_front; command=把电视窗口调大一点并置顶
315. [pass] tools=widget.remove,music.resume; command=关闭电视，同时把音乐继续播放
316. [pass] tools=board.add_widget; command=打开电视后不要自动全屏，先让我确认频道
317. [pass] tools=tv.pause,todo.add_item; command=把当前电视直播暂停五分钟后提醒我回来
318. [pass] tools=tv.select_channel,note.write; command=切换到电影频道并记录到便签
319. [pass] tools=tv.select_channel; command=电视卡住了，重新选择 CCTV1 并播放
320. [pass] tools=board.add_widget; command=打开电视小工具，如果没有就新增一个
321. [pass] tools=weather.set_city,note.write; command=查北京今天会不会下雨，顺便记到便签
322. [pass] tools=weather.set_city,todo.add_item; command=看上海现在天气，如果冷就提醒我带外套
323. [pass] tools=weather.set_city,todo.add_item; command=明早去杭州，帮我看天气并加一条待办
324. [pass] tools=weather.set_city,worldClock.set_zones; command=洛杉矶天气打开看看，再显示本地时间
325. [pass] tools=weather.set_city,headline.request_refresh; command=广州天气怎么样，同时刷新空气相关摘要
326. [pass] tools=weather.set_city; command=帮我查武汉今天适不适合跑步
327. [pass] tools=weather.set_city,widget.bring_to_front,widget.focus; command=成都天气卡片放最前，别打开新闻
328. [pass] tools=weather.set_city,converter.set; command=波士顿现在冷不冷，再换算华氏和摄氏
329. [pass] tools=board.add_widget,weather.set_city; command=北京和上海天气都打开，我要对比
330. [pass] tools=weather.set_city,todo.add_item; command=我明天出门，先查杭州天气再设早上八点提醒
331. [pass] tools=weather.set_city,board.add_widget,worldClock.set_zones; command=查东京天气，同时打开东京世界时钟
332. [pass] tools=weather.set_city,board.add_widget,worldClock.set_zones; command=给我看巴黎天气，顺便显示巴黎时间
333. [pass] tools=weather.set_city; command=查深圳天气，不要误打开重大新闻
334. [pass] tools=weather.set_city; command=外面适合带伞吗，默认看北京
335. [pass] tools=weather.set_city,widget.focus; command=帮我把天气城市改成纽约并聚焦天气卡片
336. [pass] tools=weather.set_city,messageBoard.send; command=查广州天气后把结果发到留言板
337. [pass] tools=weather.set_city,countdown.set; command=切换天气到成都，同时打开倒计时十五分钟
338. [pass] tools=weather.set_city; command=今天适合洗车吗，看上海天气
339. [pass] tools=weather.set_city,translate.set_draft; command=查北京体感温度，然后翻译成英文一句话
340. [pass] tools=board.add_widget,weather.set_city; command=天气窗口如果没开，先打开再查武汉
341. [pass] tools=board.add_widget,worldClock.set_zones; command=显示北京伦敦纽约时间，并打开表盘时钟
342. [pass] tools=worldClock.set_zones,dialClock.set_night_mode; command=世界时钟加东京和巴黎，然后切到夜间模式
343. [pass] tools=countdown.set,music.play; command=设二十五分钟专注倒计时，同时播放轻音乐
344. [pass] tools=countdown.pause,note.write; command=倒计时暂停后，便签记一下暂停原因是开会
345. [pass] tools=countdown.resume,todo.add_item; command=继续刚才的倒计时，结束后提醒我喝水
346. [pass] tools=dialClock.set_night_mode,widget.resize; command=把表盘时钟调成夜间模式，并缩小一点
347. [pass] tools=dialClock.set_night_mode,worldClock.set_zones; command=关闭时钟夜间模式，再显示纽约时间
348. [pass] tools=countdown.set,todo.add_item; command=半小时后提醒我检查部署日志
349. [pass] tools=countdown.set; command=设置一分三十秒倒计时，名称叫泡茶
350. [pass] tools=countdown.reset,countdown.set; command=把倒计时重置，然后重新设五分钟
351. [pass] tools=worldClock.set_zones,weather.set_city; command=显示东京现在几点，同时查东京天气
352. [pass] tools=todo.add_item; command=明早九点提醒我给客户回电话
353. [pass] tools=countdown.set; command=二十分钟后让我休息，不要打开待办列表
354. [pass] tools=worldClock.set_zones; command=世界时钟只保留北京和旧金山
355. [pass] tools=widget.move; command=表盘时钟放到桌面中央，别挡住电视
356. [pass] tools=countdown.set,recorder.start; command=设一个四十五分钟会议倒计时并开始录音
357. [pass] tools=countdown.pause,music.pause; command=暂停计时器，同时把音乐也暂停
358. [pass] tools=countdown.resume,widget.bring_to_front,widget.focus; command=倒计时恢复后把待办窗口放最前
359. [pass] tools=board.add_widget; command=打开表盘而不是世界时钟
360. [pass] tools=board.add_widget; command=我说打开时钟时优先打开表盘时钟
361. [pass] tools=note.write; command=便签记下今天要验证音乐登录和播放完整歌曲
362. [pass] tools=note.write; command=把刚才搜索到的王菲红豆追加到便签
363. [pass] tools=todo.add_item; command=添加待办：修复 realtime 工具暴露策略
364. [pass] tools=todo.add_item; command=明天下午三点提醒我检查 Vercel 日志
365. [pass] tools=todo.complete_item,todo.add_item; command=把买牛奶标记完成，再新增买咖啡豆
366. [pass] tools=note.clear; command=清空便签前先弹确认，不要直接删除
367. [pass] tools=note.write,recorder.start; command=把会议纪要追加到便签并开始录音
368. [pass] tools=todo.add_item; command=添加待办订酒店，备注写靠近会场
369. [pass] tools=todo.add_item; command=把复盘语音测试设为今天晚上九点提醒
370. [pass] tools=note.write; command=便签写下：轻松音乐要重新搜索
371. [pass] tools=todo.add_item; command=给待办加一条关闭留言板不能发送关闭两个字
372. [pass] tools=todo.complete_item; command=把部署完成这项待办勾掉
373. [pass] tools=countdown.set,todo.add_item; command=五分钟后提醒我看倒计时有没有声音
374. [pass] tools=note.write,board.add_widget,translate.set_draft; command=便签新增一段英文 hello realtime，再打开翻译
375. [pass] tools=note.write; command=把桌面问题列表写入便签，编号从一开始
376. [pass] tools=todo.add_item; command=添加待办：测试多轮语音不要重复回复
377. [pass] tools=headline.request_refresh,note.write; command=把今天的新闻摘要追加到便签
378. [pass] tools=todo.add_item; command=待办里添加查看 Apple Music token
379. [pass] tools=todo.clear_completed; command=清理已完成待办前先让我确认
380. [pass] tools=note.write; command=便签保存当前播放歌曲和天气城市
381. [pass] tools=clipboard.add_text; command=把临时验证码 839201 存到剪贴板，不要发留言板
382. [pass] tools=clipboard.add_text; command=复制演示账号 demo@example.com 到剪贴板并固定
383. [pass] tools=clipboard.clear; command=清理普通剪贴板记录，保留固定内容
384. [pass] tools=clipboard.add_text; command=把项目口令 demo-token 固定保存到剪贴板
385. [pass] tools=clipboard.add_text; command=剪贴板添加一条 WiFi 密码提示但不要读出来
386. [pass] tools=clipboard.add_text; command=把刚才的搜索关键词复制到剪贴板
387. [pass] tools=clipboard.clear; command=清空剪贴板前先确认一次
388. [pass] tools=clipboard.add_text,note.write; command=把会议链接存到剪贴板，并写入便签
389. [pass] tools=clipboard.add_text; command=复制客服回复模板到剪贴板
390. [pass] tools=clipboard.add_text; command=固定保存 Vercel 项目名 xiaozhuoban
391. [pass] tools=clipboard.add_text; command=剪贴板里新增一条不要上传的本地路径
392. [pass] tools=clipboard.add_text,countdown.set,todo.add_item; command=把 1234 临时验证码存起来，十分钟后提醒删除
393. [pass] tools=clipboard.add_text; command=把当前歌曲名复制到剪贴板
394. [pass] tools=clipboard.clear; command=清理剪贴板里未固定的测试记录
395. [pass] tools=clipboard.add_text; command=把翻译结果复制到剪贴板，但不要覆盖便签
396. [pass] tools=clipboard.add_text; command=保存命令：打开表盘时钟 到剪贴板
397. [pass] tools=clipboard.add_text,board.add_widget; command=复制今天日期到剪贴板并打开便签
398. [pass] tools=clipboard.add_text; command=剪贴板新增一条部署 id 占位信息
399. [pass] tools=clipboard.add_text; command=固定保存音乐登录状态检查步骤
400. [pass] tools=clipboard.clear; command=清理剪贴板后发一条完成提示
401. [pass] tools=translate.set_draft,clipboard.add_text; command=把 hello world 翻译成中文，然后复制结果
402. [pass] tools=translate.set_draft; command=把今天适合出门吗翻译成英文
403. [pass] tools=calculator.set_display,note.write; command=计算十二乘十二，再把结果写进便签
404. [pass] tools=converter.set; command=2 斤是多少克，同时打开换算器
405. [pass] tools=converter.set; command=三点五公里换算成米
406. [pass] tools=translate.set_draft; command=把 good night realtime 翻译成中文
407. [pass] tools=calculator.set_display,clipboard.add_text; command=计算 199 加 299，然后添加到剪贴板
408. [pass] tools=converter.set; command=五美元大概是多少人民币，先打开换算器等待我确认汇率
409. [pass] tools=converter.set; command=把十平方米换算成平方厘米
410. [pass] tools=converter.set; command=把一小时二十分钟换算成分钟
411. [pass] tools=translate.set_draft; command=翻译：close message board，不要执行关闭命令
412. [pass] tools=calculator.set_display; command=计算十五分钟加二十五分钟是多少
413. [pass] tools=converter.set; command=把两公斤半换算成克
414. [pass] tools=converter.set; command=把 Fahrenheit 68 转成摄氏度
415. [pass] tools=translate.set_draft; command=把播放轻松音乐翻译成英文
416. [pass] tools=calculator.set_display; command=计算 1024 除以 8，并显示在计算器
417. [pass] tools=converter.set,note.write; command=把十二米换成公里再写到便签
418. [pass] tools=translate.set_draft; command=翻译一段：the music is still preview mode
419. [pass] tools=translate.set_draft,note.write; command=把 0.9 以下交给 realtime 翻译成英文备忘
420. [pass] tools=calculator.set_display; command=计算部署失败次数三加五再乘二
421. [pass] tools=headline.request_refresh,market.set_indices; command=刷新重大新闻，然后打开美股三大指数
422. [pass] tools=market.set_indices,headline.request_refresh; command=看纳指和道指，顺便刷新财经新闻
423. [pass] tools=board.add_widget,market.set_indices; command=打开恒生和上证行情，不要自动开全球指数
424. [pass] tools=headline.request_refresh,note.write; command=今天有什么头条新闻，结果追加到便签
425. [pass] tools=market.set_indices,worldClock.set_zones; command=看美股三大指数，同时显示纽约时间
426. [pass] tools=board.add_widget,headline.request_refresh; command=只刷新新闻，不要打开行情窗口
427. [pass] tools=widget.move,headline.request_refresh,market.set_indices; command=把新闻窗口放到右侧，行情放到左侧
428. [pass] tools=market.set_indices,widget.bring_to_front; command=查询上证指数后把市场窗口置顶
429. [pass] tools=board.create,board.add_widget,headline.request_refresh; command=打开财经观察桌板并刷新重大新闻
430. [pass] tools=app.command_palette.open,board.add_widget,market.set_indices; command=看恒生指数，如果没有行情工具就打开命令面板
431. [pass] tools=headline.request_refresh,messageBoard.send; command=刷新新闻后发一句摘要到留言板
432. [pass] tools=widget.remove; command=全球指数不要刷新，先关闭那个小工具
433. [pass] tools=board.add_widget,headline.request_refresh; command=打开重大新闻但不要播放电视
434. [pass] tools=widget.resize,market.set_indices; command=行情窗口太大了，缩小后显示纳指
435. [pass] tools=widget.move,weather.set_city,headline.request_refresh; command=把新闻和天气并排放，我要看今天情况
436. [pass] tools=headline.request_refresh,countdown.set,todo.add_item; command=刷新头条后提醒我十五分钟后再看
437. [pass] tools=board.add_widget,market.set_indices; command=打开上证和深证行情，别误开音乐
438. [pass] tools=market.set_indices,widget.remove; command=只显示美股指数，关闭港股窗口
439. [pass] tools=headline.request_refresh,note.write; command=新闻刷新失败就记录到便签
440. [pass] tools=board.add_widget,headline.request_refresh,widget.focus; command=打开重大新闻小工具后马上聚焦它
441. [pass] tools=recorder.start,note.write; command=开始录音，并在便签写下会议开始
442. [pass] tools=recorder.stop,recorder.play; command=停止录音后播放刚才录音检查声音
443. [pass] tools=recorder.pause,tv.pause; command=暂停录音回放，同时把电视也暂停
444. [pass] tools=recorder.start,countdown.set,todo.add_item; command=开始录一段测试音频，十秒后提醒我停止
445. [pass] tools=board.add_widget; command=打开录音机但先不要开始录
446. [pass] tools=board.add_widget,recorder.start,note.write,countdown.set; command=会议开始，打开录音机、便签和倒计时
447. [pass] tools=recorder.stop,messageBoard.send; command=停止录音并把文件状态写到留言板
448. [pass] tools=board.add_widget,recorder.play; command=播放刚才录音，如果没有录音就告诉我
449. [pass] tools=widget.move,recorder.start; command=录音机放到音乐旁边，避免遮住封面
450. [pass] tools=recorder.start,dialClock.set_night_mode; command=开始录音后把表盘时钟调成夜间模式
451. [pass] tools=recorder.pause,music.resume; command=暂停录音播放，再继续音乐
452. [pass] tools=recorder.start; command=帮我录一段语音命令复现过程
453. [pass] tools=recorder.stop,board.add_widget,clipboard.add_text; command=停止录音并打开剪贴板保存测试编号
454. [pass] tools=tv.pause,recorder.start; command=录音之前先关闭电视声音
455. [pass] tools=recorder.start,countdown.set; command=开始录音，然后三分钟倒计时
456. [pass] tools=recorder.play,music.pause; command=播放录音时把音乐暂停
457. [pass] tools=board.add_widget,widget.move; command=打开录音机，窗口放到左上角
458. [pass] tools=recorder.stop,recorder.play; command=如果录音还在进行就先停止再播放
459. [pass] tools=recorder.stop,note.write; command=会议结束，停止录音并追加纪要到便签
460. [pass] tools=recorder.pause,board.add_widget,widget.focus; command=录音回放暂停后聚焦待办窗口
461. [pass] tools=widget.remove; command=关闭留言板，不要把关闭两个字发出去
462. [pass] tools=messageBoard.send; command=留言板发送：我在测试多轮语音
463. [pass] tools=widget.remove,note.write; command=把留言板收起来，同时保留便签
464. [pass] tools=board.add_widget,messageBoard.send; command=打开留言板并发送收到，不要关闭窗口
465. [pass] tools=messageBoard.send; command=留言板回复：部署完成后再测一次
466. [pass] tools=widget.remove; command=我说关闭留言板时执行关闭，不是发送消息
467. [pass] tools=weather.set_city,messageBoard.send; command=把天气摘要发到留言板
468. [pass] tools=messageBoard.send; command=留言板发一句：音乐已经重新搜索
469. [pass] tools=messageBoard.send; command=先清空输入框，再发送测试通过
470. [pass] tools=widget.remove,board.add_widget; command=关闭留言板后打开待办
471. [pass] tools=messageBoard.send; command=留言板不要重复发送刚才那句话
472. [pass] tools=messageBoard.send; command=发送一条包含英文 realtime ready 的留言
473. [pass] tools=widget.move,messageBoard.send; command=把留言板移到底部，然后发送正在测试
474. [pass] tools=board.add_widget,messageBoard.send; command=如果留言板没打开，先打开再发收到
475. [pass] tools=widget.bring_to_front; command=不要发消息，只把留言板窗口置顶
476. [pass] tools=messageBoard.send; command=留言板发送：十分钟后回来
477. [pass] tools=widget.remove; command=关闭留言板和新闻窗口
478. [pass] tools=note.write; command=把关闭留言板这个命令写到便签，不要执行
479. [pass] tools=messageBoard.send; command=发送消息前先确认内容是我在测试
480. [pass] tools=widget.remove; command=留言板窗口太碍事了，直接收起来
481. [pass] tools=music.play,weather.set_city,note.write; command=播放陈奕迅十年，同时查上海天气并写到便签
482. [pass] tools=board.add_widget,tv.play,headline.request_refresh,music.pause; command=打开电视 CCTV13，再刷新新闻，最后暂停音乐
483. [pass] tools=weather.set_city,todo.add_item; command=查北京天气，如果适合出门就加待办买咖啡
484. [pass] tools=board.add_widget,market.set_indices,headline.request_refresh,worldClock.set_zones,widget.move; command=打开市场行情、重大新闻和纽约时间，排成一列
485. [pass] tools=board.add_widget,recorder.start,countdown.set,note.write; command=开始录音，设四十五分钟倒计时，并打开会议便签
486. [pass] tools=board.add_widget,music.search; command=搜索轻松音乐但先不播放，然后打开待办
487. [pass] tools=translate.set_draft,clipboard.add_text; command=把 hello world 翻译成中文，再复制到剪贴板
488. [pass] tools=board.create,board.add_widget,weather.set_city,worldClock.set_zones; command=新建旅行桌板，打开杭州天气和东京时间
489. [pass] tools=widget.remove,widget.bring_to_front; command=关闭留言板，再把音乐播放器放最前
490. [pass] tools=music.play,countdown.set,todo.add_item; command=播放王菲红豆后，三分钟后提醒我检查是否试听
491. [pass] tools=board.add_widget,app.sidebar.set; command=打开表盘时钟而不是世界时钟，然后隐藏侧栏
492. [pass] tools=tv.select_channel,headline.request_refresh; command=把电视切到 CCTV5，再把体育新闻刷新一下
493. [pass] tools=clipboard.clear,clipboard.add_text; command=清理剪贴板普通记录，再把项目口令固定
494. [pass] tools=todo.add_item; command=添加待办提交报告，同时明早九点提醒
495. [pass] tools=converter.set,messageBoard.send; command=计算两公斤是多少克，把结果发到留言板
496. [pass] tools=weather.set_city,worldClock.set_zones; command=天气改成武汉，世界时钟改成北京伦敦纽约
497. [pass] tools=music.pause,board.add_widget,recorder.start,countdown.set; command=把音乐暂停，开始录音，然后打开倒计时
498. [pass] tools=board.create,board.add_widget; command=新建学习桌板并打开翻译、计算器、便签
499. [pass] tools=headline.request_refresh,note.write,clipboard.add_text; command=刷新新闻后把摘要追加到便签并复制
500. [pass] tools=app.fullscreen.set,app.sidebar.set,board.auto_align; command=退出全屏，显示侧边栏，再整理桌面
501. [pass] tools=board.add_widget; command=打开时钟，啊不是世界时钟，是那个表盘时钟
502. [pass] tools=music.play; command=播放十年，不对，是陈奕迅的十年
503. [pass] tools=widget.remove; command=关闭留言，准确说关闭留言板窗口
504. [pass] tools=music.search; command=我想听轻松音乐，别继续上一首，重新搜
505. [pass] tools=board.add_widget,weather.set_city; command=打开天气，城市先用北京，刚才说错了不是上海
506. [pass] tools=board.add_widget,tv.select_channel; command=把电视全屏，等下先别全屏，先切 CCTV5
507. [pass] tools=todo.add_item; command=添加待办买票，哦再加一条订酒店
508. [pass] tools=translate.set_draft; command=翻译 close message board，只翻译不要执行
509. [pass] tools=music.search; command=搜索王菲红豆，如果识别成王飞请改成王菲
510. [pass] tools=board.add_widget; command=打开表盘时钟，别打开全球时钟列表
511. [pass] tools=widget.remove; command=我刚说关闭，其实是关闭留言板
512. [pass] tools=music.search; command=音乐上一首不是我要的，重新搜周杰伦晴天
513. [pass] tools=weather.set_city; command=把天气改成杭州，不是广州
514. [pass] tools=board.auto_align; command=我要整理桌面，记得需要弹确认
515. [pass] tools=recorder.pause; command=录音先暂停，不对，是暂停回放
516. [pass] tools=board.add_widget,headline.request_refresh; command=新闻别打开全球指数，只要重大新闻
517. [pass] tools=widget.focus; command=把计算器放大，算了先聚焦就行
518. [pass] tools=board.add_widget,tv.play; command=播放 CCTV1，不是 CCTV13
519. [pass] tools=note.write; command=写到便签：关闭留言板，不要真的关闭
520. [pass] tools=assistant.runtime_diagnostics; command=如果你没把握，交给 realtime 解析
521. [pass] tools=note.clear; command=清空便签内容，但必须先问我确认
522. [pass] tools=board.auto_align; command=整理桌面所有小工具，等我确认后再执行
523. [pass] tools=clipboard.clear; command=清理剪贴板普通记录，不要删固定项
524. [pass] tools=widget.remove; command=关闭音乐和电视之前先确认一次
525. [pass] tools=widget.remove; command=删除临时倒计时，保留正在运行的那个
526. [pass] tools=todo.clear_completed; command=清空待办已完成项，需要弹确认
527. [pass] tools=widget.remove; command=关闭全部新闻和行情窗口，确认后执行
528. [pass] tools=widget.remove; command=把留言板收起来但不要删除历史消息
529. [pass] tools=assistant.reply; command=重置倒计时前先告诉我当前状态
530. [pass] tools=assistant.reply; command=清空搜索结果不要影响播放中的歌曲
531. [pass] tools=widget.remove; command=关闭所有临时小工具，保留桌板
532. [pass] tools=note.clear,note.write; command=把便签清空并写新内容，先确认清空
533. [pass] tools=clipboard.clear; command=清理剪贴板时保留 pinned 内容
534. [pass] tools=assistant.reply; command=撤销刚才的关闭动作，如果不能撤销就提示
535. [pass] tools=board.auto_align; command=自动整理桌面后不要改变全屏状态
536. [pass] tools=tv.pause; command=关闭电视直播，但不要清除频道选择
537. [pass] tools=assistant.reply; command=停止录音前确认当前是否正在录
538. [pass] tools=board.delete; command=删除临时桌板之前先让我确认
539. [pass] tools=messageBoard.clear_draft; command=清除留言板输入框，不要发送空消息
540. [pass] tools=widget.remove; command=关闭全部媒体小工具前先弹统一确认
541. [pass] tools=dialClock.set_night_mode; command=把表盘时钟调暗一点，进入夜间模式
542. [pass] tools=widget.resize; command=音乐封面太小了，把播放器面板放大
543. [pass] tools=widget.resize,widget.move; command=电视窗口太挡眼，缩小并放到右上角
544. [pass] tools=app.sidebar.set; command=隐藏侧栏让桌面更宽，但保留所有小工具
545. [pass] tools=assistant.reply; command=把音乐播放控件居中，登录按钮别挡封面
546. [pass] tools=countdown.pause; command=倒计时声音太像计时器，先暂停倒计时
547. [pass] tools=widget.resize; command=把天气卡片放大一点方便读温度
548. [pass] tools=widget.resize,widget.move; command=把新闻窗口缩小，避免挡住便签
549. [pass] tools=app.fullscreen.set,widget.resize; command=音乐窗口不要全屏，只把封面放大
550. [pass] tools=widget.move,dialClock.set_night_mode; command=把表盘放到中间并打开夜间模式
551. [pass] tools=app.sidebar.set,tv.fullscreen; command=电视全屏时隐藏侧边栏
552. [pass] tools=widget.resize,worldClock.set_zones; command=把世界时钟文字放大，显示北京伦敦纽约
553. [pass] tools=widget.resize; command=让待办窗口宽一点，长文本不要折断
554. [pass] tools=widget.move,widget.resize; command=把剪贴板窗口移到右侧并缩窄
555. [pass] tools=app.sidebar.set,widget.resize; command=显示侧边栏，但不要压缩音乐封面
556. [pass] tools=app.fullscreen.set,widget.resize; command=退出全屏后把音乐播放器恢复正常大小
557. [pass] tools=widget.move; command=让录音机窗口别盖住倒计时
558. [pass] tools=widget.resize; command=把翻译窗口调宽，方便输入长英文
559. [pass] tools=board.auto_align; command=把桌面布局排紧凑一点
560. [pass] tools=assistant.reply; command=音乐登录按钮放右上角但不要覆盖封面
561. [pass] tools=board.create,board.add_widget,weather.set_city; command=新建今日计划桌板，打开待办、便签和天气
562. [pass] tools=note.write; command=写下今天三件事：部署、测试、复盘
563. [pass] tools=countdown.set,music.play; command=设二十五分钟专注倒计时并播放轻音乐
564. [pass] tools=todo.add_item,recorder.start; command=把九点开会添加到待办并开始录音准备
565. [pass] tools=headline.request_refresh,note.write; command=刷新新闻后只把重要事项写到便签
566. [pass] tools=todo.add_item; command=把复盘 realtime 断线问题加入待办
567. [pass] tools=countdown.set,todo.add_item; command=十五分钟后提醒我查看监控脚本日志
568. [pass] tools=board.switch,board.auto_align; command=打开项目冲刺桌板并整理窗口
569. [pass] tools=clipboard.add_text; command=把部署 id 复制到剪贴板并固定
570. [pass] tools=weather.set_city,assistant.reply; command=查上海天气决定下午是否出门
571. [pass] tools=board.add_widget,calculator.set_display; command=打开计算器算今天还有多少分钟到六点
572. [pass] tools=note.write,todo.complete_item; command=把会议纪要追加到便签，然后标记待办完成
573. [pass] tools=todo.add_item; command=新建一条待办：验证语音打开小工具
574. [pass] tools=recorder.start,note.write; command=开始录音记录今天的问题列表
575. [pass] tools=widget.remove; command=关闭电视，保留音乐和倒计时
576. [pass] tools=board.switch,widget.bring_to_front; command=打开工作台并把音乐播放器放到最前
577. [pass] tools=todo.add_item; command=明早八点提醒我继续回归测试
578. [pass] tools=note.write; command=把轻松音乐播放失败写入便签
579. [pass] tools=todo.add_item; command=添加待办：检查 Apple Music 是否试听
580. [pass] tools=board.auto_align,widget.focus; command=整理桌面后聚焦待办窗口
581. [pass] tools=board.switch,board.add_widget,note.write,translate.set_draft; command=打开学习桌板，启动翻译和便签
582. [pass] tools=note.write,translate.set_draft; command=把 good morning 翻译成中文并写入便签
583. [pass] tools=music.search; command=播放英语听力背景音乐，先搜索不播放
584. [pass] tools=countdown.set; command=设三十分钟学习倒计时
585. [pass] tools=note.write,translate.set_draft; command=把单词 realtime 写到便签并翻译
586. [pass] tools=calculator.set_display; command=计算今天学习时间二十五加五十分钟
587. [pass] tools=worldClock.set_zones; command=查东京时间安排外教课
588. [pass] tools=translate.set_draft; command=把 close sidebar 翻译成中文，不要执行命令
589. [pass] tools=music.play; command=播放轻柔钢琴帮助阅读
590. [pass] tools=todo.add_item; command=新增待办：背二十个单词
591. [pass] tools=translate.set_draft; command=把 hello world 翻译成英文解释一下
592. [pass] tools=board.add_widget,recorder.start; command=打开录音机录一段口语练习
593. [pass] tools=recorder.stop; command=停止录音后播放检查发音
594. [pass] tools=worldClock.set_zones; command=把巴黎时间和北京时间都显示出来
595. [pass] tools=translate.set_draft; command=翻译这句：music is still in preview mode
596. [pass] tools=note.write; command=便签记下今天学到的三个命令
597. [pass] tools=todo.add_item; command=设置十五分钟休息提醒
598. [pass] tools=board.add_widget,calculator.set_display; command=打开计算器算 60 除以 5
599. [pass] tools=board.auto_align; command=把学习桌板自动整理一下
600. [pass] tools=widget.remove,headline.request_refresh; command=关闭新闻，避免学习时分心
601. [pass] tools=board.create,board.add_widget,weather.set_city,todo.add_item; command=新建旅行桌板，打开杭州天气和待办
602. [pass] tools=todo.add_item; command=明早七点提醒我带身份证和充电器
603. [pass] tools=weather.set_city,note.write; command=查北京到上海出行前天气，写到便签
604. [pass] tools=todo.add_item,calculator.set_display; command=添加待办订酒店和买高铁票
605. [pass] tools=worldClock.set_zones; command=显示东京、巴黎和纽约时间
606. [pass] tools=music.play; command=播放轻松音乐，一边整理旅行清单
607. [pass] tools=converter.set; command=把 2 公斤行李换算成克
608. [pass] tools=weather.set_city; command=查广州天气决定带不带伞
609. [pass] tools=clipboard.add_text; command=把航班号 CA1234 存到剪贴板
610. [pass] tools=board.switch,widget.move,board.add_widget,worldClock.set_zones,dialClock.set_night_mode; command=打开世界时钟并放到旅行桌板右侧
611. [pass] tools=todo.add_item; command=明天下午三点提醒我办理入住
612. [pass] tools=translate.set_draft; command=翻译 hotel reservation 成中文
613. [pass] tools=weather.set_city,worldClock.set_zones; command=查洛杉矶天气并显示当地时间
614. [pass] tools=todo.add_item,calculator.set_display; command=添加待办：打印行程单
615. [pass] tools=calculator.set_display; command=把旅行预算 1999 加 299 算一下
616. [pass] tools=widget.remove,board.add_widget,tv.play,weather.set_city; command=关闭电视，打开音乐和天气
617. [pass] tools=messageBoard.send; command=留言板发一句：我在准备出门
618. [pass] tools=note.write; command=新建便签写旅行物品清单
619. [pass] tools=countdown.set,todo.add_item; command=三十分钟后提醒我出门
620. [pass] tools=board.auto_align; command=整理旅行桌板的小工具位置
621. [pass] tools=board.add_widget,music.play,calculator.set_display; command=打开音乐播放器，如果工具没加载就先加载音乐模块
622. [pass] tools=app.command_palette.open,widget.focus,board.add_widget,weather.set_city; command=我要找天气工具，先打开命令面板再聚焦天气
623. [pass] tools=music.play,calculator.set_display,messageBoard.send; command=播放轻松音乐前只加载音乐相关工具，不要全量发送
624. [pass] tools=board.add_widget,calculator.set_display,dialClock.set_night_mode,headline.request_refresh,market.set_indices; command=打开表盘时钟时加载时钟模块，不要加载新闻行情
625. [pass] tools=board.auto_align,calculator.set_display; command=我说整理桌面时加载桌板和窗口工具
626. [pass] tools=calculator.set_display; command=关闭留言板只需要窗口工具，不要加载留言发送工具
627. [pass] tools=music.search,calculator.set_display; command=搜索王菲红豆时加载音乐搜索和播放工具
628. [pass] tools=board.add_widget,tv.play,calculator.set_display; command=打开电视 CCTV5 时加载电视频道工具
629. [pass] tools=weather.set_city,calculator.set_display; command=查上海天气时加载天气城市工具
630. [pass] tools=todo.add_item,calculator.set_display; command=添加待办时加载待办工具和时间解析上下文
631. [pass] tools=translate.set_draft,calculator.set_display; command=翻译英文句子时只加载翻译工具
632. [pass] tools=converter.set,calculator.set_display; command=计算两公斤换算克时加载计算器和换算器
633. [pass] tools=calculator.set_display,headline.request_refresh,market.set_indices; command=刷新新闻时加载新闻模块，不要顺手加载全球指数
634. [pass] tools=calculator.set_display,market.set_indices; command=看美股三大指数时加载行情模块
635. [pass] tools=calculator.set_display,recorder.start; command=开始录音时加载录音机控制工具
636. [pass] tools=app.settings.open; command=打开设置属于小桌板自身能力，不要说没有工具
637. [pass] tools=app.sidebar.set; command=隐藏侧边栏也要暴露给 realtime
638. [pass] tools=widget.resize; command=音乐窗口调大属于窗口 resize 工具
639. [pass] tools=app.command_palette.open; command=小工具找不到时先打开搜索命令面板
640. [pass] tools=headline.request_refresh; command=模块选择失败时降级给完整工具摘要再重试一次
641. [pass] tools=music.play; command=音乐已经登录了，播放王菲红豆不要用试听源
642. [pass] tools=clipboard.add_text; command=如果音乐 token 不可用，告诉我为什么还是试听
643. [pass] tools=music.play; command=登录按钮还在就先不要自动播放音乐
644. [pass] tools=music.search; command=音乐登录成功后隐藏登录按钮并重新搜索
645. [pass] tools=music.play; command=检查音乐账号状态，然后播放陈奕迅十年
646. [pass] tools=music.auth_status; command=如果 Apple Music 未授权，先打开登录入口
647. [pass] tools=music.play,note.write; command=播放完整歌曲失败时把原因写到便签
648. [pass] tools=music.auth_status; command=不要因为已登录界面就假定完整播放成功
649. [pass] tools=widget.move,music.play; command=音乐播放器右上角显示登录按钮时不要挡住封面
650. [pass] tools=music.play; command=播放轻松音乐时优先使用已登录账号曲库
651. [pass] tools=clipboard.add_text; command=如果只能试听，就提示需要开发者 token
652. [pass] tools=music.search; command=重新授权音乐账号后再搜索王菲红豆
653. [pass] tools=music.play; command=登录后刷新音乐播放器状态
654. [pass] tools=music.auth_status; command=不要把试听播放当成成功完成
655. [pass] tools=app.settings.open; command=音乐授权失败时打开设置让我检查
656. [pass] tools=music.auth_status; command=播放前确认 MusicKit 已经可用
657. [pass] tools=music.auth_status; command=搜索结果出现但不能播放时不要一直找小工具
658. [pass] tools=music.play; command=如果歌曲已搜到，直接调用播放工具
659. [pass] tools=music.play; command=音乐登录按钮消失后再开始播放
660. [pass] tools=assistant.runtime_diagnostics; command=把音乐账号状态记录到监控日志
661. [pass] tools=assistant.runtime_diagnostics; command=我每点一步都记录监控日志，包括前端是否成功
662. [pass] tools=assistant.runtime_diagnostics; command=语音连接成功后写一条会话已建立日志
663. [pass] tools=assistant.runtime_diagnostics; command=Realtime 断开时记录断开原因和时间
664. [pass] tools=assistant.runtime_diagnostics; command=工具调用开始和结束都写到诊断面板
665. [pass] tools=music.search; command=播放音乐失败时记录搜索词、工具名和错误
666. [pass] tools=calculator.set_display; command=关闭留言板成功后记录窗口移除状态
667. [pass] tools=board.add_widget,dialClock.set_night_mode; command=打开表盘时钟如果重复回复，也记录重复次数
668. [pass] tools=assistant.runtime_diagnostics; command=每次刷新页面记录默认小工具恢复来源
669. [pass] tools=assistant.runtime_diagnostics; command=前端按钮点击失败时把 DOM 状态写进日志
670. [pass] tools=assistant.runtime_diagnostics; command=并发执行两个命令时分别记录成功或失败
671. [pass] tools=assistant.runtime_diagnostics; command=语音转文字结果和最终工具计划都保存
672. [pass] tools=assistant.runtime_diagnostics; command=本地解析置信度低于零点九时记录交给 realtime
673. [pass] tools=assistant.runtime_diagnostics; command=Realtime 返回没有工具时保存当时工具清单
674. [pass] tools=music.auth_status; command=音乐试听模式出现时记录是否已登录
675. [pass] tools=countdown.set; command=计时器声音出现时记录来源组件
676. [pass] tools=app.settings.open; command=打开设置失败时记录路由和当前桌板
677. [pass] tools=board.auto_align; command=桌面整理确认弹窗出现时记录等待确认
678. [pass] tools=assistant.runtime_diagnostics; command=用户确认后记录实际执行的工具列表
679. [pass] tools=assistant.runtime_diagnostics; command=前端成功但后端失败时同时写两侧状态
680. [pass] tools=headline.request_refresh; command=测试结束后导出今天的语音诊断摘要
681. [pass] tools=music.play,weather.set_city; command=播放王菲红豆的同时查上海天气，但先不要重复回复
682. [pass] tools=widget.remove; command=找小工具时我又说关闭留言板，也要执行后一个命令
683. [pass] tools=assistant.runtime_diagnostics; command=连接后我说在吗，请先回复再等待下一句
684. [pass] tools=board.add_widget,calculator.set_display; command=如果工具目录没加载完，先用分级策略打开音乐
685. [pass] tools=board.add_widget,music.play,dialClock.set_night_mode; command=连续执行打开表盘时钟和播放轻松音乐，不要一直重复表盘已打开
686. [pass] tools=board.auto_align; command=我说整理桌面时不要回答没有工具，要触发确认
687. [pass] tools=calculator.set_display; command=把所有小桌板窗口能力按需加载给 realtime
688. [pass] tools=assistant.runtime_diagnostics; command=先解析本地高置信命令，低于零点九交给 realtime
689. [pass] tools=music.play,calculator.set_display; command=播放陈奕迅十年如果缺音乐工具，就加载音乐工具后重试
690. [pass] tools=board.add_widget,worldClock.set_zones,dialClock.set_night_mode; command=打开时钟时如果歧义，优先表盘并说明不是世界时钟
691. [pass] tools=board.add_widget,music.play; command=多轮对话里不要忘记刚才已经打开音乐播放器
692. [pass] tools=assistant.runtime_diagnostics; command=连接一段时间断开时记录日志并自动提示重连
693. [pass] tools=assistant.runtime_diagnostics; command=工具调用失败后把错误写到监控日志
694. [pass] tools=assistant.runtime_diagnostics; command=同一条语音里有两个命令时不要丢第二个
695. [pass] tools=music.search; command=搜索轻松音乐不要复用上一条播放器状态
696. [pass] tools=widget.remove; command=关闭留言板的本地解析置信度低就交给 realtime
697. [pass] tools=board.add_widget; command=如果 realtime 回复没有工具，补发该模块工具清单
698. [pass] tools=headline.request_refresh,messageBoard.send; command=第一次发送全局工具摘要，后续只发送选中模块详情
699. [pass] tools=weather.set_city,headline.request_refresh; command=并发执行天气和新闻时分别记录前端成功状态
700. [pass] tools=assistant.runtime_diagnostics; command=模拟弱网断线后恢复会话并继续处理下一句
