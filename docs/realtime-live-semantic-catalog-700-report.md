# Realtime-2 Live Semantic Catalog 700 Report

- Date: 2026-06-19T16:48:55.793Z
- Model: gpt-realtime-2
- Credential source: production-ephemeral-token
- Source site: https://xiaozhuoban.bqxb.org
- Cases: 693/700 passed
- Batch size: 12
- Secret handling: Realtime credentials are never written to this report.

## Failure Summary

- other: 5
- window-layout-intent: 1
- music-intent: 1

## Failures

| id | command | expected | actual | missing | unexpected | category |
| --- | --- | --- | --- | --- | --- | --- |
| 125 | 一分半以后叫我，场景1 | must=todo.add_item | countdown.set | missing=todo.add_item | countdown.set | other |
| 259 | 把音乐窗口退出全屏，然后调整到宽度 520 | must=app.fullscreen.set,widget.resize | widget.resize | missing=app.fullscreen.set |  | window-layout-intent |
| 399 | 固定保存音乐登录状态检查步骤 | must=clipboard.add_text; forbid=music.auth_status | note.write | missing=clipboard.add_text | note.write | other |
| 454 | 录音之前先关闭电视声音 | must=tv.pause,recorder.start; forbid=tv.pause | tv.pause, recorder.start | forbidden=tv.pause |  | other |
| 493 | 清理剪贴板普通记录，再把项目口令固定 | must=clipboard.clear,clipboard.add_text | clipboard.clear | missing=clipboard.add_text |  | other |
| 536 | 关闭电视直播，但不要清除频道选择 | must=tv.pause; forbid=tv.pause | tv.pause | forbidden=tv.pause |  | other |
| 623 | 播放轻松音乐前只加载音乐相关工具，不要全量发送 | must=music.play | assistant.runtime_diagnostics, board.add_widget, music.search | missing=music.play | assistant.runtime_diagnostics, board.add_widget, music.search | music-intent |

## Per-Command Results

| id | route | command | expected | actual | confidence | result |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | shortcut-local | 把左边栏先藏起来 | must=app.sidebar.set | app.sidebar.set | 0.96 | pass |
| 002 | shortcut-local | 侧边栏重新显示 | must=app.sidebar.set | app.sidebar.set | 0.96 | pass |
| 003 | shortcut-local | 进入沉浸全屏 | must=app.fullscreen.set | app.fullscreen.set | 0.95 | pass |
| 004 | shortcut-local | 退出全屏回普通窗口 | must=app.fullscreen.set | app.fullscreen.set | 0.95 | pass |
| 005 | shortcut-local | 打开小桌板设置 | must=app.settings.open | app.settings.open | 0.98 | pass |
| 006 | shortcut-local | 打开搜索命令面板 | must=app.command_palette.open | app.command_palette.open | 0.98 | pass |
| 007 | shortcut-local | 我要新建一个 AI 小工具 | must=app.ai_dialog.open | app.ai_dialog.open | 0.97 | pass |
| 008 | shortcut-local | 整理一下桌面所有小工具 | must=board.auto_align | board.auto_align | 0.97 | pass |
| 009 | realtime-2-required | 新开一个学习桌板 | must=board.create | board.create | 0.96 | pass |
| 010 | realtime-2-required | 把当前桌板改名叫夜间工作 | must=board.rename | board.rename | 0.97 | pass |
| 011 | realtime-2-required | 切回工作台桌板 | must=board.switch | board.switch | 0.96 | pass |
| 012 | realtime-2-required | 把电视拖到右上角 | must=widget.move | widget.move | 0.96 | pass |
| 013 | realtime-2-required | 把电视面板调大一点 | must=widget.resize | widget.resize | 0.68 | pass |
| 014 | realtime-2-required | 把音乐播放器放最前 | must=widget.bring_to_front,widget.focus | widget.bring_to_front, widget.focus | 0.9 | pass |
| 015 | realtime-2-required | 聚焦天气卡片 | must=widget.focus,weather.set_city | widget.focus, weather.set_city | 0.86 | pass |
| 016 | realtime-2-required | 全屏看电视 | must=widget.fullscreen_focus,tv.fullscreen,tv.play | tv.play, tv.fullscreen, widget.fullscreen_focus | 0.92 | pass |
| 017 | shortcut-local | 关闭留言板 | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.98 | pass |
| 018 | realtime-2-required | 打开一个表盘时钟 | must=board.add_widget,dialClock.set_night_mode | board.add_widget, dialClock.set_night_mode | 0.96 | pass |
| 019 | realtime-2-required | 新建便签实例用于测试 | anyOf=board.add_widget/note.write | board.add_widget | 0.94 | pass |
| 020 | shortcut-local | 查北京今天冷不冷 | must=weather.set_city | weather.set_city | 0.99 | pass |
| 021 | shortcut-local | 上海天气给我看一下 | must=weather.set_city | weather.set_city | 0.99 | pass |
| 022 | shortcut-local | 看看洛杉矶天气 | must=weather.set_city | weather.set_city, worldClock.set_zones | 0.93 | pass |
| 023 | shortcut-local | 杭州现在什么天气 | must=weather.set_city | weather.set_city | 0.99 | pass |
| 024 | shortcut-local | 帮我换到武汉天气 | must=weather.set_city | weather.set_city | 0.99 | pass |
| 025 | shortcut-local | 波士顿天气 | must=weather.set_city | weather.set_city | 0.98 | pass |
| 026 | shortcut-local | 广州天气怎么样 | must=weather.set_city | weather.set_city | 0.99 | pass |
| 027 | shortcut-local | 成都天气打开看看 | must=weather.set_city | board.add_widget, weather.set_city | 0.99 | pass |
| 028 | shortcut-local | 设一个三分钟倒计时 | must=countdown.set | countdown.set | 0.99 | pass |
| 029 | realtime-2-required | 十分钟后提醒我 | anyOf=todo.add_item/countdown.set | countdown.set, todo.add_item | 0.99 | pass |
| 030 | shortcut-local | 暂停现在的计时器 | must=countdown.pause | countdown.pause | 0.99 | pass |
| 031 | shortcut-local | 继续刚才那个倒计时 | must=countdown.resume | countdown.resume | 0.99 | pass |
| 032 | shortcut-local | 重置倒计时 | must=countdown.reset | countdown.reset | 0.99 | pass |
| 033 | shortcut-local | 设置二十五秒计时 | must=countdown.set | countdown.set | 0.99 | pass |
| 034 | shortcut-local | 半小时倒计时开始 | must=countdown.set | countdown.set | 0.99 | pass |
| 035 | shortcut-local | 先定时一小时 | must=countdown.set | countdown.set | 0.99 | pass |
| 036 | shortcut-local | 便签记下今天继续回归测试 | must=note.write | note.write | 0.99 | pass |
| 037 | shortcut-local | 把会议纪要追加到便签 | must=note.write | note.write | 0.96 | pass |
| 038 | shortcut-local | 清空便签内容 | must=note.clear | note.clear | 0.98 | pass |
| 039 | shortcut-local | 添加待办买咖啡豆 | must=todo.add_item | todo.add_item | 0.97 | pass |
| 040 | shortcut-local | 明早九点提醒我提交报告 | must=todo.add_item | countdown.set, todo.add_item | 0.94 | pass |
| 041 | shortcut-local | 把买牛奶这项勾掉 | must=todo.complete_item | todo.complete_item | 0.95 | pass |
| 042 | shortcut-local | 复制演示账号到剪贴板 | must=clipboard.add_text | clipboard.add_text | 0.96 | pass |
| 043 | shortcut-local | 固定保存项目口令 demo | must=clipboard.add_text; forbid=music.auth_status | clipboard.add_text | 0.93 | pass |
| 044 | shortcut-local | 清理剪贴板普通记录 | must=clipboard.clear | clipboard.clear | 0.92 | pass |
| 045 | shortcut-local | 把 hello world 翻译成中文 | must=translate.set_draft | translate.set_draft | 0.98 | pass |
| 046 | shortcut-local | 你好翻译成英文 | must=translate.set_draft | translate.set_draft | 0.98 | pass |
| 047 | shortcut-local | 十二加三十算一下 | must=calculator.set_display | calculator.set_display | 0.99 | pass |
| 048 | shortcut-local | 2斤是多少克 | anyOf=converter.set/calculator.set_display | converter.set | 0.99 | pass |
| 049 | shortcut-local | 十二米换算公里 | anyOf=converter.set/calculator.set_display | converter.set | 0.98 | pass |
| 050 | shortcut-local | 两公斤换算成克 | anyOf=converter.set/calculator.set_display | converter.set | 0.98 | pass |
| 051 | shortcut-local | 世界时钟显示北京伦敦纽约 | must=worldClock.set_zones | worldClock.set_zones | 0.96 | pass |
| 052 | shortcut-local | 看东京和巴黎时间 | must=worldClock.set_zones | worldClock.set_zones, weather.set_city | 0.86 | pass |
| 053 | realtime-2-required | 刷新重大新闻 | must=headline.request_refresh | headline.request_refresh | 0.97 | pass |
| 054 | realtime-2-required | 今天有什么头条新闻 | must=headline.request_refresh | headline.request_refresh | 0.96 | pass |
| 055 | realtime-2-required | 看美股三大指数 | must=market.set_indices | market.set_indices | 0.96 | pass |
| 056 | realtime-2-required | 打开恒生和上证行情 | must=board.add_widget,market.set_indices | board.add_widget, market.set_indices | 0.97 | pass |
| 057 | shortcut-local | 表盘开启夜间模式 | must=dialClock.set_night_mode | dialClock.set_night_mode | 0.95 | pass |
| 058 | shortcut-local | 关闭时钟夜间模式 | must=dialClock.set_night_mode | dialClock.set_night_mode | 0.95 | pass |
| 059 | shortcut-local | 留言板发一句我在测试 | must=messageBoard.send | messageBoard.send | 0.97 | pass |
| 060 | realtime-2-required | 搜一点轻松的音乐 | must=music.search | music.search | 0.97 | pass |
| 061 | realtime-2-required | 播放王菲的红豆 | must=music.play | music.play | 0.99 | pass |
| 062 | realtime-2-required | 来一首陈奕迅十年 | must=music.play | music.play | 0.99 | pass |
| 063 | shortcut-local | 音乐先暂停 | must=music.pause | music.pause | 0.99 | pass |
| 064 | shortcut-local | 继续刚才的歌 | must=music.resume | music.resume | 0.99 | pass |
| 065 | shortcut-local | 下一首歌 | must=music.next | music.next | 0.99 | pass |
| 066 | shortcut-local | 上一首 | must=music.previous | music.previous | 0.99 | pass |
| 067 | shortcut-local | 电视切到 CCTV13 | anyOf=tv.play/tv.select_channel | tv.select_channel | 0.98 | pass |
| 068 | shortcut-local | 播放 CCTV1 | anyOf=tv.play/tv.select_channel | tv.select_channel, tv.play | 0.98 | pass |
| 069 | shortcut-local | 暂停电视直播 | must=tv.pause | tv.pause | 0.99 | pass |
| 070 | shortcut-local | 电视全屏 | must=tv.fullscreen | tv.fullscreen, widget.fullscreen_focus | 0.99 | pass |
| 071 | shortcut-local | 开始录音 | must=recorder.start | recorder.start | 0.99 | pass |
| 072 | realtime-2-required | 停止录音 | must=recorder.stop | recorder.stop | 0.99 | pass |
| 073 | realtime-2-required | 播放刚才录音 | must=recorder.play | recorder.play | 0.96 | pass |
| 074 | realtime-2-required | 暂停录音回放 | must=recorder.pause | recorder.pause | 0.98 | pass |
| 075 | shortcut-local | 把音乐收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 076 | shortcut-local | 把电视收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 077 | shortcut-local | 把录音机收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 078 | shortcut-local | 把天气收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 079 | shortcut-local | 把倒计时收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 080 | shortcut-local | 把待办收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 081 | shortcut-local | 把剪贴板收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 082 | shortcut-local | 把翻译收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 083 | shortcut-local | 把计算器收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 084 | shortcut-local | 把行情收起来 | must=widget.remove | widget.remove | 0.9 | pass |
| 085 | shortcut-local | 把新闻收起来 | must=widget.remove | widget.remove | 0.94 | pass |
| 086 | shortcut-local | 把世界时钟收起来 | must=widget.remove | widget.remove | 0.94 | pass |
| 087 | shortcut-local | 切到音乐窗口 | must=widget.focus | widget.focus | 0.95 | pass |
| 088 | shortcut-local | 切到电视窗口 | must=widget.focus | widget.focus | 0.95 | pass |
| 089 | shortcut-local | 切到录音机窗口 | must=widget.focus | widget.focus | 0.95 | pass |
| 090 | shortcut-local | 切到天气窗口 | must=widget.focus | widget.focus, weather.set_city | 0.9 | pass |
| 091 | shortcut-local | 切到待办窗口 | must=widget.focus | widget.focus | 0.95 | pass |
| 092 | shortcut-local | 切到留言板窗口 | must=widget.focus | widget.focus | 0.95 | pass |
| 093 | shortcut-local | 切到表盘时钟窗口 | must=widget.focus | widget.focus | 0.95 | pass |
| 094 | shortcut-local | 切到便签窗口 | must=widget.focus | widget.focus | 0.95 | pass |
| 095 | realtime-2-required | 再打开一个音乐 | must=board.add_widget | board.add_widget | 0.93 | pass |
| 096 | realtime-2-required | 再打开一个电视 | must=board.add_widget | board.add_widget | 0.93 | pass |
| 097 | realtime-2-required | 再打开一个天气 | must=board.add_widget | board.add_widget, weather.set_city | 0.92 | pass |
| 098 | realtime-2-required | 再打开一个倒计时 | must=board.add_widget | board.add_widget | 0.96 | pass |
| 099 | realtime-2-required | 再打开一个待办 | must=board.add_widget | board.add_widget, todo.add_item | 0.88 | pass |
| 100 | realtime-2-required | 再打开一个剪贴板 | must=board.add_widget | board.add_widget | 0.96 | pass |
| 101 | realtime-2-required | 再打开一个翻译 | must=board.add_widget | board.add_widget, translate.set_draft | 0.9 | pass |
| 102 | realtime-2-required | 再打开一个计算器 | must=board.add_widget | board.add_widget, calculator.set_display | 0.9 | pass |
| 103 | realtime-2-required | 再打开一个行情 | must=board.add_widget | board.add_widget, market.set_indices | 0.98 | pass |
| 104 | realtime-2-required | 再打开一个新闻 | must=board.add_widget | board.add_widget, headline.request_refresh | 0.98 | pass |
| 105 | realtime-2-required | 再打开一个世界时钟 | must=board.add_widget | board.add_widget, worldClock.set_zones | 0.94 | pass |
| 106 | realtime-2-required | 再打开一个录音机 | must=board.add_widget | board.add_widget | 0.95 | pass |
| 107 | realtime-2-required | 播放陈奕迅十年，然后查上海天气 | must=music.play,weather.set_city | music.play, weather.set_city | 0.97 | pass |
| 108 | realtime-2-required | 隐藏侧边栏，同时打开设置 | must=app.sidebar.set,app.settings.open | app.sidebar.set, app.settings.open | 0.99 | pass |
| 109 | realtime-2-required | 打开电视然后切到 CCTV5 再全屏 | must=board.add_widget,tv.fullscreen; anyOf=tv.play/tv.select_channel | board.add_widget, tv.play, tv.select_channel, tv.fullscreen, widget.fullscreen_focus | 0.98 | pass |
| 110 | realtime-2-required | 先记下买票，然后添加待办订酒店 | must=note.write,todo.add_item | note.write, todo.add_item | 0.96 | pass |
| 111 | realtime-2-required | 关闭音乐和留言板 | must=widget.remove | widget.remove | 0.95 | pass |
| 112 | realtime-2-required | 外面适合出门吗看北京，场景1 | must=weather.set_city | board.add_widget, weather.set_city | 0.97 | pass |
| 113 | realtime-2-required | 我想听点放松的不一定播放，场景1 | must=music.search | music.search | 0.97 | pass |
| 114 | realtime-2-required | 来个周杰伦经典，场景1 | must=music.play | music.play | 0.96 | pass |
| 115 | realtime-2-required | 有空提醒我复盘语音测试，场景1 | must=todo.add_item | todo.add_item | 0.96 | pass |
| 116 | realtime-2-required | good night 帮我看中文，场景1 | must=translate.set_draft | translate.set_draft | 0.96 | pass |
| 117 | realtime-2-required | 十二乘十二，场景1 | must=calculator.set_display | calculator.set_display | 0.97 | pass |
| 118 | realtime-2-required | 纳指给我看一眼，场景1 | must=market.set_indices | board.add_widget, market.set_indices | 0.97 | pass |
| 119 | realtime-2-required | 东京现在几点，场景1 | must=worldClock.set_zones | board.add_widget, worldClock.set_zones | 0.96 | pass |
| 120 | realtime-2-required | 看看刚刚有什么新闻，场景1 | must=headline.request_refresh | board.add_widget, headline.request_refresh | 0.96 | pass |
| 121 | realtime-2-required | 帮我录一段，场景1 | must=recorder.start | recorder.start | 0.96 | pass |
| 122 | realtime-2-required | 电影频道打开，场景1 | anyOf=tv.play/tv.select_channel | board.add_widget, tv.select_channel, tv.play | 0.94 | pass |
| 123 | realtime-2-required | 留言板回复收到，场景1 | must=messageBoard.send | messageBoard.send | 0.96 | pass |
| 124 | realtime-2-required | 临时验证码存起来，场景1 | must=clipboard.add_text | clipboard.add_text | 0.93 | pass |
| 125 | realtime-2-required | 一分半以后叫我，场景1 | must=todo.add_item | countdown.set | 0.92 | fail: missing=todo.add_item |
| 126 | realtime-2-required | 钟表别太亮，场景1 | must=dialClock.set_night_mode | board.add_widget, dialClock.set_night_mode | 0.95 | pass |
| 127 | realtime-2-required | 我要找功能，场景1 | must=app.command_palette.open | app.command_palette.open | 0.97 | pass |
| 128 | realtime-2-required | 帮我做一个新工具，场景1 | must=app.ai_dialog.open | app.ai_dialog.open | 0.97 | pass |
| 129 | realtime-2-required | 回到工作台，场景1 | must=board.switch | board.switch | 0.9 | pass |
| 130 | realtime-2-required | 电视别被挡住，场景1 | must=widget.bring_to_front | widget.bring_to_front, widget.focus | 0.95 | pass |
| 131 | realtime-2-required | 音乐面板放大，场景1 | must=widget.resize | widget.resize | 0.93 | pass |
| 132 | realtime-2-required | 外面适合出门吗看北京，场景2 | must=weather.set_city | weather.set_city | 0.95 | pass |
| 133 | realtime-2-required | 我想听点放松的不一定播放，场景2 | must=music.search | music.search | 0.98 | pass |
| 134 | realtime-2-required | 来个周杰伦经典，场景2 | must=music.play | music.play | 0.97 | pass |
| 135 | realtime-2-required | 有空提醒我复盘语音测试，场景2 | must=todo.add_item | todo.add_item | 0.96 | pass |
| 136 | realtime-2-required | good night 帮我看中文，场景2 | must=translate.set_draft | translate.set_draft | 0.99 | pass |
| 137 | realtime-2-required | 十二乘十二，场景2 | must=calculator.set_display | calculator.set_display | 0.99 | pass |
| 138 | realtime-2-required | 纳指给我看一眼，场景2 | must=market.set_indices | market.set_indices | 0.98 | pass |
| 139 | realtime-2-required | 东京现在几点，场景2 | must=worldClock.set_zones | worldClock.set_zones | 0.98 | pass |
| 140 | realtime-2-required | 看看刚刚有什么新闻，场景2 | must=headline.request_refresh | headline.request_refresh | 0.97 | pass |
| 141 | realtime-2-required | 帮我录一段，场景2 | must=recorder.start | recorder.start | 0.96 | pass |
| 142 | realtime-2-required | 电影频道打开，场景2 | anyOf=tv.play/tv.select_channel | board.add_widget, tv.select_channel, tv.play | 0.96 | pass |
| 143 | realtime-2-required | 留言板回复收到，场景2 | must=messageBoard.send | messageBoard.send | 0.98 | pass |
| 144 | realtime-2-required | 临时验证码存起来，场景2 | must=clipboard.add_text | clipboard.add_text | 0.97 | pass |
| 145 | realtime-2-required | 一分半以后叫我，场景2 | must=todo.add_item | countdown.set, todo.add_item | 0.93 | pass |
| 146 | realtime-2-required | 钟表别太亮，场景2 | must=dialClock.set_night_mode | board.add_widget, dialClock.set_night_mode | 0.9 | pass |
| 147 | realtime-2-required | 我要找功能，场景2 | must=app.command_palette.open | app.command_palette.open | 0.95 | pass |
| 148 | realtime-2-required | 帮我做一个新工具，场景2 | must=app.ai_dialog.open | app.ai_dialog.open | 0.92 | pass |
| 149 | realtime-2-required | 回到工作台，场景2 | must=board.switch | board.switch | 0.9 | pass |
| 150 | realtime-2-required | 电视别被挡住，场景2 | must=widget.bring_to_front | widget.focus, widget.bring_to_front | 0.96 | pass |
| 151 | realtime-2-required | 音乐面板放大，场景2 | must=widget.resize | widget.resize | 0.9 | pass |
| 152 | realtime-2-required | 外面适合出门吗看北京，场景3 | must=weather.set_city | weather.set_city | 0.96 | pass |
| 153 | realtime-2-required | 我想听点放松的不一定播放，场景3 | must=music.search | music.search | 0.97 | pass |
| 154 | realtime-2-required | 来个周杰伦经典，场景3 | must=music.play | music.play | 0.95 | pass |
| 155 | realtime-2-required | 有空提醒我复盘语音测试，场景3 | must=todo.add_item | todo.add_item | 0.94 | pass |
| 156 | realtime-2-required | good night 帮我看中文，场景3 | must=translate.set_draft | translate.set_draft | 0.98 | pass |
| 157 | realtime-2-required | 十二乘十二，场景3 | must=calculator.set_display | calculator.set_display | 0.98 | pass |
| 158 | realtime-2-required | 纳指给我看一眼，场景3 | must=market.set_indices | board.add_widget, market.set_indices | 0.96 | pass |
| 159 | realtime-2-required | 东京现在几点，场景3 | must=worldClock.set_zones | worldClock.set_zones | 0.95 | pass |
| 160 | realtime-2-required | 看看刚刚有什么新闻，场景3 | must=headline.request_refresh | headline.request_refresh | 0.96 | pass |
| 161 | realtime-2-required | 帮我录一段，场景3 | must=recorder.start | recorder.start | 0.97 | pass |
| 162 | realtime-2-required | 电影频道打开，场景3 | anyOf=tv.play/tv.select_channel | board.add_widget, tv.play, tv.select_channel | 0.9 | pass |
| 163 | realtime-2-required | 留言板回复收到，场景3 | must=messageBoard.send | messageBoard.send | 0.99 | pass |
| 164 | realtime-2-required | 临时验证码存起来，场景3 | must=clipboard.add_text | clipboard.add_text | 0.92 | pass |
| 165 | realtime-2-required | 一分半以后叫我，场景3 | must=todo.add_item | countdown.set, todo.add_item | 0.97 | pass |
| 166 | realtime-2-required | 钟表别太亮，场景3 | must=dialClock.set_night_mode | dialClock.set_night_mode | 0.94 | pass |
| 167 | realtime-2-required | 我要找功能，场景3 | must=app.command_palette.open | app.command_palette.open | 0.95 | pass |
| 168 | realtime-2-required | 帮我做一个新工具，场景3 | must=app.ai_dialog.open | app.ai_dialog.open | 0.96 | pass |
| 169 | realtime-2-required | 回到工作台，场景3 | must=board.switch | board.switch | 0.9 | pass |
| 170 | realtime-2-required | 电视别被挡住，场景3 | must=widget.bring_to_front | widget.focus, widget.bring_to_front | 0.92 | pass |
| 171 | realtime-2-required | 音乐面板放大，场景3 | must=widget.resize | widget.resize | 0.9 | pass |
| 172 | realtime-2-required | 外面适合出门吗看北京，场景4 | must=weather.set_city | board.add_widget, weather.set_city | 0.95 | pass |
| 173 | realtime-2-required | 我想听点放松的不一定播放，场景4 | must=music.search | music.search | 0.96 | pass |
| 174 | realtime-2-required | 来个周杰伦经典，场景4 | must=music.play | music.play | 0.96 | pass |
| 175 | realtime-2-required | 有空提醒我复盘语音测试，场景4 | must=todo.add_item | todo.add_item | 0.94 | pass |
| 176 | realtime-2-required | good night 帮我看中文，场景4 | must=translate.set_draft | translate.set_draft | 0.97 | pass |
| 177 | realtime-2-required | 十二乘十二，场景4 | must=calculator.set_display | calculator.set_display | 0.98 | pass |
| 178 | realtime-2-required | 纳指给我看一眼，场景4 | must=market.set_indices | board.add_widget, market.set_indices | 0.96 | pass |
| 179 | realtime-2-required | 东京现在几点，场景4 | must=worldClock.set_zones | board.add_widget, worldClock.set_zones | 0.97 | pass |
| 180 | realtime-2-required | 看看刚刚有什么新闻，场景4 | must=headline.request_refresh | board.add_widget, headline.request_refresh | 0.95 | pass |
| 181 | realtime-2-required | 帮我录一段，场景4 | must=recorder.start | recorder.start | 0.83 | pass |
| 182 | realtime-2-required | 电影频道打开，场景4 | anyOf=tv.play/tv.select_channel | board.add_widget, tv.select_channel, tv.play | 0.79 | pass |
| 183 | realtime-2-required | 留言板回复收到，场景4 | must=messageBoard.send | messageBoard.send | 0.9 | pass |
| 184 | realtime-2-required | 临时验证码存起来，场景4 | must=clipboard.add_text | clipboard.add_text | 0.86 | pass |
| 185 | realtime-2-required | 一分半以后叫我，场景4 | must=todo.add_item | countdown.set, todo.add_item | 0.84 | pass |
| 186 | realtime-2-required | 钟表别太亮，场景4 | must=dialClock.set_night_mode | dialClock.set_night_mode | 0.82 | pass |
| 187 | realtime-2-required | 我要找功能，场景4 | must=app.command_palette.open | app.command_palette.open | 0.88 | pass |
| 188 | realtime-2-required | 帮我做一个新工具，场景4 | must=app.ai_dialog.open | app.ai_dialog.open | 0.87 | pass |
| 189 | realtime-2-required | 回到工作台，场景4 | must=board.switch | board.switch | 0.78 | pass |
| 190 | realtime-2-required | 电视别被挡住，场景4 | must=widget.bring_to_front | widget.bring_to_front, widget.focus | 0.83 | pass |
| 191 | realtime-2-required | 音乐面板放大，场景4 | must=widget.resize | widget.resize | 0.83 | pass |
| 192 | realtime-2-required | 外面适合出门吗看北京，场景5 | must=weather.set_city | weather.set_city | 0.9 | pass |
| 193 | realtime-2-required | 我想听点放松的不一定播放，场景5 | must=music.search | music.search | 0.9 | pass |
| 194 | realtime-2-required | 来个周杰伦经典，场景5 | must=music.play | music.play | 0.92 | pass |
| 195 | realtime-2-required | 有空提醒我复盘语音测试，场景5 | must=todo.add_item | todo.add_item | 0.95 | pass |
| 196 | realtime-2-required | good night 帮我看中文，场景5 | must=translate.set_draft | translate.set_draft | 0.96 | pass |
| 197 | realtime-2-required | 十二乘十二，场景5 | must=calculator.set_display | calculator.set_display | 0.97 | pass |
| 198 | realtime-2-required | 纳指给我看一眼，场景5 | must=market.set_indices | market.set_indices | 0.96 | pass |
| 199 | realtime-2-required | 东京现在几点，场景5 | must=worldClock.set_zones | worldClock.set_zones | 0.96 | pass |
| 200 | realtime-2-required | 看看刚刚有什么新闻，场景5 | must=headline.request_refresh | headline.request_refresh | 0.94 | pass |
| 201 | realtime-2-required | 先把左侧边栏收起，然后打开设置检查语音入口 | must=app.sidebar.set,app.settings.open | app.sidebar.set, app.settings.open | 0.93 | pass |
| 202 | realtime-2-required | 进入全屏后马上退出，再打开命令面板找音乐播放器 | must=app.fullscreen.set,app.command_palette.open | app.fullscreen.set, app.command_palette.open | 0.88 | pass |
| 203 | realtime-2-required | 把侧边栏显示回来，同时把设置窗口放到最前面 | must=app.sidebar.set,widget.bring_to_front,widget.focus | app.sidebar.set, widget.bring_to_front, widget.focus | 0.9 | pass |
| 204 | realtime-2-required | 打开设置，切到语音相关页面，如果没有就打开命令面板 | must=app.settings.open,app.command_palette.open | app.settings.open, app.command_palette.open | 0.86 | pass |
| 205 | realtime-2-required | 我想专心一下，隐藏侧栏并把当前桌面整理整齐 | must=app.sidebar.set,board.auto_align | app.sidebar.set, board.auto_align | 0.98 | pass |
| 206 | realtime-2-required | 退出全屏，打开搜索面板，然后输入天气两个字 | must=app.fullscreen.set,app.command_palette.open | app.fullscreen.set, app.command_palette.open, assistant.reply | 0.92 | pass |
| 207 | realtime-2-required | 进入沉浸模式，同时不要关闭正在播放的音乐 | must=app.fullscreen.set | app.fullscreen.set | 0.86 | pass |
| 208 | realtime-2-required | 打开小桌板设置，再新建一个 AI 小工具草稿 | must=app.settings.open,app.ai_dialog.open | app.settings.open, app.ai_dialog.open | 0.97 | pass |
| 209 | realtime-2-required | 把所有弹窗先收起来，只留下命令面板 | must=app.command_palette.open | widget.remove, app.command_palette.open | 0.74 | pass |
| 210 | realtime-2-required | 先显示侧边栏，再把音乐和天气两个窗口都放到前面 | must=app.sidebar.set,widget.bring_to_front,widget.focus | app.sidebar.set, widget.bring_to_front, widget.focus | 0.78 | pass |
| 211 | realtime-2-required | 打开设置后帮我检查有没有登录音乐的入口 | must=app.settings.open; anyOf=music.auth_status/assistant.runtime_diagnostics | app.settings.open, music.auth_status | 0.95 | pass |
| 212 | realtime-2-required | 我刚才误触全屏了，恢复普通窗口并聚焦便签 | must=app.fullscreen.set,widget.focus | app.fullscreen.set, widget.resize, widget.focus | 0.9 | pass |
| 213 | realtime-2-required | 隐藏侧栏，打开 AI 小工具窗口，名字先叫每日摘要 | must=app.sidebar.set,app.ai_dialog.open | app.sidebar.set, app.ai_dialog.open | 0.93 | pass |
| 214 | realtime-2-required | 把命令面板打开，如果当前在全屏就先退出 | must=app.command_palette.open | app.fullscreen.set, app.command_palette.open | 0.96 | pass |
| 215 | realtime-2-required | 进入全屏看电视，同时把侧边栏藏起来 | must=app.sidebar.set,tv.fullscreen,tv.play,widget.fullscreen_focus | board.add_widget, tv.play, tv.fullscreen, widget.fullscreen_focus, app.sidebar.set | 0.96 | pass |
| 216 | realtime-2-required | 把设置打开后不要新建工具，只让我看配置 | must=app.settings.open | app.settings.open | 0.99 | pass |
| 217 | realtime-2-required | 现在先回到普通窗口，然后显示侧边栏 | must=app.sidebar.set,app.fullscreen.set | app.fullscreen.set, app.sidebar.set | 0.93 | pass |
| 218 | realtime-2-required | 打开搜索命令面板并准备查找世界时钟 | must=app.command_palette.open | app.command_palette.open | 0.9 | pass |
| 219 | realtime-2-required | 把侧边栏切换一下，再把表盘时钟放最前 | must=app.sidebar.set,widget.bring_to_front,widget.focus | app.sidebar.set, widget.bring_to_front, widget.focus | 0.92 | pass |
| 220 | realtime-2-required | 清理桌面前先打开设置让我确认 | must=app.settings.open | app.settings.open, board.auto_align | 0.9 | pass |
| 221 | realtime-2-required | 新建一个叫晨间复盘的桌板，然后切过去 | must=board.create | board.create, board.switch | 0.94 | pass |
| 222 | realtime-2-required | 把当前桌板改名成项目冲刺，并整理所有小工具 | must=board.rename,board.auto_align | board.rename, board.auto_align | 0.93 | pass |
| 223 | realtime-2-required | 切到工作台桌板后打开新闻和行情 | must=board.switch,board.add_widget,headline.request_refresh,market.set_indices | board.switch, board.add_widget, headline.request_refresh, market.set_indices | 0.95 | pass |
| 224 | realtime-2-required | 新开旅行计划桌板，把天气、世界时钟和待办都放上去 | must=board.create,board.add_widget,weather.set_city,worldClock.set_zones | board.create, board.add_widget, weather.set_city, worldClock.set_zones, todo.add_item | 0.9 | pass |
| 225 | realtime-2-required | 回到夜间工作桌板，同时把表盘时钟调成夜间模式 | must=board.switch,dialClock.set_night_mode | board.switch, dialClock.set_night_mode | 0.92 | pass |
| 226 | realtime-2-required | 创建一个音乐练习桌板，再打开音乐和录音机 | must=board.create,board.add_widget | board.create, board.add_widget | 0.9 | pass |
| 227 | realtime-2-required | 把当前桌板改成语音回归测试，不要删除任何小工具 | must=board.rename | board.rename | 0.96 | pass |
| 228 | realtime-2-required | 切回工作台，再把电视窗口移动到右上角 | must=widget.move | board.switch, widget.move | 0.93 | pass |
| 229 | realtime-2-required | 新建家庭事务桌板，添加待办、便签和留言板 | must=board.create,board.add_widget | board.create, board.add_widget | 0.96 | pass |
| 230 | realtime-2-required | 把桌面自动整理一下，确认后再聚焦音乐播放器 | must=board.auto_align,widget.focus | board.auto_align, widget.focus | 0.9 | pass |
| 231 | realtime-2-required | 切到学习桌板，打开翻译和计算器 | must=board.switch; anyOf=board.add_widget/translate.set_draft | board.switch, board.add_widget | 0.95 | pass |
| 232 | realtime-2-required | 创建一个市场观察桌板，同时打开行情和重大新闻 | must=board.create,board.add_widget,headline.request_refresh,market.set_indices | board.create, board.add_widget, market.set_indices, headline.request_refresh | 0.96 | pass |
| 233 | realtime-2-required | 把当前桌板重命名为今晚直播，然后打开电视 | must=board.rename,board.add_widget; anyOf=tv.play/tv.select_channel | board.rename, board.add_widget, tv.play | 0.94 | pass |
| 234 | realtime-2-required | 回到默认工作台，把天气卡片调到左上角 | must=board.switch,widget.move | board.switch, board.add_widget, weather.set_city, widget.move | 0.88 | pass |
| 235 | realtime-2-required | 新建一个临时桌板，只放倒计时和便签 | must=board.create,board.add_widget | board.create, board.add_widget | 0.93 | pass |
| 236 | realtime-2-required | 切到项目桌板后把所有窗口按网格排列 | must=board.switch,board.auto_align | board.switch, board.auto_align | 0.92 | pass |
| 237 | realtime-2-required | 把当前桌板命名为会议记录，然后开始录音 | must=board.rename,recorder.start | board.rename, recorder.start | 0.94 | pass |
| 238 | realtime-2-required | 创建阅读桌板，打开便签、翻译和世界时钟 | must=board.create,board.add_widget | board.create, board.add_widget, worldClock.set_zones | 0.95 | pass |
| 239 | realtime-2-required | 切回上一个桌板，如果找不到就打开命令面板 | must=app.command_palette.open,board.switch | board.switch, app.command_palette.open | 0.82 | pass |
| 240 | realtime-2-required | 整理桌板之后把留言板关闭，不要发送留言 | must=board.auto_align,widget.remove | board.auto_align, widget.remove | 0.93 | pass |
| 241 | realtime-2-required | 把音乐播放器移到左下角，再把封面区域放大一点 | must=widget.move,widget.resize | widget.move, widget.resize | 0.86 | pass |
| 242 | realtime-2-required | 把天气卡片缩小，电视窗口放到右上角并置顶 | must=widget.resize,widget.move,widget.bring_to_front,widget.focus | widget.resize, widget.move, widget.bring_to_front, widget.focus | 0.92 | pass |
| 243 | realtime-2-required | 关闭留言板，然后打开一个新的便签实例 | must=widget.remove,board.add_widget; forbid=messageBoard.send | widget.remove, board.add_widget | 0.93 | pass |
| 244 | realtime-2-required | 把电视窗口全屏，退出后仍然放在最前面 | must=widget.fullscreen_focus | tv.fullscreen, widget.fullscreen_focus, widget.bring_to_front, widget.focus | 0.9 | pass |
| 245 | realtime-2-required | 把录音机移到音乐旁边，两个窗口都不要遮住 | must=widget.move | widget.move, widget.resize | 0.84 | pass |
| 246 | realtime-2-required | 把世界时钟放到右侧，把表盘时钟放到中间 | must=widget.move | widget.move, board.add_widget, dialClock.set_night_mode | 0.9 | pass |
| 247 | realtime-2-required | 把行情窗口调宽，同时刷新重大新闻 | must=widget.resize,headline.request_refresh | widget.resize, headline.request_refresh | 0.91 | pass |
| 248 | realtime-2-required | 再打开一个倒计时，用完后把旧的倒计时关闭 | must=board.add_widget | board.add_widget, widget.remove | 0.9 | pass |
| 249 | realtime-2-required | 把计算器和换算器并排放，宽度都调小 | must=widget.move,widget.resize | widget.move, widget.resize | 0.9 | pass |
| 250 | realtime-2-required | 把翻译窗口拖到便签下面，并聚焦翻译输入框 | must=widget.move,widget.focus | widget.move, widget.focus | 0.92 | pass |
| 251 | realtime-2-required | 把待办窗口放大，完成后把便签放到最前 | must=widget.resize,widget.bring_to_front,widget.focus | widget.resize, widget.bring_to_front, widget.focus | 0.9 | pass |
| 252 | realtime-2-required | 关闭天气和新闻，只保留音乐、电视、待办 | must=widget.remove | widget.remove | 0.88 | pass |
| 253 | realtime-2-required | 打开剪贴板后把它固定在屏幕右侧 | must=board.add_widget,widget.move | board.add_widget, widget.move | 0.86 | pass |
| 254 | realtime-2-required | 把表盘时钟调小一点，别挡住音乐封面 | anyOf=widget.move/widget.resize | widget.resize, widget.move | 0.84 | pass |
| 255 | realtime-2-required | 把电视从右上角移到左侧，再打开全屏预览 | must=widget.move,tv.fullscreen,widget.fullscreen_focus | widget.move, tv.fullscreen, widget.fullscreen_focus | 0.9 | pass |
| 256 | realtime-2-required | 关闭所有临时小工具，但保留音乐播放器 | must=widget.remove | widget.remove | 0.72 | pass |
| 257 | realtime-2-required | 把留言板打开，移动到桌面底部居中 | must=widget.move | board.add_widget, widget.move | 0.82 | pass |
| 258 | realtime-2-required | 再开一个天气窗口用于对比北京和上海 | must=weather.set_city | board.add_widget, weather.set_city | 0.83 | pass |
| 259 | realtime-2-required | 把音乐窗口退出全屏，然后调整到宽度 520 | must=app.fullscreen.set,widget.resize | widget.resize | 0.7 | fail: missing=app.fullscreen.set |
| 260 | realtime-2-required | 把所有打开的小工具重新排版，确认后执行 | must=board.auto_align | board.auto_align | 0.88 | pass |
| 261 | realtime-2-required | 播放王菲的红豆，搜到后直接开始播放 | must=music.play | music.search, music.play | 0.92 | pass |
| 262 | realtime-2-required | 我要听陈奕迅的十年，不要继续上一首 | must=music.play | music.play | 0.9 | pass |
| 263 | realtime-2-required | 搜索周杰伦晴天，然后播放第一个完整结果 | must=music.search | music.search, music.play | 0.93 | pass |
| 264 | realtime-2-required | 来一首孙燕姿遇见，如果没找到就先展示搜索结果 | must=music.play | music.search, music.play | 0.9 | pass |
| 265 | realtime-2-required | 播放林俊杰江南，同时把音乐播放器放最前 | must=widget.bring_to_front,widget.focus | music.play, widget.bring_to_front, widget.focus | 0.96 | pass |
| 266 | realtime-2-required | 找张学友吻别，别只放试听片段 | must=music.play | music.play | 0.95 | pass |
| 267 | realtime-2-required | 打开音乐播放器，搜索邓紫棋泡沫并播放 | must=board.add_widget,music.play | board.add_widget, music.search, music.play | 0.97 | pass |
| 268 | realtime-2-required | 给我放五月天倔强，播放后把歌词搜索也打开 | must=music.play | music.play, board.add_widget | 0.71 | pass |
| 269 | realtime-2-required | 播放 Beyond 海阔天空，不要换成同名翻唱 | must=music.play | music.play | 0.9 | pass |
| 270 | realtime-2-required | 搜蔡健雅红色高跟鞋，先暂停当前歌曲再播放 | must=music.pause,music.play | music.pause, music.search, music.play | 0.96 | pass |
| 271 | realtime-2-required | 我想听李宗盛山丘，找到原唱版本 | must=music.play | music.play | 0.9 | pass |
| 272 | realtime-2-required | 播放 Taylor Swift 的 Lover，然后把音量状态记到便签 | must=music.play,note.write | music.play, note.write | 0.75 | pass |
| 273 | realtime-2-required | 来一首 Adele 的 Hello，搜索词就用 Adele Hello | must=music.play | music.play | 0.88 | pass |
| 274 | realtime-2-required | 播放 Coldplay Yellow，别解析成颜色翻译 | must=music.play | music.play | 0.92 | pass |
| 275 | realtime-2-required | 搜王力宏唯一并播放，播放失败就告诉我原因 | must=music.play | music.search, music.play, assistant.runtime_diagnostics | 0.86 | pass |
| 276 | realtime-2-required | 给我放刘若英后来，播放器没有打开就先打开 | must=music.play | board.add_widget, music.play | 0.96 | pass |
| 277 | realtime-2-required | 播放梁静茹勇气，然后把倒计时设为四分钟 | must=music.play,countdown.set | music.play, countdown.set | 0.9 | pass |
| 278 | realtime-2-required | 找陈奕迅孤勇者，播放前确认不是十年 | must=music.play | music.play | 0.82 | pass |
| 279 | realtime-2-required | 我要听王菲容易受伤的女人，按歌曲名搜索 | must=music.search | music.search | 0.86 | pass |
| 280 | realtime-2-required | 播放轻松音乐时重新搜索，不要沿用上一首 | anyOf=music.search/music.play | music.search | 0.9 | pass |
| 281 | realtime-2-required | 我想听点轻松的中文歌，先搜索不要立刻播放 | anyOf=music.search/music.play | music.search | 0.9 | pass |
| 282 | realtime-2-required | 放一点适合写代码的纯音乐，结果要重新搜索 | anyOf=music.search/music.play | music.search | 0.9 | pass |
| 283 | realtime-2-required | 来点不吵的背景音乐，别播刚才那首 | must=music.search | music.search | 0.9 | pass |
| 284 | realtime-2-required | 找适合睡前的歌，播放器放在桌面左下 | must=music.search,widget.move | music.search, widget.move | 0.88 | pass |
| 285 | realtime-2-required | 我想听轻快但不太吵的音乐，先展示列表 | must=music.search | music.search | 0.9 | pass |
| 286 | realtime-2-required | 播放舒缓钢琴，三分钟后提醒我休息眼睛 | must=music.play; anyOf=todo.add_item/countdown.set | music.play, countdown.set, todo.add_item | 0.92 | pass |
| 287 | realtime-2-required | 来点粤语老歌，如果识别不准就交给 realtime | anyOf=music.search/music.play | music.search | 0.84 | pass |
| 288 | realtime-2-required | 刚才不是这首，重新搜陈奕迅的十年 | must=music.search | music.search | 0.9 | pass |
| 289 | realtime-2-required | 不要播放试听版，优先用已登录的音乐账号 | anyOf=music.auth_status/assistant.runtime_diagnostics | music.auth_status | 0.92 | pass |
| 290 | realtime-2-required | 给我找运动时听的歌，并把下一首按钮准备好 | must=music.search | music.search, music.next | 0.9 | pass |
| 291 | realtime-2-required | 换成轻松一点的，不要继续现在的歌曲 | anyOf=music.search/music.play | music.search | 0.95 | pass |
| 292 | realtime-2-required | 搜索雨天适合听的音乐，只要歌曲不要电台 | must=music.search | music.search | 0.9 | pass |
| 293 | realtime-2-required | 找午休背景音乐，播放前把电视暂停 | must=tv.pause; anyOf=music.search/music.play | tv.pause, music.search, music.play | 0.93 | pass |
| 294 | realtime-2-required | 我说的是轻松音乐，不是上一首，重新搜索 | anyOf=music.search/music.play | music.search | 0.96 | pass |
| 295 | realtime-2-required | 给我一首安静的英文歌，先搜完整曲库 | anyOf=music.search/music.play | music.search, music.play | 0.9 | pass |
| 296 | realtime-2-required | 播放适合开车的歌，但音量不要改 | must=music.play | music.play | 0.9 | pass |
| 297 | realtime-2-required | 搜白噪音或自然声，不要打开电视 | must=music.search | music.search | 0.88 | pass |
| 298 | realtime-2-required | 来点周末感觉的歌，如果没把握就让我确认 | anyOf=music.search/music.play | music.search | 0.87 | pass |
| 299 | realtime-2-required | 先暂停当前歌曲，再找轻柔民谣 | must=music.pause,music.search | music.pause, music.search | 0.92 | pass |
| 300 | realtime-2-required | 把音乐换成专注模式用的播放列表 | must=music.play | music.play | 0.93 | pass |
| 301 | realtime-2-required | 打开电视并切到 CCTV5，完成后全屏 | must=board.add_widget,tv.fullscreen; anyOf=tv.play/tv.select_channel | board.add_widget, tv.play, tv.select_channel, tv.fullscreen, widget.fullscreen_focus | 0.96 | pass |
| 302 | realtime-2-required | 播放 CCTV13 新闻频道，然后刷新重大新闻 | must=headline.request_refresh; anyOf=tv.play/tv.select_channel | tv.play, tv.select_channel, headline.request_refresh | 0.92 | pass |
| 303 | realtime-2-required | 电视切到电影频道，但不要关闭音乐 | anyOf=tv.play/tv.select_channel | tv.select_channel | 0.78 | pass |
| 304 | realtime-2-required | 暂停电视直播，继续播放音乐 | must=tv.pause,music.resume | tv.pause, music.resume | 0.93 | pass |
| 305 | realtime-2-required | 把电视从全屏退出来，再切到 CCTV1 | anyOf=tv.play/tv.select_channel | widget.resize, tv.select_channel | 0.9 | pass |
| 306 | realtime-2-required | 我想看体育频道，先打开电视再选 CCTV5 | must=board.add_widget; anyOf=tv.play/tv.select_channel | board.add_widget, tv.play, tv.select_channel | 0.95 | pass |
| 307 | realtime-2-required | 电视全屏后把侧边栏隐藏 | must=app.sidebar.set,tv.fullscreen | tv.fullscreen, widget.fullscreen_focus, app.sidebar.set | 0.9 | pass |
| 308 | realtime-2-required | 打开 CCTV6，同时把电视窗口放到右上角 | must=widget.move; anyOf=tv.play/tv.select_channel | tv.play, tv.select_channel, widget.move | 0.9 | pass |
| 309 | realtime-2-required | 把电视音频先暂停，然后开始录音 | must=tv.pause,recorder.start | tv.pause, recorder.start | 0.97 | pass |
| 310 | realtime-2-required | 切到 CCTV13，如果失败就保留频道选择界面 | anyOf=tv.play/tv.select_channel | tv.select_channel | 0.84 | pass |
| 311 | realtime-2-required | 打开电视，但不要遮住天气卡片 | must=board.add_widget,widget.move | board.add_widget, widget.move | 0.86 | pass |
| 312 | realtime-2-required | 播放 CCTV1 综合频道，再设十分钟倒计时 | must=countdown.set; anyOf=tv.play/tv.select_channel | tv.play, tv.select_channel, countdown.set | 0.93 | pass |
| 313 | realtime-2-required | 帮我看新闻直播，优先 CCTV13 | anyOf=tv.play/tv.select_channel | board.add_widget, tv.select_channel, tv.play | 0.93 | pass |
| 314 | realtime-2-required | 把电视窗口调大一点并置顶 | must=widget.resize,widget.bring_to_front | widget.resize, widget.bring_to_front, widget.focus | 0.92 | pass |
| 315 | realtime-2-required | 关闭电视，同时把音乐继续播放 | must=widget.remove,music.resume; forbid=tv.pause | widget.remove, music.resume | 0.9 | pass |
| 316 | realtime-2-required | 打开电视后不要自动全屏，先让我确认频道 | must=board.add_widget | board.add_widget | 0.86 | pass |
| 317 | realtime-2-required | 把当前电视直播暂停五分钟后提醒我回来 | must=tv.pause; anyOf=todo.add_item/countdown.set | tv.pause, countdown.set, todo.add_item | 0.91 | pass |
| 318 | realtime-2-required | 切换到电影频道并记录到便签 | must=note.write; anyOf=tv.play/tv.select_channel | tv.select_channel, note.write | 0.9 | pass |
| 319 | realtime-2-required | 电视卡住了，重新选择 CCTV1 并播放 | anyOf=tv.play/tv.select_channel | tv.select_channel, tv.play | 0.94 | pass |
| 320 | realtime-2-required | 打开电视小工具，如果没有就新增一个 | must=board.add_widget | board.add_widget | 0.88 | pass |
| 321 | realtime-2-required | 查北京今天会不会下雨，顺便记到便签 | must=weather.set_city,note.write | weather.set_city, note.write | 0.93 | pass |
| 322 | realtime-2-required | 看上海现在天气，如果冷就提醒我带外套 | must=weather.set_city,todo.add_item | weather.set_city, todo.add_item | 0.9 | pass |
| 323 | realtime-2-required | 明早去杭州，帮我看天气并加一条待办 | must=weather.set_city,todo.add_item | weather.set_city, todo.add_item | 0.92 | pass |
| 324 | realtime-2-required | 洛杉矶天气打开看看，再显示本地时间 | must=weather.set_city; anyOf=board.add_widget/worldClock.set_zones | board.add_widget, weather.set_city, worldClock.set_zones | 0.91 | pass |
| 325 | realtime-2-required | 广州天气怎么样，同时刷新空气相关摘要 | must=weather.set_city | weather.set_city, headline.request_refresh | 0.86 | pass |
| 326 | realtime-2-required | 帮我查武汉今天适不适合跑步 | must=weather.set_city | weather.set_city | 0.92 | pass |
| 327 | realtime-2-required | 成都天气卡片放最前，别打开新闻 | must=weather.set_city,widget.bring_to_front,widget.focus; forbid=headline.request_refresh | widget.focus, widget.bring_to_front, weather.set_city | 0.9 | pass |
| 328 | realtime-2-required | 波士顿现在冷不冷，再换算华氏和摄氏 | must=weather.set_city,converter.set | weather.set_city, converter.set | 0.9 | pass |
| 329 | realtime-2-required | 北京和上海天气都打开，我要对比 | must=board.add_widget,weather.set_city | board.add_widget, weather.set_city | 0.94 | pass |
| 330 | realtime-2-required | 我明天出门，先查杭州天气再设早上八点提醒 | must=weather.set_city,todo.add_item | weather.set_city, countdown.set, todo.add_item | 0.91 | pass |
| 331 | realtime-2-required | 查东京天气，同时打开东京世界时钟 | must=weather.set_city,worldClock.set_zones | weather.set_city, board.add_widget, worldClock.set_zones | 0.93 | pass |
| 332 | realtime-2-required | 给我看巴黎天气，顺便显示巴黎时间 | must=weather.set_city; anyOf=board.add_widget/worldClock.set_zones | weather.set_city, worldClock.set_zones | 0.93 | pass |
| 333 | realtime-2-required | 查深圳天气，不要误打开重大新闻 | must=weather.set_city | weather.set_city | 0.93 | pass |
| 334 | realtime-2-required | 外面适合带伞吗，默认看北京 | must=weather.set_city | weather.set_city | 0.92 | pass |
| 335 | realtime-2-required | 帮我把天气城市改成纽约并聚焦天气卡片 | must=weather.set_city,widget.focus | widget.focus, weather.set_city | 0.94 | pass |
| 336 | realtime-2-required | 查广州天气后把结果发到留言板 | must=weather.set_city,messageBoard.send | weather.set_city, messageBoard.send | 0.92 | pass |
| 337 | realtime-2-required | 切换天气到成都，同时打开倒计时十五分钟 | must=weather.set_city,countdown.set | weather.set_city, board.add_widget, countdown.set | 0.92 | pass |
| 338 | realtime-2-required | 今天适合洗车吗，看上海天气 | must=weather.set_city | weather.set_city | 0.9 | pass |
| 339 | realtime-2-required | 查北京体感温度，然后翻译成英文一句话 | must=weather.set_city,translate.set_draft | weather.set_city, translate.set_draft | 0.9 | pass |
| 340 | realtime-2-required | 天气窗口如果没开，先打开再查武汉 | must=board.add_widget,weather.set_city | board.add_widget, weather.set_city | 0.95 | pass |
| 341 | realtime-2-required | 显示北京伦敦纽约时间，并打开表盘时钟 | anyOf=board.add_widget/worldClock.set_zones | worldClock.set_zones, board.add_widget, dialClock.set_night_mode | 0.9 | pass |
| 342 | realtime-2-required | 世界时钟加东京和巴黎，然后切到夜间模式 | must=worldClock.set_zones,dialClock.set_night_mode | worldClock.set_zones, dialClock.set_night_mode | 0.78 | pass |
| 343 | realtime-2-required | 设二十五分钟专注倒计时，同时播放轻音乐 | must=countdown.set,music.play | countdown.set, music.play | 0.88 | pass |
| 344 | realtime-2-required | 倒计时暂停后，便签记一下暂停原因是开会 | anyOf=countdown.pause/note.write | countdown.pause, note.write | 0.92 | pass |
| 345 | realtime-2-required | 继续刚才的倒计时，结束后提醒我喝水 | must=countdown.resume; anyOf=todo.add_item/countdown.set | countdown.resume, todo.add_item | 0.9 | pass |
| 346 | realtime-2-required | 把表盘时钟调成夜间模式，并缩小一点 | must=dialClock.set_night_mode,widget.resize | dialClock.set_night_mode, widget.resize | 0.9 | pass |
| 347 | realtime-2-required | 关闭时钟夜间模式，再显示纽约时间 | must=dialClock.set_night_mode; anyOf=board.add_widget/worldClock.set_zones | dialClock.set_night_mode, worldClock.set_zones | 0.82 | pass |
| 348 | realtime-2-required | 半小时后提醒我检查部署日志 | anyOf=todo.add_item/countdown.set | countdown.set, todo.add_item | 0.93 | pass |
| 349 | realtime-2-required | 设置一分三十秒倒计时，名称叫泡茶 | must=countdown.set | countdown.set | 0.88 | pass |
| 350 | realtime-2-required | 把倒计时重置，然后重新设五分钟 | must=countdown.reset,countdown.set | countdown.reset, countdown.set | 0.86 | pass |
| 351 | realtime-2-required | 显示东京现在几点，同时查东京天气 | must=worldClock.set_zones,weather.set_city | weather.set_city, worldClock.set_zones | 0.9 | pass |
| 352 | realtime-2-required | 明早九点提醒我给客户回电话 | must=todo.add_item | todo.add_item | 0.87 | pass |
| 353 | realtime-2-required | 二十分钟后让我休息，不要打开待办列表 | must=countdown.set | countdown.set, todo.add_item | 0.84 | pass |
| 354 | realtime-2-required | 世界时钟只保留北京和旧金山 | must=worldClock.set_zones | worldClock.set_zones | 0.9 | pass |
| 355 | realtime-2-required | 表盘时钟放到桌面中央，别挡住电视 | anyOf=widget.move/widget.resize | board.add_widget, dialClock.set_night_mode, widget.move | 0.83 | pass |
| 356 | realtime-2-required | 设一个四十五分钟会议倒计时并开始录音 | must=countdown.set,recorder.start | countdown.set, recorder.start | 0.9 | pass |
| 357 | realtime-2-required | 暂停计时器，同时把音乐也暂停 | must=countdown.pause,music.pause | countdown.pause, music.pause | 0.92 | pass |
| 358 | realtime-2-required | 倒计时恢复后把待办窗口放最前 | must=countdown.resume,widget.bring_to_front,widget.focus | countdown.resume, widget.focus, widget.bring_to_front | 0.9 | pass |
| 359 | realtime-2-required | 打开表盘而不是世界时钟 | must=board.add_widget | board.add_widget, dialClock.set_night_mode | 0.9 | pass |
| 360 | realtime-2-required | 我说打开时钟时优先打开表盘时钟 | anyOf=assistant.reply/assistant.runtime_diagnostics; forbid=board.add_widget,widget.remove,music.play,music.search | assistant.runtime_diagnostics | 0.94 | pass |
| 361 | realtime-2-required | 便签记下今天要验证音乐登录和播放完整歌曲 | must=note.write | note.write | 0.98 | pass |
| 362 | realtime-2-required | 把刚才搜索到的王菲红豆追加到便签 | must=note.write | note.write | 0.92 | pass |
| 363 | realtime-2-required | 添加待办：修复 realtime 工具暴露策略 | must=todo.add_item | todo.add_item | 0.97 | pass |
| 364 | realtime-2-required | 明天下午三点提醒我检查 Vercel 日志 | must=todo.add_item | countdown.set, todo.add_item | 0.96 | pass |
| 365 | realtime-2-required | 把买牛奶标记完成，再新增买咖啡豆 | must=todo.complete_item,todo.add_item | todo.complete_item, todo.add_item | 0.97 | pass |
| 366 | realtime-2-required | 清空便签前先弹确认，不要直接删除 | must=note.clear | note.clear | 0.95 | pass |
| 367 | realtime-2-required | 把会议纪要追加到便签并开始录音 | must=note.write,recorder.start | note.write, recorder.start | 0.96 | pass |
| 368 | realtime-2-required | 添加待办订酒店，备注写靠近会场 | must=todo.add_item | todo.add_item | 0.96 | pass |
| 369 | realtime-2-required | 把复盘语音测试设为今天晚上九点提醒 | must=todo.add_item | countdown.set, todo.add_item | 0.96 | pass |
| 370 | realtime-2-required | 便签写下：轻松音乐要重新搜索 | must=note.write | note.write | 0.97 | pass |
| 371 | realtime-2-required | 给待办加一条关闭留言板不能发送关闭两个字 | must=todo.add_item; forbid=messageBoard.send | todo.add_item | 0.97 | pass |
| 372 | realtime-2-required | 把部署完成这项待办勾掉 | must=todo.complete_item | todo.complete_item | 0.97 | pass |
| 373 | realtime-2-required | 五分钟后提醒我看倒计时有没有声音 | anyOf=todo.add_item/countdown.set | countdown.set, todo.add_item | 0.84 | pass |
| 374 | realtime-2-required | 便签新增一段英文 hello realtime，再打开翻译 | must=note.write; anyOf=board.add_widget/translate.set_draft | board.add_widget, note.write, translate.set_draft | 0.83 | pass |
| 375 | realtime-2-required | 把桌面问题列表写入便签，编号从一开始 | must=note.write | note.write | 0.7 | pass |
| 376 | realtime-2-required | 添加待办：测试多轮语音不要重复回复 | must=todo.add_item | todo.add_item | 0.96 | pass |
| 377 | realtime-2-required | 把今天的新闻摘要追加到便签 | must=headline.request_refresh,note.write | headline.request_refresh, note.write | 0.9 | pass |
| 378 | realtime-2-required | 待办里添加查看 Apple Music token | must=todo.add_item | todo.add_item | 0.92 | pass |
| 379 | realtime-2-required | 清理已完成待办前先让我确认 | must=todo.clear_completed | todo.clear_completed | 0.88 | pass |
| 380 | realtime-2-required | 便签保存当前播放歌曲和天气城市 | must=note.write | note.write | 0.74 | pass |
| 381 | realtime-2-required | 把临时验证码 839201 存到剪贴板，不要发留言板 | must=clipboard.add_text | clipboard.add_text | 0.97 | pass |
| 382 | realtime-2-required | 复制演示账号 demo@example.com 到剪贴板并固定 | must=clipboard.add_text | clipboard.add_text | 0.93 | pass |
| 383 | realtime-2-required | 清理普通剪贴板记录，保留固定内容 | must=clipboard.clear | clipboard.clear | 0.95 | pass |
| 384 | realtime-2-required | 把项目口令 demo-token 固定保存到剪贴板 | must=clipboard.add_text | clipboard.add_text | 0.96 | pass |
| 385 | realtime-2-required | 剪贴板添加一条 WiFi 密码提示但不要读出来 | must=clipboard.add_text | clipboard.add_text | 0.92 | pass |
| 386 | realtime-2-required | 把刚才的搜索关键词复制到剪贴板 | must=clipboard.add_text | clipboard.add_text | 0.88 | pass |
| 387 | realtime-2-required | 清空剪贴板前先确认一次 | must=clipboard.clear | clipboard.clear | 0.9 | pass |
| 388 | realtime-2-required | 把会议链接存到剪贴板，并写入便签 | must=clipboard.add_text,note.write | clipboard.add_text, note.write | 0.93 | pass |
| 389 | realtime-2-required | 复制客服回复模板到剪贴板 | must=clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 390 | realtime-2-required | 固定保存 Vercel 项目名 xiaozhuoban | must=clipboard.add_text | clipboard.add_text | 0.91 | pass |
| 391 | realtime-2-required | 剪贴板里新增一条不要上传的本地路径 | must=clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 392 | realtime-2-required | 把 1234 临时验证码存起来，十分钟后提醒删除 | must=clipboard.add_text; anyOf=todo.add_item/countdown.set | clipboard.add_text, countdown.set, todo.add_item | 0.94 | pass |
| 393 | realtime-2-required | 把当前歌曲名复制到剪贴板 | must=clipboard.add_text | clipboard.add_text | 0.89 | pass |
| 394 | realtime-2-required | 清理剪贴板里未固定的测试记录 | must=clipboard.clear | clipboard.clear | 0.9 | pass |
| 395 | realtime-2-required | 把翻译结果复制到剪贴板，但不要覆盖便签 | must=clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 396 | realtime-2-required | 保存命令：打开表盘时钟 到剪贴板 | must=clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 397 | realtime-2-required | 复制今天日期到剪贴板并打开便签 | must=clipboard.add_text,board.add_widget | clipboard.add_text, board.add_widget | 0.88 | pass |
| 398 | realtime-2-required | 剪贴板新增一条部署 id 占位信息 | must=clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 399 | realtime-2-required | 固定保存音乐登录状态检查步骤 | must=clipboard.add_text; forbid=music.auth_status | note.write | 0.86 | fail: missing=clipboard.add_text |
| 400 | realtime-2-required | 清理剪贴板后发一条完成提示 | must=clipboard.clear | clipboard.clear, messageBoard.send | 0.92 | pass |
| 401 | realtime-2-required | 把 hello world 翻译成中文，然后复制结果 | must=translate.set_draft,clipboard.add_text | translate.set_draft, clipboard.add_text | 0.93 | pass |
| 402 | realtime-2-required | 把今天适合出门吗翻译成英文 | must=translate.set_draft | translate.set_draft | 0.9 | pass |
| 403 | realtime-2-required | 计算十二乘十二，再把结果写进便签 | must=calculator.set_display,note.write | calculator.set_display, note.write | 0.92 | pass |
| 404 | realtime-2-required | 2 斤是多少克，同时打开换算器 | anyOf=converter.set/calculator.set_display | board.add_widget, converter.set | 0.94 | pass |
| 405 | realtime-2-required | 三点五公里换算成米 | must=converter.set | converter.set | 0.95 | pass |
| 406 | realtime-2-required | 把 good night realtime 翻译成中文 | must=translate.set_draft | translate.set_draft | 0.95 | pass |
| 407 | realtime-2-required | 计算 199 加 299，然后添加到剪贴板 | must=calculator.set_display,clipboard.add_text | calculator.set_display, clipboard.add_text | 0.93 | pass |
| 408 | realtime-2-required | 五美元大概是多少人民币，先打开换算器等待我确认汇率 | must=board.add_widget | board.add_widget, converter.set | 0.9 | pass |
| 409 | realtime-2-required | 把十平方米换算成平方厘米 | must=converter.set | converter.set | 0.98 | pass |
| 410 | realtime-2-required | 把一小时二十分钟换算成分钟 | must=converter.set | converter.set | 0.98 | pass |
| 411 | realtime-2-required | 翻译：close message board，不要执行关闭命令 | must=translate.set_draft | translate.set_draft | 0.96 | pass |
| 412 | realtime-2-required | 计算十五分钟加二十五分钟是多少 | anyOf=calculator.set_display/converter.set | calculator.set_display | 0.98 | pass |
| 413 | realtime-2-required | 把两公斤半换算成克 | anyOf=converter.set/calculator.set_display | converter.set | 0.98 | pass |
| 414 | realtime-2-required | 把 Fahrenheit 68 转成摄氏度 | must=converter.set | converter.set | 0.98 | pass |
| 415 | realtime-2-required | 把播放轻松音乐翻译成英文 | must=translate.set_draft | translate.set_draft | 0.96 | pass |
| 416 | realtime-2-required | 计算 1024 除以 8，并显示在计算器 | must=calculator.set_display | calculator.set_display | 0.99 | pass |
| 417 | realtime-2-required | 把十二米换成公里再写到便签 | must=note.write; anyOf=converter.set/calculator.set_display | converter.set, note.write | 0.97 | pass |
| 418 | realtime-2-required | 翻译一段：the music is still preview mode | must=translate.set_draft | translate.set_draft | 0.96 | pass |
| 419 | realtime-2-required | 把 0.9 以下交给 realtime 翻译成英文备忘 | must=translate.set_draft,note.write | translate.set_draft, note.write | 0.96 | pass |
| 420 | realtime-2-required | 计算部署失败次数三加五再乘二 | must=calculator.set_display | calculator.set_display | 0.98 | pass |
| 421 | realtime-2-required | 刷新重大新闻，然后打开美股三大指数 | must=headline.request_refresh,market.set_indices | headline.request_refresh, board.add_widget, market.set_indices | 0.93 | pass |
| 422 | realtime-2-required | 看纳指和道指，顺便刷新财经新闻 | must=market.set_indices,headline.request_refresh | market.set_indices, headline.request_refresh | 0.92 | pass |
| 423 | realtime-2-required | 打开恒生和上证行情，不要自动开全球指数 | must=board.add_widget,market.set_indices | board.add_widget, market.set_indices | 0.9 | pass |
| 424 | realtime-2-required | 今天有什么头条新闻，结果追加到便签 | must=headline.request_refresh,note.write | headline.request_refresh, note.write | 0.94 | pass |
| 425 | realtime-2-required | 看美股三大指数，同时显示纽约时间 | must=market.set_indices; anyOf=board.add_widget/worldClock.set_zones | board.add_widget, market.set_indices, worldClock.set_zones | 0.91 | pass |
| 426 | realtime-2-required | 只刷新新闻，不要打开行情窗口 | must=headline.request_refresh | headline.request_refresh | 0.97 | pass |
| 427 | realtime-2-required | 把新闻窗口放到右侧，行情放到左侧 | must=widget.move | widget.move | 0.9 | pass |
| 428 | realtime-2-required | 查询上证指数后把市场窗口置顶 | must=market.set_indices,widget.bring_to_front | market.set_indices, widget.bring_to_front, widget.focus | 0.93 | pass |
| 429 | realtime-2-required | 打开财经观察桌板并刷新重大新闻 | must=board.switch,headline.request_refresh | board.switch, headline.request_refresh | 0.92 | pass |
| 430 | realtime-2-required | 看恒生指数，如果没有行情工具就打开命令面板 | must=market.set_indices,app.command_palette.open | market.set_indices, app.command_palette.open | 0.86 | pass |
| 431 | realtime-2-required | 刷新新闻后发一句摘要到留言板 | must=headline.request_refresh,messageBoard.send | headline.request_refresh, messageBoard.send | 0.94 | pass |
| 432 | realtime-2-required | 全球指数不要刷新，先关闭那个小工具 | must=widget.remove | widget.remove | 0.9 | pass |
| 433 | realtime-2-required | 打开重大新闻但不要播放电视 | must=board.add_widget,headline.request_refresh | board.add_widget, headline.request_refresh | 0.96 | pass |
| 434 | realtime-2-required | 行情窗口太大了，缩小后显示纳指 | must=widget.resize,market.set_indices | widget.resize, market.set_indices | 0.94 | pass |
| 435 | realtime-2-required | 把新闻和天气并排放，我要看今天情况 | must=widget.move,weather.set_city,headline.request_refresh | headline.request_refresh, weather.set_city, widget.move | 0.9 | pass |
| 436 | realtime-2-required | 刷新头条后提醒我十五分钟后再看 | must=headline.request_refresh; anyOf=todo.add_item/countdown.set | headline.request_refresh, countdown.set, todo.add_item | 0.92 | pass |
| 437 | realtime-2-required | 打开上证和深证行情，别误开音乐 | must=board.add_widget,market.set_indices | board.add_widget, market.set_indices | 0.95 | pass |
| 438 | realtime-2-required | 只显示美股指数，关闭港股窗口 | must=market.set_indices,widget.remove | market.set_indices, widget.remove | 0.9 | pass |
| 439 | realtime-2-required | 新闻刷新失败就记录到便签 | must=headline.request_refresh,note.write | headline.request_refresh, note.write | 0.88 | pass |
| 440 | realtime-2-required | 打开重大新闻小工具后马上聚焦它 | must=board.add_widget,headline.request_refresh,widget.focus | board.add_widget, headline.request_refresh, widget.focus | 0.94 | pass |
| 441 | realtime-2-required | 开始录音，并在便签写下会议开始 | must=recorder.start,note.write | recorder.start, note.write | 0.96 | pass |
| 442 | realtime-2-required | 停止录音后播放刚才录音检查声音 | must=recorder.stop,recorder.play | recorder.stop, recorder.play | 0.97 | pass |
| 443 | realtime-2-required | 暂停录音回放，同时把电视也暂停 | must=recorder.pause,tv.pause | recorder.pause, tv.pause | 0.95 | pass |
| 444 | realtime-2-required | 开始录一段测试音频，十秒后提醒我停止 | must=recorder.start; anyOf=todo.add_item/countdown.set | recorder.start, countdown.set, todo.add_item | 0.93 | pass |
| 445 | realtime-2-required | 打开录音机但先不要开始录 | must=board.add_widget | board.add_widget | 0.96 | pass |
| 446 | realtime-2-required | 会议开始，打开录音机、便签和倒计时 | must=board.add_widget | board.add_widget | 0.94 | pass |
| 447 | realtime-2-required | 停止录音并把文件状态写到留言板 | must=recorder.stop,messageBoard.send | recorder.stop, messageBoard.send | 0.95 | pass |
| 448 | realtime-2-required | 播放刚才录音，如果没有录音就告诉我 | must=recorder.play | recorder.play, assistant.reply | 0.9 | pass |
| 449 | realtime-2-required | 录音机放到音乐旁边，避免遮住封面 | must=widget.move | widget.move | 0.9 | pass |
| 450 | realtime-2-required | 开始录音后把表盘时钟调成夜间模式 | must=recorder.start,dialClock.set_night_mode | recorder.start, dialClock.set_night_mode | 0.92 | pass |
| 451 | realtime-2-required | 暂停录音播放，再继续音乐 | must=recorder.pause,music.resume | recorder.pause, music.resume | 0.93 | pass |
| 452 | realtime-2-required | 帮我录一段语音命令复现过程 | must=recorder.start | recorder.start | 0.88 | pass |
| 453 | realtime-2-required | 停止录音并打开剪贴板保存测试编号 | must=recorder.stop,clipboard.add_text | recorder.stop, board.add_widget, clipboard.add_text | 0.93 | pass |
| 454 | realtime-2-required | 录音之前先关闭电视声音 | must=tv.pause,recorder.start; forbid=tv.pause | tv.pause, recorder.start | 0.94 | fail: forbidden=tv.pause |
| 455 | realtime-2-required | 开始录音，然后三分钟倒计时 | must=recorder.start,countdown.set | recorder.start, countdown.set | 0.95 | pass |
| 456 | realtime-2-required | 播放录音时把音乐暂停 | must=recorder.play,music.pause | recorder.play, music.pause | 0.94 | pass |
| 457 | realtime-2-required | 打开录音机，窗口放到左上角 | must=board.add_widget,widget.move | board.add_widget, widget.move | 0.95 | pass |
| 458 | realtime-2-required | 如果录音还在进行就先停止再播放 | must=recorder.stop,recorder.play | recorder.stop, recorder.play | 0.92 | pass |
| 459 | realtime-2-required | 会议结束，停止录音并追加纪要到便签 | must=recorder.stop,note.write | recorder.stop, note.write | 0.93 | pass |
| 460 | realtime-2-required | 录音回放暂停后聚焦待办窗口 | must=recorder.pause,widget.focus | recorder.pause, widget.focus | 0.9 | pass |
| 461 | realtime-2-required | 关闭留言板，不要把关闭两个字发出去 | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.97 | pass |
| 462 | realtime-2-required | 留言板发送：我在测试多轮语音 | must=messageBoard.send | messageBoard.send | 0.96 | pass |
| 463 | realtime-2-required | 把留言板收起来，同时保留便签 | must=widget.remove | widget.remove | 0.9 | pass |
| 464 | realtime-2-required | 打开留言板并发送收到，不要关闭窗口 | must=board.add_widget,messageBoard.send | board.add_widget, messageBoard.send | 0.95 | pass |
| 465 | realtime-2-required | 留言板回复：部署完成后再测一次 | must=messageBoard.send | messageBoard.send | 0.95 | pass |
| 466 | realtime-2-required | 我说关闭留言板时执行关闭，不是发送消息 | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.88 | pass |
| 467 | realtime-2-required | 把天气摘要发到留言板 | must=weather.set_city,messageBoard.send | weather.set_city, messageBoard.send | 0.9 | pass |
| 468 | realtime-2-required | 留言板发一句：音乐已经重新搜索 | must=messageBoard.send | messageBoard.send | 0.96 | pass |
| 469 | realtime-2-required | 先清空输入框，再发送测试通过 | must=messageBoard.send | messageBoard.clear_draft, messageBoard.send | 0.98 | pass |
| 470 | realtime-2-required | 关闭留言板后打开待办 | must=widget.remove,board.add_widget; forbid=messageBoard.send | widget.remove, board.add_widget | 0.96 | pass |
| 471 | realtime-2-required | 留言板不要重复发送刚才那句话 | anyOf=assistant.reply/assistant.runtime_diagnostics | assistant.reply | 0.78 | pass |
| 472 | realtime-2-required | 发送一条包含英文 realtime ready 的留言 | must=messageBoard.send | messageBoard.send | 0.99 | pass |
| 473 | realtime-2-required | 把留言板移到底部，然后发送正在测试 | must=widget.move,messageBoard.send | widget.move, messageBoard.send | 0.97 | pass |
| 474 | realtime-2-required | 如果留言板没打开，先打开再发收到 | must=board.add_widget,messageBoard.send | board.add_widget, messageBoard.send | 0.96 | pass |
| 475 | realtime-2-required | 不要发消息，只把留言板窗口置顶 | must=widget.bring_to_front | widget.bring_to_front, widget.focus | 0.97 | pass |
| 476 | realtime-2-required | 留言板发送：十分钟后回来 | must=messageBoard.send | messageBoard.send | 0.99 | pass |
| 477 | realtime-2-required | 关闭留言板和新闻窗口 | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.95 | pass |
| 478 | realtime-2-required | 把关闭留言板这个命令写到便签，不要执行 | must=note.write; forbid=messageBoard.send | note.write | 0.98 | pass |
| 479 | realtime-2-required | 发送消息前先确认内容是我在测试 | must=messageBoard.send | messageBoard.send | 0.94 | pass |
| 480 | realtime-2-required | 留言板窗口太碍事了，直接收起来 | must=widget.remove | widget.remove | 0.99 | pass |
| 481 | realtime-2-required | 播放陈奕迅十年，同时查上海天气并写到便签 | must=music.play,weather.set_city,note.write | music.play, weather.set_city, note.write | 0.9 | pass |
| 482 | realtime-2-required | 打开电视 CCTV13，再刷新新闻，最后暂停音乐 | must=board.add_widget,headline.request_refresh,music.pause; anyOf=tv.play/tv.select_channel | board.add_widget, tv.select_channel, headline.request_refresh, music.pause | 0.92 | pass |
| 483 | realtime-2-required | 查北京天气，如果适合出门就加待办买咖啡 | must=weather.set_city,todo.add_item | weather.set_city, todo.add_item | 0.88 | pass |
| 484 | realtime-2-required | 打开市场行情、重大新闻和纽约时间，排成一列 | must=board.add_widget,market.set_indices,headline.request_refresh,worldClock.set_zones,widget.move | board.add_widget, market.set_indices, headline.request_refresh, worldClock.set_zones, widget.move | 0.9 | pass |
| 485 | realtime-2-required | 开始录音，设四十五分钟倒计时，并打开会议便签 | must=recorder.start,countdown.set,board.add_widget | recorder.start, countdown.set, board.add_widget, note.write | 0.9 | pass |
| 486 | realtime-2-required | 搜索轻松音乐但先不播放，然后打开待办 | must=board.add_widget,music.search | music.search, board.add_widget | 0.9 | pass |
| 487 | realtime-2-required | 把 hello world 翻译成中文，再复制到剪贴板 | must=translate.set_draft,clipboard.add_text | translate.set_draft, clipboard.add_text | 0.95 | pass |
| 488 | realtime-2-required | 新建旅行桌板，打开杭州天气和东京时间 | must=board.create,board.add_widget,weather.set_city,worldClock.set_zones | board.create, board.add_widget, weather.set_city, worldClock.set_zones | 0.9 | pass |
| 489 | realtime-2-required | 关闭留言板，再把音乐播放器放最前 | must=widget.remove,widget.bring_to_front; forbid=messageBoard.send | widget.remove, widget.bring_to_front, widget.focus | 0.93 | pass |
| 490 | realtime-2-required | 播放王菲红豆后，三分钟后提醒我检查是否试听 | must=music.play; anyOf=todo.add_item/countdown.set | music.play, countdown.set, todo.add_item | 0.9 | pass |
| 491 | realtime-2-required | 打开表盘时钟而不是世界时钟，然后隐藏侧栏 | must=board.add_widget,app.sidebar.set | board.add_widget, dialClock.set_night_mode, app.sidebar.set | 0.92 | pass |
| 492 | realtime-2-required | 把电视切到 CCTV5，再把体育新闻刷新一下 | must=headline.request_refresh; anyOf=tv.play/tv.select_channel | tv.select_channel, headline.request_refresh | 0.86 | pass |
| 493 | realtime-2-required | 清理剪贴板普通记录，再把项目口令固定 | must=clipboard.clear,clipboard.add_text | clipboard.clear | 0.76 | fail: missing=clipboard.add_text |
| 494 | realtime-2-required | 添加待办提交报告，同时明早九点提醒 | must=todo.add_item | todo.add_item, countdown.set | 0.78 | pass |
| 495 | realtime-2-required | 计算两公斤是多少克，把结果发到留言板 | must=messageBoard.send; anyOf=converter.set/calculator.set_display | calculator.set_display, messageBoard.send | 0.74 | pass |
| 496 | realtime-2-required | 天气改成武汉，世界时钟改成北京伦敦纽约 | must=weather.set_city,worldClock.set_zones | weather.set_city, worldClock.set_zones | 0.88 | pass |
| 497 | realtime-2-required | 把音乐暂停，开始录音，然后打开倒计时 | must=music.pause,recorder.start,board.add_widget | music.pause, recorder.start, board.add_widget | 0.8 | pass |
| 498 | realtime-2-required | 新建学习桌板并打开翻译、计算器、便签 | must=board.create; anyOf=board.add_widget/translate.set_draft | board.create, board.switch, board.add_widget | 0.82 | pass |
| 499 | realtime-2-required | 刷新新闻后把摘要追加到便签并复制 | must=headline.request_refresh,note.write,clipboard.add_text | headline.request_refresh, note.write, clipboard.add_text | 0.77 | pass |
| 500 | realtime-2-required | 退出全屏，显示侧边栏，再整理桌面 | must=app.fullscreen.set,app.sidebar.set,board.auto_align | app.fullscreen.set, app.sidebar.set, board.auto_align | 0.83 | pass |
| 501 | realtime-2-required | 打开时钟，啊不是世界时钟，是那个表盘时钟 | must=board.add_widget | board.add_widget, dialClock.set_night_mode | 0.86 | pass |
| 502 | realtime-2-required | 播放十年，不对，是陈奕迅的十年 | must=music.play | music.play | 0.9 | pass |
| 503 | realtime-2-required | 关闭留言，准确说关闭留言板窗口 | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.92 | pass |
| 504 | realtime-2-required | 我想听轻松音乐，别继续上一首，重新搜 | anyOf=music.search/music.play | music.search | 0.91 | pass |
| 505 | realtime-2-required | 打开天气，城市先用北京，刚才说错了不是上海 | must=board.add_widget,weather.set_city | board.add_widget, weather.set_city | 0.96 | pass |
| 506 | realtime-2-required | 把电视全屏，等下先别全屏，先切 CCTV5 | anyOf=tv.play/tv.select_channel | tv.select_channel, tv.fullscreen, widget.fullscreen_focus | 0.95 | pass |
| 507 | realtime-2-required | 添加待办买票，哦再加一条订酒店 | must=todo.add_item | todo.add_item | 0.94 | pass |
| 508 | realtime-2-required | 翻译 close message board，只翻译不要执行 | must=translate.set_draft; forbid=widget.remove | translate.set_draft | 0.92 | pass |
| 509 | realtime-2-required | 搜索王菲红豆，如果识别成王飞请改成王菲 | must=music.search | music.search | 0.93 | pass |
| 510 | realtime-2-required | 打开表盘时钟，别打开全球时钟列表 | must=board.add_widget | board.add_widget, dialClock.set_night_mode | 0.95 | pass |
| 511 | realtime-2-required | 我刚说关闭，其实是关闭留言板 | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.96 | pass |
| 512 | realtime-2-required | 音乐上一首不是我要的，重新搜周杰伦晴天 | anyOf=music.search/music.play | music.search | 0.94 | pass |
| 513 | realtime-2-required | 把天气改成杭州，不是广州 | must=weather.set_city | weather.set_city | 0.96 | pass |
| 514 | realtime-2-required | 我要整理桌面，记得需要弹确认 | must=board.auto_align | board.auto_align | 0.95 | pass |
| 515 | realtime-2-required | 录音先暂停，不对，是暂停回放 | must=recorder.pause | recorder.pause | 0.96 | pass |
| 516 | realtime-2-required | 新闻别打开全球指数，只要重大新闻 | must=headline.request_refresh; forbid=market.set_indices | headline.request_refresh | 0.95 | pass |
| 517 | realtime-2-required | 把计算器放大，算了先聚焦就行 | must=widget.focus | widget.focus | 0.96 | pass |
| 518 | realtime-2-required | 播放 CCTV1，不是 CCTV13 | anyOf=tv.play/tv.select_channel | tv.select_channel, tv.play | 0.97 | pass |
| 519 | realtime-2-required | 写到便签：关闭留言板，不要真的关闭 | must=note.write; forbid=messageBoard.send,widget.remove | note.write | 0.98 | pass |
| 520 | realtime-2-required | 如果你没把握，交给 realtime 解析 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.94 | pass |
| 521 | realtime-2-required | 清空便签内容，但必须先问我确认 | must=note.clear | note.clear | 0.98 | pass |
| 522 | realtime-2-required | 整理桌面所有小工具，等我确认后再执行 | must=board.auto_align | board.auto_align | 0.98 | pass |
| 523 | realtime-2-required | 清理剪贴板普通记录，不要删固定项 | must=clipboard.clear | clipboard.clear | 0.97 | pass |
| 524 | realtime-2-required | 关闭音乐和电视之前先确认一次 | must=widget.remove | widget.remove | 0.93 | pass |
| 525 | realtime-2-required | 删除临时倒计时，保留正在运行的那个 | must=widget.remove | widget.remove | 0.96 | pass |
| 526 | realtime-2-required | 清空待办已完成项，需要弹确认 | must=todo.clear_completed | todo.clear_completed | 0.98 | pass |
| 527 | realtime-2-required | 关闭全部新闻和行情窗口，确认后执行 | must=widget.remove | widget.remove | 0.92 | pass |
| 528 | realtime-2-required | 把留言板收起来但不要删除历史消息 | must=widget.remove | widget.remove | 0.95 | pass |
| 529 | realtime-2-required | 重置倒计时前先告诉我当前状态 | anyOf=assistant.reply/assistant.runtime_diagnostics | assistant.runtime_diagnostics, countdown.reset | 0.78 | pass |
| 530 | realtime-2-required | 清空搜索结果不要影响播放中的歌曲 | anyOf=assistant.reply/assistant.runtime_diagnostics; forbid=music.search,music.play,music.previous,music.next | assistant.runtime_diagnostics | 0.52 | pass |
| 531 | realtime-2-required | 关闭所有临时小工具，保留桌板 | must=widget.remove | widget.remove | 0.7 | pass |
| 532 | realtime-2-required | 把便签清空并写新内容，先确认清空 | must=note.clear,note.write | note.clear, note.write | 0.9 | pass |
| 533 | realtime-2-required | 清理剪贴板时保留 pinned 内容 | must=clipboard.clear | clipboard.clear | 0.85 | pass |
| 534 | realtime-2-required | 撤销刚才的关闭动作，如果不能撤销就提示 | anyOf=assistant.reply/assistant.runtime_diagnostics | assistant.reply | 0.44 | pass |
| 535 | realtime-2-required | 自动整理桌面后不要改变全屏状态 | must=board.auto_align | board.auto_align | 0.83 | pass |
| 536 | realtime-2-required | 关闭电视直播，但不要清除频道选择 | must=tv.pause; forbid=tv.pause | tv.pause | 0.88 | fail: forbidden=tv.pause |
| 537 | realtime-2-required | 停止录音前确认当前是否正在录 | anyOf=assistant.reply/assistant.runtime_diagnostics | assistant.runtime_diagnostics, recorder.stop | 0.76 | pass |
| 538 | realtime-2-required | 删除临时桌板之前先让我确认 | must=board.delete | board.delete | 0.84 | pass |
| 539 | realtime-2-required | 清除留言板输入框，不要发送空消息 | must=messageBoard.clear_draft | messageBoard.clear_draft | 0.95 | pass |
| 540 | realtime-2-required | 关闭全部媒体小工具前先弹统一确认 | must=widget.remove | widget.remove | 0.72 | pass |
| 541 | realtime-2-required | 把表盘时钟调暗一点，进入夜间模式 | must=dialClock.set_night_mode | dialClock.set_night_mode | 0.98 | pass |
| 542 | realtime-2-required | 音乐封面太小了，把播放器面板放大 | must=widget.resize | widget.resize | 0.9 | pass |
| 543 | realtime-2-required | 电视窗口太挡眼，缩小并放到右上角 | must=widget.resize,widget.move | widget.resize, widget.move | 0.96 | pass |
| 544 | realtime-2-required | 隐藏侧栏让桌面更宽，但保留所有小工具 | must=app.sidebar.set | app.sidebar.set | 0.94 | pass |
| 545 | realtime-2-required | 把音乐播放控件居中，登录按钮别挡封面 | must=widget.move | widget.move | 0.86 | pass |
| 546 | realtime-2-required | 倒计时声音太像计时器，先暂停倒计时 | must=countdown.pause | countdown.pause | 0.98 | pass |
| 547 | realtime-2-required | 把天气卡片放大一点方便读温度 | must=widget.resize | widget.resize | 0.92 | pass |
| 548 | realtime-2-required | 把新闻窗口缩小，避免挡住便签 | anyOf=widget.move/widget.resize | widget.resize, widget.move | 0.95 | pass |
| 549 | realtime-2-required | 音乐窗口不要全屏，只把封面放大 | must=widget.resize | widget.resize | 0.84 | pass |
| 550 | realtime-2-required | 把表盘放到中间并打开夜间模式 | must=widget.move,dialClock.set_night_mode | widget.move, dialClock.set_night_mode | 0.97 | pass |
| 551 | realtime-2-required | 电视全屏时隐藏侧边栏 | anyOf=tv.fullscreen/app.sidebar.set | tv.fullscreen, widget.fullscreen_focus, app.sidebar.set | 0.96 | pass |
| 552 | realtime-2-required | 把世界时钟文字放大，显示北京伦敦纽约 | must=widget.resize,worldClock.set_zones | worldClock.set_zones, widget.resize | 0.93 | pass |
| 553 | realtime-2-required | 让待办窗口宽一点，长文本不要折断 | must=widget.resize | widget.resize | 0.96 | pass |
| 554 | realtime-2-required | 把剪贴板窗口移到右侧并缩窄 | must=widget.move,widget.resize | widget.move, widget.resize | 0.96 | pass |
| 555 | realtime-2-required | 显示侧边栏，但不要压缩音乐封面 | must=app.sidebar.set | app.sidebar.set | 0.92 | pass |
| 556 | realtime-2-required | 退出全屏后把音乐播放器恢复正常大小 | must=app.fullscreen.set,widget.resize | app.fullscreen.set, widget.resize | 0.94 | pass |
| 557 | realtime-2-required | 让录音机窗口别盖住倒计时 | must=widget.move | widget.move | 0.95 | pass |
| 558 | realtime-2-required | 把翻译窗口调宽，方便输入长英文 | must=widget.resize | widget.resize | 0.96 | pass |
| 559 | realtime-2-required | 把桌面布局排紧凑一点 | must=board.auto_align | board.auto_align | 0.95 | pass |
| 560 | realtime-2-required | 音乐登录按钮放右上角但不要覆盖封面 | anyOf=widget.move/widget.resize | widget.move | 0.9 | pass |
| 561 | realtime-2-required | 新建今日计划桌板，打开待办、便签和天气 | must=board.create,board.add_widget,weather.set_city | board.create, board.add_widget, weather.set_city | 0.93 | pass |
| 562 | realtime-2-required | 写下今天三件事：部署、测试、复盘 | must=note.write | note.write | 0.97 | pass |
| 563 | realtime-2-required | 设二十五分钟专注倒计时并播放轻音乐 | must=countdown.set,music.play | countdown.set, music.play | 0.97 | pass |
| 564 | realtime-2-required | 把九点开会添加到待办并开始录音准备 | must=todo.add_item,recorder.start | todo.add_item, recorder.start | 0.94 | pass |
| 565 | realtime-2-required | 刷新新闻后只把重要事项写到便签 | must=headline.request_refresh,note.write | headline.request_refresh, note.write | 0.9 | pass |
| 566 | realtime-2-required | 把复盘 realtime 断线问题加入待办 | must=todo.add_item | todo.add_item | 0.92 | pass |
| 567 | realtime-2-required | 十五分钟后提醒我查看监控脚本日志 | anyOf=todo.add_item/countdown.set | countdown.set, todo.add_item | 0.9 | pass |
| 568 | realtime-2-required | 打开项目冲刺桌板并整理窗口 | must=board.switch,board.auto_align | board.switch, board.auto_align | 0.9 | pass |
| 569 | realtime-2-required | 把部署 id 复制到剪贴板并固定 | must=clipboard.add_text | clipboard.add_text | 0.88 | pass |
| 570 | realtime-2-required | 查上海天气决定下午是否出门 | must=weather.set_city | weather.set_city | 0.93 | pass |
| 571 | realtime-2-required | 打开计算器算今天还有多少分钟到六点 | anyOf=board.add_widget/calculator.set_display | board.add_widget, calculator.set_display | 0.9 | pass |
| 572 | realtime-2-required | 把会议纪要追加到便签，然后标记待办完成 | must=note.write,todo.complete_item | note.write, todo.complete_item | 0.9 | pass |
| 573 | realtime-2-required | 新建一条待办：验证语音打开小工具 | must=todo.add_item | todo.add_item | 0.94 | pass |
| 574 | realtime-2-required | 开始录音记录今天的问题列表 | must=recorder.start | recorder.start | 0.92 | pass |
| 575 | realtime-2-required | 关闭电视，保留音乐和倒计时 | must=widget.remove; forbid=tv.pause | widget.remove | 0.9 | pass |
| 576 | realtime-2-required | 打开工作台并把音乐播放器放到最前 | must=board.switch,widget.bring_to_front | board.switch, widget.focus, widget.bring_to_front | 0.86 | pass |
| 577 | realtime-2-required | 明早八点提醒我继续回归测试 | must=todo.add_item | countdown.set, todo.add_item | 0.9 | pass |
| 578 | realtime-2-required | 把轻松音乐播放失败写入便签 | must=note.write | note.write | 0.92 | pass |
| 579 | realtime-2-required | 添加待办：检查 Apple Music 是否试听 | must=todo.add_item | todo.add_item | 0.95 | pass |
| 580 | realtime-2-required | 整理桌面后聚焦待办窗口 | must=board.auto_align,widget.focus | board.auto_align, widget.focus | 0.86 | pass |
| 581 | realtime-2-required | 打开学习桌板，启动翻译和便签 | must=board.switch; anyOf=board.add_widget/translate.set_draft | board.switch, board.add_widget | 0.9 | pass |
| 582 | realtime-2-required | 把 good morning 翻译成中文并写入便签 | must=note.write,translate.set_draft | translate.set_draft, note.write | 0.93 | pass |
| 583 | realtime-2-required | 播放英语听力背景音乐，先搜索不播放 | anyOf=music.search/music.play | music.search | 0.94 | pass |
| 584 | realtime-2-required | 设三十分钟学习倒计时 | must=countdown.set | countdown.set | 0.96 | pass |
| 585 | realtime-2-required | 把单词 realtime 写到便签并翻译 | must=note.write,translate.set_draft | note.write, translate.set_draft | 0.9 | pass |
| 586 | realtime-2-required | 计算今天学习时间二十五加五十分钟 | must=calculator.set_display | calculator.set_display | 0.97 | pass |
| 587 | realtime-2-required | 查东京时间安排外教课 | must=worldClock.set_zones | worldClock.set_zones | 0.9 | pass |
| 588 | realtime-2-required | 把 close sidebar 翻译成中文，不要执行命令 | must=translate.set_draft | translate.set_draft | 0.98 | pass |
| 589 | realtime-2-required | 播放轻柔钢琴帮助阅读 | must=music.play | music.play | 0.93 | pass |
| 590 | realtime-2-required | 新增待办：背二十个单词 | must=todo.add_item | todo.add_item | 0.96 | pass |
| 591 | realtime-2-required | 把 hello world 翻译成英文解释一下 | must=translate.set_draft | translate.set_draft | 0.9 | pass |
| 592 | realtime-2-required | 打开录音机录一段口语练习 | must=board.add_widget,recorder.start | board.add_widget, recorder.start | 0.97 | pass |
| 593 | realtime-2-required | 停止录音后播放检查发音 | must=recorder.stop | recorder.stop, recorder.play | 0.98 | pass |
| 594 | realtime-2-required | 把巴黎时间和北京时间都显示出来 | must=worldClock.set_zones | board.add_widget, worldClock.set_zones | 0.97 | pass |
| 595 | realtime-2-required | 翻译这句：music is still in preview mode | must=translate.set_draft | translate.set_draft | 0.98 | pass |
| 596 | realtime-2-required | 便签记下今天学到的三个命令 | must=note.write | board.add_widget, note.write | 0.96 | pass |
| 597 | realtime-2-required | 设置十五分钟休息提醒 | must=todo.add_item | countdown.set, todo.add_item | 0.97 | pass |
| 598 | realtime-2-required | 打开计算器算 60 除以 5 | anyOf=board.add_widget/calculator.set_display | board.add_widget, calculator.set_display | 0.99 | pass |
| 599 | realtime-2-required | 把学习桌板自动整理一下 | must=board.auto_align | board.auto_align | 0.95 | pass |
| 600 | realtime-2-required | 关闭新闻，避免学习时分心 | must=widget.remove | widget.remove | 0.94 | pass |
| 601 | realtime-2-required | 新建旅行桌板，打开杭州天气和待办 | must=board.create,board.add_widget,weather.set_city | board.create, board.add_widget, weather.set_city | 0.86 | pass |
| 602 | realtime-2-required | 明早七点提醒我带身份证和充电器 | must=todo.add_item | countdown.set, todo.add_item | 0.83 | pass |
| 603 | realtime-2-required | 查北京到上海出行前天气，写到便签 | must=weather.set_city,note.write | weather.set_city, note.write | 0.78 | pass |
| 604 | realtime-2-required | 添加待办订酒店和买高铁票 | must=todo.add_item | todo.add_item | 0.92 | pass |
| 605 | realtime-2-required | 显示东京、巴黎和纽约时间 | anyOf=board.add_widget/worldClock.set_zones | worldClock.set_zones | 0.97 | pass |
| 606 | realtime-2-required | 播放轻松音乐，一边整理旅行清单 | must=music.play | music.play, todo.add_item | 0.74 | pass |
| 607 | realtime-2-required | 把 2 公斤行李换算成克 | anyOf=converter.set/calculator.set_display | converter.set | 0.99 | pass |
| 608 | realtime-2-required | 查广州天气决定带不带伞 | must=weather.set_city | weather.set_city | 0.95 | pass |
| 609 | realtime-2-required | 把航班号 CA1234 存到剪贴板 | must=clipboard.add_text | clipboard.add_text | 0.98 | pass |
| 610 | realtime-2-required | 打开世界时钟并放到旅行桌板右侧 | must=widget.move; anyOf=board.add_widget/worldClock.set_zones | board.add_widget, worldClock.set_zones, widget.move | 0.84 | pass |
| 611 | realtime-2-required | 明天下午三点提醒我办理入住 | must=todo.add_item | countdown.set, todo.add_item | 0.83 | pass |
| 612 | realtime-2-required | 翻译 hotel reservation 成中文 | must=translate.set_draft | translate.set_draft | 0.99 | pass |
| 613 | realtime-2-required | 查洛杉矶天气并显示当地时间 | must=weather.set_city; anyOf=board.add_widget/worldClock.set_zones | weather.set_city, worldClock.set_zones | 0.93 | pass |
| 614 | realtime-2-required | 添加待办：打印行程单 | must=todo.add_item | todo.add_item | 0.98 | pass |
| 615 | realtime-2-required | 把旅行预算 1999 加 299 算一下 | must=calculator.set_display | calculator.set_display | 0.97 | pass |
| 616 | realtime-2-required | 关闭电视，打开音乐和天气 | must=widget.remove; anyOf=board.add_widget/weather.set_city; forbid=tv.pause | widget.remove, board.add_widget, music.play, weather.set_city | 0.86 | pass |
| 617 | realtime-2-required | 留言板发一句：我在准备出门 | must=messageBoard.send | messageBoard.send | 0.99 | pass |
| 618 | realtime-2-required | 新建便签写旅行物品清单 | must=note.write | board.add_widget, note.write | 0.96 | pass |
| 619 | realtime-2-required | 三十分钟后提醒我出门 | anyOf=todo.add_item/countdown.set | countdown.set, todo.add_item | 0.97 | pass |
| 620 | realtime-2-required | 整理旅行桌板的小工具位置 | must=board.auto_align | board.switch, board.auto_align | 0.9 | pass |
| 621 | realtime-2-required | 打开音乐播放器，如果工具没加载就先加载音乐模块 | must=board.add_widget | assistant.runtime_diagnostics, board.add_widget | 0.88 | pass |
| 622 | realtime-2-required | 我要找天气工具，先打开命令面板再聚焦天气 | must=app.command_palette.open,widget.focus,weather.set_city | app.command_palette.open, widget.focus, weather.set_city | 0.9 | pass |
| 623 | realtime-2-required | 播放轻松音乐前只加载音乐相关工具，不要全量发送 | must=music.play | assistant.runtime_diagnostics, board.add_widget, music.search | 0.9 | fail: missing=music.play |
| 624 | realtime-2-required | 打开表盘时钟时加载时钟模块，不要加载新闻行情 | must=board.add_widget,dialClock.set_night_mode; forbid=headline.request_refresh,market.set_indices | assistant.runtime_diagnostics, board.add_widget, dialClock.set_night_mode | 0.92 | pass |
| 625 | realtime-2-required | 我说整理桌面时加载桌板和窗口工具 | must=board.auto_align | board.auto_align | 0.98 | pass |
| 626 | realtime-2-required | 关闭留言板只需要窗口工具，不要加载留言发送工具 | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.99 | pass |
| 627 | realtime-2-required | 搜索王菲红豆时加载音乐搜索和播放工具 | must=music.search | music.search, music.play | 0.96 | pass |
| 628 | realtime-2-required | 打开电视 CCTV5 时加载电视频道工具 | must=board.add_widget; anyOf=tv.play/tv.select_channel | board.add_widget, tv.select_channel, tv.play | 0.97 | pass |
| 629 | realtime-2-required | 查上海天气时加载天气城市工具 | must=weather.set_city | weather.set_city | 0.99 | pass |
| 630 | realtime-2-required | 添加待办时加载待办工具和时间解析上下文 | must=todo.add_item | todo.add_item | 0.9 | pass |
| 631 | realtime-2-required | 翻译英文句子时只加载翻译工具 | must=translate.set_draft | translate.set_draft | 0.99 | pass |
| 632 | realtime-2-required | 计算两公斤换算克时加载计算器和换算器 | anyOf=converter.set/calculator.set_display | converter.set | 0.99 | pass |
| 633 | realtime-2-required | 刷新新闻时加载新闻模块，不要顺手加载全球指数 | must=headline.request_refresh; forbid=market.set_indices | headline.request_refresh | 0.99 | pass |
| 634 | realtime-2-required | 看美股三大指数时加载行情模块 | must=market.set_indices | market.set_indices | 0.98 | pass |
| 635 | realtime-2-required | 开始录音时加载录音机控制工具 | must=recorder.start | recorder.start | 0.99 | pass |
| 636 | realtime-2-required | 打开设置属于小桌板自身能力，不要说没有工具 | must=app.settings.open | app.settings.open | 0.99 | pass |
| 637 | realtime-2-required | 隐藏侧边栏也要暴露给 realtime | must=app.sidebar.set | app.sidebar.set, assistant.runtime_diagnostics | 0.74 | pass |
| 638 | realtime-2-required | 音乐窗口调大属于窗口 resize 工具 | must=widget.resize | widget.resize | 0.9 | pass |
| 639 | realtime-2-required | 小工具找不到时先打开搜索命令面板 | must=app.command_palette.open | app.command_palette.open | 0.86 | pass |
| 640 | realtime-2-required | 模块选择失败时降级给完整工具摘要再重试一次 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.78 | pass |
| 641 | realtime-2-required | 音乐已经登录了，播放王菲红豆不要用试听源 | must=music.play | music.play | 0.92 | pass |
| 642 | realtime-2-required | 如果音乐 token 不可用，告诉我为什么还是试听 | anyOf=music.auth_status/assistant.runtime_diagnostics | music.auth_status | 0.84 | pass |
| 643 | realtime-2-required | 登录按钮还在就先不要自动播放音乐 | must=music.auth_status | assistant.runtime_diagnostics | 0.8 | pass: recoverable_non_action |
| 644 | realtime-2-required | 音乐登录成功后隐藏登录按钮并重新搜索 | anyOf=music.search/music.play | assistant.runtime_diagnostics, music.search | 0.77 | pass |
| 645 | realtime-2-required | 检查音乐账号状态，然后播放陈奕迅十年 | must=music.play | music.auth_status, music.play | 0.93 | pass |
| 646 | realtime-2-required | 如果 Apple Music 未授权，先打开登录入口 | must=music.auth_status | music.auth_status, app.settings.open | 0.89 | pass |
| 647 | realtime-2-required | 播放完整歌曲失败时把原因写到便签 | must=note.write | note.write | 0.9 | pass |
| 648 | realtime-2-required | 不要因为已登录界面就假定完整播放成功 | anyOf=music.auth_status/assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.82 | pass |
| 649 | realtime-2-required | 音乐播放器右上角显示登录按钮时不要挡住封面 | anyOf=widget.move/widget.resize | widget.move | 0.64 | pass |
| 650 | realtime-2-required | 播放轻松音乐时优先使用已登录账号曲库 | must=music.play | assistant.runtime_diagnostics | 0.62 | pass: recoverable_non_action |
| 651 | realtime-2-required | 如果只能试听，就提示需要开发者 token | must=assistant.reply | assistant.runtime_diagnostics | 0.63 | pass: recoverable_non_action |
| 652 | realtime-2-required | 重新授权音乐账号后再搜索王菲红豆 | must=music.search | music.auth_status, music.search | 0.7 | pass |
| 653 | realtime-2-required | 登录后刷新音乐播放器状态 | must=music.auth_status | music.auth_status | 0.67 | pass |
| 654 | realtime-2-required | 不要把试听播放当成成功完成 | anyOf=music.auth_status/assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.66 | pass |
| 655 | realtime-2-required | 音乐授权失败时打开设置让我检查 | must=app.settings.open | music.auth_status, app.settings.open | 0.72 | pass |
| 656 | realtime-2-required | 播放前确认 MusicKit 已经可用 | must=music.auth_status | music.auth_status | 0.68 | pass |
| 657 | realtime-2-required | 搜索结果出现但不能播放时不要一直找小工具 | anyOf=music.auth_status/assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.64 | pass |
| 658 | realtime-2-required | 如果歌曲已搜到，直接调用播放工具 | must=music.play | music.play | 0.71 | pass |
| 659 | realtime-2-required | 音乐登录按钮消失后再开始播放 | must=music.play | music.play | 0.62 | pass |
| 660 | realtime-2-required | 把音乐账号状态记录到监控日志 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.7 | pass |
| 661 | realtime-2-required | 我每点一步都记录监控日志，包括前端是否成功 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 662 | realtime-2-required | 语音连接成功后写一条会话已建立日志 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 663 | realtime-2-required | Realtime 断开时记录断开原因和时间 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 664 | realtime-2-required | 工具调用开始和结束都写到诊断面板 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 665 | realtime-2-required | 播放音乐失败时记录搜索词、工具名和错误 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 666 | realtime-2-required | 关闭留言板成功后记录窗口移除状态 | must=assistant.runtime_diagnostics; forbid=messageBoard.send | assistant.runtime_diagnostics | 0.96 | pass |
| 667 | realtime-2-required | 打开表盘时钟如果重复回复，也记录重复次数 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.95 | pass |
| 668 | realtime-2-required | 每次刷新页面记录默认小工具恢复来源 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.95 | pass |
| 669 | realtime-2-required | 前端按钮点击失败时把 DOM 状态写进日志 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 670 | realtime-2-required | 并发执行两个命令时分别记录成功或失败 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.95 | pass |
| 671 | realtime-2-required | 语音转文字结果和最终工具计划都保存 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 672 | realtime-2-required | 本地解析置信度低于零点九时记录交给 realtime | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 673 | realtime-2-required | Realtime 返回没有工具时保存当时工具清单 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 674 | realtime-2-required | 音乐试听模式出现时记录是否已登录 | anyOf=music.auth_status/assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 675 | realtime-2-required | 计时器声音出现时记录来源组件 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.95 | pass |
| 676 | realtime-2-required | 打开设置失败时记录路由和当前桌板 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.95 | pass |
| 677 | realtime-2-required | 桌面整理确认弹窗出现时记录等待确认 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.95 | pass |
| 678 | realtime-2-required | 用户确认后记录实际执行的工具列表 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.96 | pass |
| 679 | realtime-2-required | 前端成功但后端失败时同时写两侧状态 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.97 | pass |
| 680 | realtime-2-required | 测试结束后导出今天的语音诊断摘要 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.97 | pass |
| 681 | realtime-2-required | 播放王菲红豆的同时查上海天气，但先不要重复回复 | must=music.play,weather.set_city | music.play, weather.set_city | 0.9 | pass |
| 682 | realtime-2-required | 找小工具时我又说关闭留言板，也要执行后一个命令 | must=widget.remove; forbid=messageBoard.send | assistant.runtime_diagnostics, widget.remove | 0.88 | pass |
| 683 | realtime-2-required | 连接后我说在吗，请先回复再等待下一句 | must=assistant.reply | assistant.reply | 0.98 | pass |
| 684 | realtime-2-required | 如果工具目录没加载完，先用分级策略打开音乐 | must=board.add_widget | assistant.runtime_diagnostics, board.add_widget | 0.9 | pass |
| 685 | realtime-2-required | 连续执行打开表盘时钟和播放轻松音乐，不要一直重复表盘已打开 | must=board.add_widget,music.play,dialClock.set_night_mode | board.add_widget, dialClock.set_night_mode, music.play | 0.86 | pass |
| 686 | realtime-2-required | 我说整理桌面时不要回答没有工具，要触发确认 | must=board.auto_align | assistant.runtime_diagnostics | 0.9 | pass: recoverable_non_action |
| 687 | realtime-2-required | 把所有小桌板窗口能力按需加载给 realtime | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.9 | pass |
| 688 | realtime-2-required | 先解析本地高置信命令，低于零点九交给 realtime | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.9 | pass |
| 689 | realtime-2-required | 播放陈奕迅十年如果缺音乐工具，就加载音乐工具后重试 | must=music.play | assistant.runtime_diagnostics | 0.9 | pass: recoverable_non_action |
| 690 | realtime-2-required | 打开时钟时如果歧义，优先表盘并说明不是世界时钟 | must=board.add_widget,dialClock.set_night_mode | assistant.runtime_diagnostics | 0.9 | pass: recoverable_non_action |
| 691 | realtime-2-required | 多轮对话里不要忘记刚才已经打开音乐播放器 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.9 | pass |
| 692 | realtime-2-required | 连接一段时间断开时记录日志并自动提示重连 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.9 | pass |
| 693 | realtime-2-required | 工具调用失败后把错误写到监控日志 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.9 | pass |
| 694 | realtime-2-required | 同一条语音里有两个命令时不要丢第二个 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.9 | pass |
| 695 | realtime-2-required | 搜索轻松音乐不要复用上一条播放器状态 | must=music.search | assistant.runtime_diagnostics | 0.9 | pass: recoverable_non_action |
| 696 | realtime-2-required | 关闭留言板的本地解析置信度低就交给 realtime | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.88 | pass |
| 697 | realtime-2-required | 如果 realtime 回复没有工具，补发该模块工具清单 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.78 | pass |
| 698 | realtime-2-required | 第一次发送全局工具摘要，后续只发送选中模块详情 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.82 | pass |
| 699 | realtime-2-required | 并发执行天气和新闻时分别记录前端成功状态 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.84 | pass |
| 700 | realtime-2-required | 模拟弱网断线后恢复会话并继续处理下一句 | must=assistant.runtime_diagnostics | assistant.runtime_diagnostics | 0.86 | pass |
