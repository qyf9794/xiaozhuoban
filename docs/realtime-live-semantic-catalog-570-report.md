# Realtime-2 Live Semantic Catalog 570 Report

- Date: 2026-06-19T10:19:33.910Z
- Model: gpt-realtime-2
- Credential source: production-ephemeral-token
- Source site: https://xiaozhuoban.bqxb.org
- Cases: 556/570 passed
- Batch size: 15
- Secret handling: Realtime credentials are never written to this report.

## Failure Summary

- music-intent: 3
- open-widget-missing: 3
- over-refusal: 3
- other: 2
- news-market-intent: 2
- close-widget-missing: 1

## Failures

| id | command | expected | actual | missing | unexpected | category |
| --- | --- | --- | --- | --- | --- | --- |
| 211 | 打开设置后帮我检查有没有登录音乐的入口 | app.settings.open, music.auth_status | app.settings.open, assistant.reply | music.auth_status | assistant.reply | music-intent |
| 268 | 给我放五月天倔强，播放后把歌词搜索也打开 | music.play, board.add_widget | music.play, assistant.reply | board.add_widget | assistant.reply | open-widget-missing |
| 287 | 来点粤语老歌，如果识别不准就交给 realtime | music.search | music.play | music.search | music.play | music-intent |
| 298 | 来点周末感觉的歌，如果没把握就让我确认 | music.search | music.play | music.search | music.play | music-intent |
| 308 | 打开 CCTV6，同时把电视窗口放到右上角 | board.add_widget, tv.play, widget.move | tv.play, tv.select_channel, widget.move | board.add_widget | tv.select_channel | open-widget-missing |
| 332 | 给我看巴黎天气，顺便显示巴黎时间 | weather.set_city, board.add_widget, worldClock.set_zones | weather.set_city, worldClock.set_zones | board.add_widget |  | open-widget-missing |
| 419 | 把 0.9 以下交给 realtime 翻译成英文备忘 | translate.set_draft, note.write | translate.set_draft | note.write |  | other |
| 479 | 发送消息前先确认内容是我在测试 | messageBoard.send | assistant.reply | messageBoard.send | assistant.reply | over-refusal |
| 484 | 打开市场行情、重大新闻和纽约时间，排成一列 | board.add_widget, market.set_indices, headline.request_refresh, worldClock.set_zones, board.auto_align | board.add_widget, market.set_indices, headline.request_refresh, worldClock.set_zones, widget.move | board.auto_align | widget.move | news-market-intent |
| 520 | 如果你没把握，交给 realtime 解析 | assistant.reply | assistant.runtime_diagnostics | assistant.reply | assistant.runtime_diagnostics | other |
| 524 | 关闭音乐和电视之前先确认一次 | widget.remove | music.pause, tv.pause | widget.remove | music.pause, tv.pause | close-widget-missing |
| 529 | 重置倒计时前先告诉我当前状态 | assistant.runtime_diagnostics, countdown.reset | assistant.reply | assistant.runtime_diagnostics, countdown.reset | assistant.reply | over-refusal |
| 537 | 停止录音前确认当前是否正在录 | assistant.runtime_diagnostics, recorder.stop | assistant.reply | assistant.runtime_diagnostics, recorder.stop | assistant.reply | over-refusal |
| 548 | 把新闻窗口缩小，避免挡住便签 | widget.resize, widget.move | widget.resize | widget.move |  | news-market-intent |

## Per-Command Results

| id | route | command | expected | actual | confidence | result |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | shortcut-local | 把左边栏先藏起来 | app.sidebar.set | app.sidebar.set | 0.96 | pass |
| 002 | shortcut-local | 侧边栏重新显示 | app.sidebar.set | app.sidebar.set | 0.96 | pass |
| 003 | shortcut-local | 进入沉浸全屏 | app.fullscreen.set | app.fullscreen.set | 0.94 | pass |
| 004 | shortcut-local | 退出全屏回普通窗口 | app.fullscreen.set | app.fullscreen.set | 0.94 | pass |
| 005 | shortcut-local | 打开小桌板设置 | app.settings.open | app.settings.open | 0.98 | pass |
| 006 | shortcut-local | 打开搜索命令面板 | app.command_palette.open | app.command_palette.open | 0.98 | pass |
| 007 | shortcut-local | 我要新建一个 AI 小工具 | app.ai_dialog.open | app.ai_dialog.open | 0.97 | pass |
| 008 | shortcut-local | 整理一下桌面所有小工具 | board.auto_align | board.auto_align | 0.97 | pass |
| 009 | realtime-2-required | 新开一个学习桌板 | board.create | board.create | 0.92 | pass |
| 010 | realtime-2-required | 把当前桌板改名叫夜间工作 | board.rename | board.rename | 0.97 | pass |
| 011 | realtime-2-required | 切回工作台桌板 | board.switch | board.switch | 0.93 | pass |
| 012 | realtime-2-required | 把电视拖到右上角 | widget.move | widget.move | 0.95 | pass |
| 013 | realtime-2-required | 把电视面板调大一点 | widget.resize | widget.resize | 0.94 | pass |
| 014 | realtime-2-required | 把音乐播放器放最前 | widget.bring_to_front, widget.focus | widget.bring_to_front, widget.focus | 0.97 | pass |
| 015 | realtime-2-required | 聚焦天气卡片 | widget.focus, weather.set_city | widget.focus, weather.set_city | 0.9 | pass |
| 016 | realtime-2-required | 全屏看电视 | widget.fullscreen_focus, tv.fullscreen, tv.play | board.add_widget, tv.play, tv.fullscreen, widget.fullscreen_focus | 0.93 | pass |
| 017 | shortcut-local | 关闭留言板 | widget.remove | widget.remove | 0.96 | pass |
| 018 | realtime-2-required | 打开一个表盘时钟 | board.add_widget, dialClock.set_night_mode | board.add_widget, dialClock.set_night_mode | 0.92 | pass |
| 019 | realtime-2-required | 新建便签实例用于测试 | note.write | note.write | 0.88 | pass |
| 020 | shortcut-local | 查北京今天冷不冷 | weather.set_city | weather.set_city | 0.97 | pass |
| 021 | shortcut-local | 上海天气给我看一下 | weather.set_city | board.add_widget, weather.set_city | 0.96 | pass |
| 022 | realtime-2-required | 看看洛杉矶天气 | weather.set_city, worldClock.set_zones | weather.set_city, worldClock.set_zones | 0.9 | pass |
| 023 | shortcut-local | 杭州现在什么天气 | weather.set_city | weather.set_city | 0.97 | pass |
| 024 | shortcut-local | 帮我换到武汉天气 | weather.set_city | weather.set_city | 0.97 | pass |
| 025 | shortcut-local | 波士顿天气 | weather.set_city | weather.set_city | 0.95 | pass |
| 026 | shortcut-local | 广州天气怎么样 | weather.set_city | weather.set_city | 0.97 | pass |
| 027 | shortcut-local | 成都天气打开看看 | weather.set_city | board.add_widget, weather.set_city | 0.96 | pass |
| 028 | shortcut-local | 设一个三分钟倒计时 | countdown.set | countdown.set | 0.98 | pass |
| 029 | realtime-2-required | 十分钟后提醒我 | countdown.set, todo.add_item | countdown.set, todo.add_item | 0.97 | pass |
| 030 | shortcut-local | 暂停现在的计时器 | countdown.pause | countdown.pause | 0.98 | pass |
| 031 | shortcut-local | 继续刚才那个倒计时 | countdown.resume | countdown.resume | 0.98 | pass |
| 032 | shortcut-local | 重置倒计时 | countdown.reset | countdown.reset | 0.98 | pass |
| 033 | shortcut-local | 设置二十五秒计时 | countdown.set | countdown.set | 0.97 | pass |
| 034 | shortcut-local | 半小时倒计时开始 | countdown.set | countdown.set | 0.96 | pass |
| 035 | shortcut-local | 先定时一小时 | countdown.set | countdown.set | 0.95 | pass |
| 036 | shortcut-local | 便签记下今天继续回归测试 | note.write | note.write | 0.97 | pass |
| 037 | shortcut-local | 把会议纪要追加到便签 | note.write | note.write | 0.96 | pass |
| 038 | shortcut-local | 清空便签内容 | note.clear | note.clear | 0.99 | pass |
| 039 | shortcut-local | 添加待办买咖啡豆 | todo.add_item | todo.add_item | 0.99 | pass |
| 040 | shortcut-local | 明早九点提醒我提交报告 | todo.add_item | todo.add_item | 0.93 | pass |
| 041 | shortcut-local | 把买牛奶这项勾掉 | todo.complete_item | todo.complete_item | 0.98 | pass |
| 042 | shortcut-local | 复制演示账号到剪贴板 | clipboard.add_text | clipboard.add_text | 0.96 | pass |
| 043 | shortcut-local | 固定保存项目口令 demo | clipboard.add_text | clipboard.add_text | 0.97 | pass |
| 044 | shortcut-local | 清理剪贴板普通记录 | clipboard.clear | clipboard.clear | 0.98 | pass |
| 045 | shortcut-local | 把 hello world 翻译成中文 | translate.set_draft | translate.set_draft | 0.99 | pass |
| 046 | shortcut-local | 你好翻译成英文 | translate.set_draft | translate.set_draft | 0.98 | pass |
| 047 | shortcut-local | 十二加三十算一下 | calculator.set_display | calculator.set_display | 0.98 | pass |
| 048 | shortcut-local | 2斤是多少克 | converter.set | converter.set | 0.98 | pass |
| 049 | shortcut-local | 十二米换算公里 | converter.set | converter.set | 0.98 | pass |
| 050 | shortcut-local | 两公斤换算成克 | converter.set | converter.set | 0.98 | pass |
| 051 | shortcut-local | 世界时钟显示北京伦敦纽约 | worldClock.set_zones | board.add_widget, worldClock.set_zones | 0.99 | pass |
| 052 | shortcut-local | 看东京和巴黎时间 | worldClock.set_zones | worldClock.set_zones | 0.96 | pass |
| 053 | realtime-2-required | 刷新重大新闻 | headline.request_refresh | headline.request_refresh | 0.99 | pass |
| 054 | realtime-2-required | 今天有什么头条新闻 | headline.request_refresh | headline.request_refresh | 0.99 | pass |
| 055 | realtime-2-required | 看美股三大指数 | market.set_indices | market.set_indices | 0.98 | pass |
| 056 | realtime-2-required | 打开恒生和上证行情 | board.add_widget, market.set_indices | board.add_widget, market.set_indices | 0.99 | pass |
| 057 | shortcut-local | 表盘开启夜间模式 | dialClock.set_night_mode | board.add_widget, dialClock.set_night_mode | 0.99 | pass |
| 058 | shortcut-local | 关闭时钟夜间模式 | dialClock.set_night_mode | dialClock.set_night_mode | 0.96 | pass |
| 059 | shortcut-local | 留言板发一句我在测试 | messageBoard.send | messageBoard.send | 0.99 | pass |
| 060 | realtime-2-required | 搜一点轻松的音乐 | music.search | music.search | 0.99 | pass |
| 061 | realtime-2-required | 播放王菲的红豆 | music.play | music.play | 0.96 | pass |
| 062 | realtime-2-required | 来一首陈奕迅十年 | music.play | music.play | 0.96 | pass |
| 063 | shortcut-local | 音乐先暂停 | music.pause | music.pause | 0.98 | pass |
| 064 | shortcut-local | 继续刚才的歌 | music.resume | music.resume | 0.98 | pass |
| 065 | shortcut-local | 下一首歌 | music.next | music.next | 0.98 | pass |
| 066 | shortcut-local | 上一首 | music.previous | music.previous | 0.98 | pass |
| 067 | shortcut-local | 电视切到 CCTV13 | tv.select_channel | tv.select_channel | 0.97 | pass |
| 068 | shortcut-local | 播放 CCTV1 | tv.play | tv.play, tv.select_channel | 0.96 | pass |
| 069 | shortcut-local | 暂停电视直播 | tv.pause | tv.pause | 0.98 | pass |
| 070 | shortcut-local | 电视全屏 | tv.fullscreen | tv.fullscreen, widget.fullscreen_focus | 0.97 | pass |
| 071 | shortcut-local | 开始录音 | recorder.start | recorder.start | 0.99 | pass |
| 072 | realtime-2-required | 停止录音 | recorder.stop | recorder.stop | 0.99 | pass |
| 073 | realtime-2-required | 播放刚才录音 | recorder.play | recorder.play | 0.98 | pass |
| 074 | realtime-2-required | 暂停录音回放 | recorder.pause | recorder.pause | 0.98 | pass |
| 075 | shortcut-local | 把音乐收起来 | widget.remove | widget.remove | 0.92 | pass |
| 076 | shortcut-local | 把电视收起来 | widget.remove | widget.remove | 0.97 | pass |
| 077 | shortcut-local | 把录音机收起来 | widget.remove | widget.remove | 0.97 | pass |
| 078 | shortcut-local | 把天气收起来 | widget.remove | widget.remove | 0.97 | pass |
| 079 | shortcut-local | 把倒计时收起来 | widget.remove | widget.remove | 0.97 | pass |
| 080 | shortcut-local | 把待办收起来 | widget.remove | widget.remove | 0.97 | pass |
| 081 | shortcut-local | 把剪贴板收起来 | widget.remove | widget.remove | 0.97 | pass |
| 082 | shortcut-local | 把翻译收起来 | widget.remove | widget.remove | 0.97 | pass |
| 083 | shortcut-local | 把计算器收起来 | widget.remove | widget.remove | 0.97 | pass |
| 084 | shortcut-local | 把行情收起来 | widget.remove | widget.remove | 0.97 | pass |
| 085 | shortcut-local | 把新闻收起来 | widget.remove | widget.remove | 0.97 | pass |
| 086 | shortcut-local | 把世界时钟收起来 | widget.remove | widget.remove | 0.97 | pass |
| 087 | shortcut-local | 切到音乐窗口 | widget.focus | widget.focus | 0.96 | pass |
| 088 | shortcut-local | 切到电视窗口 | widget.focus | widget.focus | 0.96 | pass |
| 089 | shortcut-local | 切到录音机窗口 | widget.focus | widget.focus | 0.96 | pass |
| 090 | shortcut-local | 切到天气窗口 | widget.focus | widget.focus, weather.set_city | 0.96 | pass |
| 091 | shortcut-local | 切到待办窗口 | widget.focus | widget.focus | 0.96 | pass |
| 092 | shortcut-local | 切到留言板窗口 | widget.focus | widget.focus | 0.96 | pass |
| 093 | shortcut-local | 切到表盘时钟窗口 | widget.focus | widget.focus | 0.96 | pass |
| 094 | shortcut-local | 切到便签窗口 | widget.focus | widget.focus | 0.96 | pass |
| 095 | realtime-2-required | 再打开一个音乐 | board.add_widget | board.add_widget | 0.95 | pass |
| 096 | realtime-2-required | 再打开一个电视 | board.add_widget | board.add_widget | 0.95 | pass |
| 097 | realtime-2-required | 再打开一个天气 | board.add_widget | board.add_widget, weather.set_city | 0.97 | pass |
| 098 | realtime-2-required | 再打开一个倒计时 | board.add_widget | board.add_widget | 0.97 | pass |
| 099 | realtime-2-required | 再打开一个待办 | board.add_widget | board.add_widget | 0.95 | pass |
| 100 | realtime-2-required | 再打开一个剪贴板 | board.add_widget | board.add_widget | 0.95 | pass |
| 101 | realtime-2-required | 再打开一个翻译 | board.add_widget | board.add_widget | 0.95 | pass |
| 102 | realtime-2-required | 再打开一个计算器 | board.add_widget | board.add_widget | 0.95 | pass |
| 103 | realtime-2-required | 再打开一个行情 | board.add_widget | board.add_widget, market.set_indices | 0.97 | pass |
| 104 | realtime-2-required | 再打开一个新闻 | board.add_widget | board.add_widget, headline.request_refresh | 0.97 | pass |
| 105 | realtime-2-required | 再打开一个世界时钟 | board.add_widget | board.add_widget, worldClock.set_zones | 0.97 | pass |
| 106 | realtime-2-required | 再打开一个录音机 | board.add_widget | board.add_widget | 0.92 | pass |
| 107 | realtime-2-required | 播放陈奕迅十年，然后查上海天气 | music.play, weather.set_city | music.play, weather.set_city | 0.88 | pass |
| 108 | realtime-2-required | 隐藏侧边栏，同时打开设置 | app.sidebar.set, app.settings.open | app.sidebar.set, app.settings.open | 0.94 | pass |
| 109 | realtime-2-required | 打开电视然后切到 CCTV5 再全屏 | board.add_widget, tv.fullscreen, tv.select_channel | board.add_widget, tv.play, tv.select_channel, tv.fullscreen, widget.fullscreen_focus | 0.93 | pass |
| 110 | realtime-2-required | 先记下买票，然后添加待办订酒店 | note.write, todo.add_item | note.write, todo.add_item | 0.9 | pass |
| 111 | realtime-2-required | 关闭音乐和留言板 | widget.remove | music.pause, widget.remove | 0.86 | pass |
| 112 | realtime-2-required | 外面适合出门吗看北京，场景1 | weather.set_city | weather.set_city | 0.93 | pass |
| 113 | realtime-2-required | 我想听点放松的不一定播放，场景1 | music.search | music.search | 0.95 | pass |
| 114 | realtime-2-required | 来个周杰伦经典，场景1 | music.play | music.play | 0.9 | pass |
| 115 | realtime-2-required | 有空提醒我复盘语音测试，场景1 | todo.add_item | todo.add_item | 0.94 | pass |
| 116 | realtime-2-required | good night 帮我看中文，场景1 | translate.set_draft | translate.set_draft | 0.96 | pass |
| 117 | realtime-2-required | 十二乘十二，场景1 | calculator.set_display | calculator.set_display | 0.97 | pass |
| 118 | realtime-2-required | 纳指给我看一眼，场景1 | market.set_indices | market.set_indices | 0.95 | pass |
| 119 | realtime-2-required | 东京现在几点，场景1 | worldClock.set_zones | worldClock.set_zones | 0.93 | pass |
| 120 | realtime-2-required | 看看刚刚有什么新闻，场景1 | headline.request_refresh | headline.request_refresh | 0.92 | pass |
| 121 | realtime-2-required | 帮我录一段，场景1 | recorder.start | recorder.start | 0.98 | pass |
| 122 | realtime-2-required | 电影频道打开，场景1 | tv.select_channel | board.add_widget, tv.select_channel | 0.92 | pass |
| 123 | realtime-2-required | 留言板回复收到，场景1 | messageBoard.send | messageBoard.send | 0.97 | pass |
| 124 | realtime-2-required | 临时验证码存起来，场景1 | clipboard.add_text | clipboard.add_text | 0.96 | pass |
| 125 | realtime-2-required | 一分半以后叫我，场景1 | todo.add_item | countdown.set, todo.add_item | 0.95 | pass |
| 126 | realtime-2-required | 钟表别太亮，场景1 | dialClock.set_night_mode | dialClock.set_night_mode | 0.93 | pass |
| 127 | realtime-2-required | 我要找功能，场景1 | app.command_palette.open | app.command_palette.open | 0.99 | pass |
| 128 | realtime-2-required | 帮我做一个新工具，场景1 | app.ai_dialog.open | app.ai_dialog.open | 0.94 | pass |
| 129 | realtime-2-required | 回到工作台，场景1 | board.switch | board.switch | 0.88 | pass |
| 130 | realtime-2-required | 电视别被挡住，场景1 | widget.bring_to_front | widget.bring_to_front, widget.focus | 0.96 | pass |
| 131 | realtime-2-required | 音乐面板放大，场景1 | widget.resize | widget.resize | 0.95 | pass |
| 132 | realtime-2-required | 外面适合出门吗看北京，场景2 | weather.set_city | weather.set_city | 0.97 | pass |
| 133 | realtime-2-required | 我想听点放松的不一定播放，场景2 | music.search | music.search | 0.98 | pass |
| 134 | realtime-2-required | 来个周杰伦经典，场景2 | music.play | music.play | 0.97 | pass |
| 135 | realtime-2-required | 有空提醒我复盘语音测试，场景2 | todo.add_item | todo.add_item | 0.98 | pass |
| 136 | realtime-2-required | good night 帮我看中文，场景2 | translate.set_draft | translate.set_draft | 0.96 | pass |
| 137 | realtime-2-required | 十二乘十二，场景2 | calculator.set_display | calculator.set_display | 0.98 | pass |
| 138 | realtime-2-required | 纳指给我看一眼，场景2 | market.set_indices | market.set_indices | 0.97 | pass |
| 139 | realtime-2-required | 东京现在几点，场景2 | worldClock.set_zones | worldClock.set_zones | 0.97 | pass |
| 140 | realtime-2-required | 看看刚刚有什么新闻，场景2 | headline.request_refresh | headline.request_refresh | 0.96 | pass |
| 141 | realtime-2-required | 帮我录一段，场景2 | recorder.start | recorder.start | 0.95 | pass |
| 142 | realtime-2-required | 电影频道打开，场景2 | tv.select_channel | board.add_widget, tv.select_channel | 0.9 | pass |
| 143 | realtime-2-required | 留言板回复收到，场景2 | messageBoard.send | messageBoard.send | 0.96 | pass |
| 144 | realtime-2-required | 临时验证码存起来，场景2 | clipboard.add_text | clipboard.add_text | 0.95 | pass |
| 145 | realtime-2-required | 一分半以后叫我，场景2 | todo.add_item | countdown.set, todo.add_item | 0.96 | pass |
| 146 | realtime-2-required | 钟表别太亮，场景2 | dialClock.set_night_mode | dialClock.set_night_mode | 0.92 | pass |
| 147 | realtime-2-required | 我要找功能，场景2 | app.command_palette.open | app.command_palette.open | 0.97 | pass |
| 148 | realtime-2-required | 帮我做一个新工具，场景2 | app.ai_dialog.open | app.ai_dialog.open | 0.9 | pass |
| 149 | realtime-2-required | 回到工作台，场景2 | board.switch | board.switch | 0.88 | pass |
| 150 | realtime-2-required | 电视别被挡住，场景2 | widget.bring_to_front | widget.focus, widget.bring_to_front | 0.96 | pass |
| 151 | realtime-2-required | 音乐面板放大，场景2 | widget.resize | widget.resize | 0.79 | pass |
| 152 | realtime-2-required | 外面适合出门吗看北京，场景3 | weather.set_city | board.add_widget, weather.set_city | 0.9 | pass |
| 153 | realtime-2-required | 我想听点放松的不一定播放，场景3 | music.search | board.add_widget, music.search | 0.92 | pass |
| 154 | realtime-2-required | 来个周杰伦经典，场景3 | music.play | board.add_widget, music.play | 0.93 | pass |
| 155 | realtime-2-required | 有空提醒我复盘语音测试，场景3 | todo.add_item | todo.add_item | 0.94 | pass |
| 156 | realtime-2-required | good night 帮我看中文，场景3 | translate.set_draft | translate.set_draft | 0.95 | pass |
| 157 | realtime-2-required | 十二乘十二，场景3 | calculator.set_display | calculator.set_display | 0.96 | pass |
| 158 | realtime-2-required | 纳指给我看一眼，场景3 | market.set_indices | board.add_widget, market.set_indices | 0.95 | pass |
| 159 | realtime-2-required | 东京现在几点，场景3 | worldClock.set_zones | worldClock.set_zones | 0.9 | pass |
| 160 | realtime-2-required | 看看刚刚有什么新闻，场景3 | headline.request_refresh | board.add_widget, headline.request_refresh | 0.93 | pass |
| 161 | realtime-2-required | 帮我录一段，场景3 | recorder.start | board.add_widget, recorder.start | 0.92 | pass |
| 162 | realtime-2-required | 电影频道打开，场景3 | tv.play | board.add_widget, tv.play, tv.select_channel | 0.86 | pass |
| 163 | realtime-2-required | 留言板回复收到，场景3 | messageBoard.send | board.add_widget, messageBoard.send | 0.93 | pass |
| 164 | realtime-2-required | 临时验证码存起来，场景3 | clipboard.add_text | clipboard.add_text | 0.96 | pass |
| 165 | realtime-2-required | 一分半以后叫我，场景3 | todo.add_item | countdown.set, todo.add_item | 0.95 | pass |
| 166 | realtime-2-required | 钟表别太亮，场景3 | dialClock.set_night_mode | dialClock.set_night_mode | 0.9 | pass |
| 167 | realtime-2-required | 我要找功能，场景3 | app.command_palette.open | app.command_palette.open | 0.9 | pass |
| 168 | realtime-2-required | 帮我做一个新工具，场景3 | app.ai_dialog.open | app.ai_dialog.open | 0.9 | pass |
| 169 | realtime-2-required | 回到工作台，场景3 | board.switch | board.switch | 0.7 | pass |
| 170 | realtime-2-required | 电视别被挡住，场景3 | widget.bring_to_front | widget.bring_to_front, widget.focus | 0.95 | pass |
| 171 | realtime-2-required | 音乐面板放大，场景3 | widget.resize | widget.resize | 0.9 | pass |
| 172 | realtime-2-required | 外面适合出门吗看北京，场景4 | weather.set_city | board.add_widget, weather.set_city | 0.95 | pass |
| 173 | realtime-2-required | 我想听点放松的不一定播放，场景4 | music.search | music.search | 0.95 | pass |
| 174 | realtime-2-required | 来个周杰伦经典，场景4 | music.play | music.play | 0.9 | pass |
| 175 | realtime-2-required | 有空提醒我复盘语音测试，场景4 | todo.add_item | todo.add_item | 0.95 | pass |
| 176 | realtime-2-required | good night 帮我看中文，场景4 | translate.set_draft | translate.set_draft | 0.95 | pass |
| 177 | realtime-2-required | 十二乘十二，场景4 | calculator.set_display | calculator.set_display | 0.95 | pass |
| 178 | realtime-2-required | 纳指给我看一眼，场景4 | market.set_indices | board.add_widget, market.set_indices | 0.95 | pass |
| 179 | realtime-2-required | 东京现在几点，场景4 | worldClock.set_zones | worldClock.set_zones | 0.95 | pass |
| 180 | realtime-2-required | 看看刚刚有什么新闻，场景4 | headline.request_refresh | headline.request_refresh | 0.95 | pass |
| 181 | realtime-2-required | 帮我录一段，场景4 | recorder.start | recorder.start | 0.97 | pass |
| 182 | realtime-2-required | 电影频道打开，场景4 | tv.select_channel | board.add_widget, tv.select_channel | 0.96 | pass |
| 183 | realtime-2-required | 留言板回复收到，场景4 | messageBoard.send | messageBoard.send | 0.98 | pass |
| 184 | realtime-2-required | 临时验证码存起来，场景4 | clipboard.add_text | clipboard.add_text | 0.99 | pass |
| 185 | realtime-2-required | 一分半以后叫我，场景4 | todo.add_item | countdown.set, todo.add_item | 0.97 | pass |
| 186 | realtime-2-required | 钟表别太亮，场景4 | dialClock.set_night_mode | dialClock.set_night_mode | 0.95 | pass |
| 187 | realtime-2-required | 我要找功能，场景4 | app.command_palette.open | app.command_palette.open | 0.99 | pass |
| 188 | realtime-2-required | 帮我做一个新工具，场景4 | app.ai_dialog.open | app.ai_dialog.open | 0.98 | pass |
| 189 | realtime-2-required | 回到工作台，场景4 | board.switch | board.switch | 0.9 | pass |
| 190 | realtime-2-required | 电视别被挡住，场景4 | widget.bring_to_front | widget.focus, widget.bring_to_front | 0.97 | pass |
| 191 | realtime-2-required | 音乐面板放大，场景4 | widget.resize | widget.resize | 0.97 | pass |
| 192 | realtime-2-required | 外面适合出门吗看北京，场景5 | weather.set_city | weather.set_city | 0.99 | pass |
| 193 | realtime-2-required | 我想听点放松的不一定播放，场景5 | music.search | music.search | 0.99 | pass |
| 194 | realtime-2-required | 来个周杰伦经典，场景5 | music.play | music.play | 0.97 | pass |
| 195 | realtime-2-required | 有空提醒我复盘语音测试，场景5 | todo.add_item | todo.add_item | 0.99 | pass |
| 196 | realtime-2-required | good night 帮我看中文，场景5 | translate.set_draft | translate.set_draft | 0.94 | pass |
| 197 | realtime-2-required | 十二乘十二，场景5 | calculator.set_display | calculator.set_display | 0.95 | pass |
| 198 | realtime-2-required | 纳指给我看一眼，场景5 | market.set_indices | board.add_widget, market.set_indices | 0.9 | pass |
| 199 | realtime-2-required | 东京现在几点，场景5 | worldClock.set_zones | weather.set_city, worldClock.set_zones | 0.88 | pass |
| 200 | realtime-2-required | 看看刚刚有什么新闻，场景5 | headline.request_refresh | board.add_widget, headline.request_refresh | 0.9 | pass |
| 201 | realtime-2-required | 先把左侧边栏收起，然后打开设置检查语音入口 | app.sidebar.set, app.settings.open | app.sidebar.set, app.settings.open | 0.86 | pass |
| 202 | realtime-2-required | 进入全屏后马上退出，再打开命令面板找音乐播放器 | app.fullscreen.set, app.command_palette.open | app.fullscreen.set, app.command_palette.open | 0.84 | pass |
| 203 | realtime-2-required | 把侧边栏显示回来，同时把设置窗口放到最前面 | app.sidebar.set, widget.bring_to_front, widget.focus | app.sidebar.set, widget.bring_to_front, widget.focus | 0.86 | pass |
| 204 | realtime-2-required | 打开设置，切到语音相关页面，如果没有就打开命令面板 | app.settings.open, app.command_palette.open | app.settings.open, app.command_palette.open | 0.82 | pass |
| 205 | realtime-2-required | 我想专心一下，隐藏侧栏并把当前桌面整理整齐 | app.sidebar.set, board.auto_align | app.sidebar.set, board.auto_align | 0.9 | pass |
| 206 | realtime-2-required | 退出全屏，打开搜索面板，然后输入天气两个字 | app.fullscreen.set, app.command_palette.open | app.fullscreen.set, app.command_palette.open | 0.8 | pass |
| 207 | realtime-2-required | 进入沉浸模式，同时不要关闭正在播放的音乐 | app.fullscreen.set | app.fullscreen.set | 0.78 | pass |
| 208 | realtime-2-required | 打开小桌板设置，再新建一个 AI 小工具草稿 | app.settings.open, app.ai_dialog.open | app.settings.open, app.ai_dialog.open | 0.9 | pass |
| 209 | realtime-2-required | 把所有弹窗先收起来，只留下命令面板 | app.command_palette.open | widget.remove, app.command_palette.open | 0.62 | pass |
| 210 | realtime-2-required | 先显示侧边栏，再把音乐和天气两个窗口都放到前面 | app.sidebar.set, widget.bring_to_front, widget.focus | app.sidebar.set, widget.bring_to_front, widget.focus | 0.76 | pass |
| 211 | realtime-2-required | 打开设置后帮我检查有没有登录音乐的入口 | app.settings.open, music.auth_status | app.settings.open, assistant.reply | 0.64 | fail: missing=music.auth_status |
| 212 | realtime-2-required | 我刚才误触全屏了，恢复普通窗口并聚焦便签 | app.fullscreen.set, widget.focus | app.fullscreen.set, widget.focus | 0.72 | pass |
| 213 | realtime-2-required | 隐藏侧栏，打开 AI 小工具窗口，名字先叫每日摘要 | app.sidebar.set, app.ai_dialog.open | app.sidebar.set, app.ai_dialog.open | 0.7 | pass |
| 214 | realtime-2-required | 把命令面板打开，如果当前在全屏就先退出 | app.command_palette.open | app.fullscreen.set, app.command_palette.open | 0.74 | pass |
| 215 | realtime-2-required | 进入全屏看电视，同时把侧边栏藏起来 | app.sidebar.set, tv.fullscreen, tv.play, widget.fullscreen_focus | tv.play, tv.fullscreen, widget.fullscreen_focus, app.sidebar.set | 0.78 | pass |
| 216 | realtime-2-required | 把设置打开后不要新建工具，只让我看配置 | app.settings.open | app.settings.open | 0.83 | pass |
| 217 | realtime-2-required | 现在先回到普通窗口，然后显示侧边栏 | app.sidebar.set, app.fullscreen.set | app.fullscreen.set, app.sidebar.set | 0.76 | pass |
| 218 | realtime-2-required | 打开搜索命令面板并准备查找世界时钟 | app.command_palette.open | app.command_palette.open | 0.71 | pass |
| 219 | realtime-2-required | 把侧边栏切换一下，再把表盘时钟放最前 | app.sidebar.set, widget.bring_to_front, widget.focus | app.sidebar.set, widget.bring_to_front, widget.focus | 0.8 | pass |
| 220 | realtime-2-required | 清理桌面前先打开设置让我确认 | app.settings.open | app.settings.open | 0.77 | pass |
| 221 | realtime-2-required | 新建一个叫晨间复盘的桌板，然后切过去 | board.create | board.create, board.switch | 0.75 | pass |
| 222 | realtime-2-required | 把当前桌板改名成项目冲刺，并整理所有小工具 | board.rename, board.auto_align | board.rename, board.auto_align | 0.82 | pass |
| 223 | realtime-2-required | 切到工作台桌板后打开新闻和行情 | board.switch, board.add_widget, headline.request_refresh, market.set_indices | board.switch, board.add_widget, headline.request_refresh, market.set_indices | 0.79 | pass |
| 224 | realtime-2-required | 新开旅行计划桌板，把天气、世界时钟和待办都放上去 | board.create, board.add_widget, weather.set_city, worldClock.set_zones | board.create, board.add_widget, weather.set_city, worldClock.set_zones, todo.add_item | 0.73 | pass |
| 225 | realtime-2-required | 回到夜间工作桌板，同时把表盘时钟调成夜间模式 | board.switch, dialClock.set_night_mode | board.switch, dialClock.set_night_mode | 0.76 | pass |
| 226 | realtime-2-required | 创建一个音乐练习桌板，再打开音乐和录音机 | board.create, board.add_widget | board.create, board.add_widget | 0.86 | pass |
| 227 | realtime-2-required | 把当前桌板改成语音回归测试，不要删除任何小工具 | board.rename | board.rename | 0.97 | pass |
| 228 | realtime-2-required | 切回工作台，再把电视窗口移动到右上角 | widget.move | board.switch, widget.move | 0.9 | pass |
| 229 | realtime-2-required | 新建家庭事务桌板，添加待办、便签和留言板 | board.create, board.add_widget | board.create, board.add_widget | 0.93 | pass |
| 230 | realtime-2-required | 把桌面自动整理一下，确认后再聚焦音乐播放器 | board.auto_align, widget.focus | board.auto_align, widget.focus | 0.9 | pass |
| 231 | realtime-2-required | 切到学习桌板，打开翻译和计算器 | board.switch, board.add_widget | board.switch, board.add_widget | 0.92 | pass |
| 232 | realtime-2-required | 创建一个市场观察桌板，同时打开行情和重大新闻 | board.create, board.add_widget, headline.request_refresh, market.set_indices | board.create, board.add_widget, market.set_indices, headline.request_refresh | 0.94 | pass |
| 233 | realtime-2-required | 把当前桌板重命名为今晚直播，然后打开电视 | board.rename, board.add_widget, tv.play | board.rename, board.add_widget, tv.play | 0.92 | pass |
| 234 | realtime-2-required | 回到默认工作台，把天气卡片调到左上角 | board.switch, widget.move | board.switch, widget.move | 0.9 | pass |
| 235 | realtime-2-required | 新建一个临时桌板，只放倒计时和便签 | board.create, board.add_widget | board.create, board.add_widget | 0.95 | pass |
| 236 | realtime-2-required | 切到项目桌板后把所有窗口按网格排列 | board.switch, board.auto_align | board.switch, board.auto_align | 0.9 | pass |
| 237 | realtime-2-required | 把当前桌板命名为会议记录，然后开始录音 | board.rename, recorder.start | board.rename, recorder.start | 0.93 | pass |
| 238 | realtime-2-required | 创建阅读桌板，打开便签、翻译和世界时钟 | board.create, board.add_widget, worldClock.set_zones | board.create, board.add_widget, worldClock.set_zones | 0.92 | pass |
| 239 | realtime-2-required | 切回上一个桌板，如果找不到就打开命令面板 | app.command_palette.open, board.switch | board.switch, app.command_palette.open | 0.88 | pass |
| 240 | realtime-2-required | 整理桌板之后把留言板关闭，不要发送留言 | board.auto_align, widget.remove | board.auto_align, widget.remove | 0.93 | pass |
| 241 | realtime-2-required | 把音乐播放器移到左下角，再把封面区域放大一点 | widget.move, widget.resize | widget.move, widget.resize | 0.86 | pass |
| 242 | realtime-2-required | 把天气卡片缩小，电视窗口放到右上角并置顶 | widget.resize, widget.move, widget.bring_to_front, widget.focus | widget.resize, widget.move, widget.bring_to_front, widget.focus | 0.9 | pass |
| 243 | realtime-2-required | 关闭留言板，然后打开一个新的便签实例 | widget.remove, note.write | widget.remove, board.add_widget, note.write | 0.92 | pass |
| 244 | realtime-2-required | 把电视窗口全屏，退出后仍然放在最前面 | widget.fullscreen_focus | tv.fullscreen, widget.fullscreen_focus, widget.bring_to_front, widget.focus | 0.9 | pass |
| 245 | realtime-2-required | 把录音机移到音乐旁边，两个窗口都不要遮住 | widget.move | widget.move, widget.resize | 0.84 | pass |
| 246 | realtime-2-required | 把世界时钟放到右侧，把表盘时钟放到中间 | widget.move | widget.move, board.add_widget, dialClock.set_night_mode | 0.88 | pass |
| 247 | realtime-2-required | 把行情窗口调宽，同时刷新重大新闻 | widget.resize, headline.request_refresh | widget.resize, headline.request_refresh | 0.9 | pass |
| 248 | realtime-2-required | 再打开一个倒计时，用完后把旧的倒计时关闭 | board.add_widget | board.add_widget, countdown.set, widget.remove | 0.9 | pass |
| 249 | realtime-2-required | 把计算器和换算器并排放，宽度都调小 | widget.move, widget.resize | widget.move, widget.resize | 0.9 | pass |
| 250 | realtime-2-required | 把翻译窗口拖到便签下面，并聚焦翻译输入框 | widget.move, widget.focus | widget.move, widget.focus | 0.88 | pass |
| 251 | realtime-2-required | 把待办窗口放大，完成后把便签放到最前 | widget.resize, widget.bring_to_front, widget.focus | widget.resize, widget.bring_to_front, widget.focus | 0.9 | pass |
| 252 | realtime-2-required | 关闭天气和新闻，只保留音乐、电视、待办 | widget.remove | widget.remove | 0.86 | pass |
| 253 | realtime-2-required | 打开剪贴板后把它固定在屏幕右侧 | board.add_widget, widget.move | board.add_widget, widget.move | 0.9 | pass |
| 254 | realtime-2-required | 把表盘时钟调小一点，别挡住音乐封面 | widget.resize | widget.resize, widget.move | 0.86 | pass |
| 255 | realtime-2-required | 把电视从右上角移到左侧，再打开全屏预览 | widget.move, tv.fullscreen, widget.fullscreen_focus | widget.move, tv.fullscreen, widget.fullscreen_focus | 0.9 | pass |
| 256 | realtime-2-required | 关闭所有临时小工具，但保留音乐播放器 | widget.remove | widget.remove | 0.65 | pass |
| 257 | realtime-2-required | 把留言板打开，移动到桌面底部居中 | widget.move | board.add_widget, widget.move | 0.85 | pass |
| 258 | realtime-2-required | 再开一个天气窗口用于对比北京和上海 | weather.set_city | board.add_widget, weather.set_city | 0.72 | pass |
| 259 | realtime-2-required | 把音乐窗口退出全屏，然后调整到宽度 520 | app.fullscreen.set, widget.resize | app.fullscreen.set, widget.resize | 0.7 | pass |
| 260 | realtime-2-required | 把所有打开的小工具重新排版，确认后执行 | board.auto_align | board.auto_align | 0.9 | pass |
| 261 | realtime-2-required | 播放王菲的红豆，搜到后直接开始播放 | music.play | music.search, music.play | 0.92 | pass |
| 262 | realtime-2-required | 我要听陈奕迅的十年，不要继续上一首 | music.play | music.search, music.play | 0.93 | pass |
| 263 | realtime-2-required | 搜索周杰伦晴天，然后播放第一个完整结果 | music.search | music.search, music.play | 0.92 | pass |
| 264 | realtime-2-required | 来一首孙燕姿遇见，如果没找到就先展示搜索结果 | music.play | music.search, music.play | 0.88 | pass |
| 265 | realtime-2-required | 播放林俊杰江南，同时把音乐播放器放最前 | widget.bring_to_front, widget.focus | music.play, widget.bring_to_front, widget.focus | 0.94 | pass |
| 266 | realtime-2-required | 找张学友吻别，别只放试听片段 | music.play | music.play | 0.9 | pass |
| 267 | realtime-2-required | 打开音乐播放器，搜索邓紫棋泡沫并播放 | board.add_widget, music.play | board.add_widget, music.search, music.play | 0.95 | pass |
| 268 | realtime-2-required | 给我放五月天倔强，播放后把歌词搜索也打开 | music.play, board.add_widget | music.play, assistant.reply | 0.7 | fail: missing=board.add_widget |
| 269 | realtime-2-required | 播放 Beyond 海阔天空，不要换成同名翻唱 | music.play | music.play | 0.9 | pass |
| 270 | realtime-2-required | 搜蔡健雅红色高跟鞋，先暂停当前歌曲再播放 | music.pause, music.play | music.search, music.pause, music.play | 0.93 | pass |
| 271 | realtime-2-required | 我想听李宗盛山丘，找到原唱版本 | music.play | music.play | 0.84 | pass |
| 272 | realtime-2-required | 播放 Taylor Swift 的 Lover，然后把音量状态记到便签 | music.play, note.write | board.add_widget, music.play, note.write | 0.78 | pass |
| 273 | realtime-2-required | 来一首 Adele 的 Hello，搜索词就用 Adele Hello | music.play | music.play | 0.82 | pass |
| 274 | realtime-2-required | 播放 Coldplay Yellow，别解析成颜色翻译 | music.play | music.play | 0.88 | pass |
| 275 | realtime-2-required | 搜王力宏唯一并播放，播放失败就告诉我原因 | music.play | music.search, music.play | 0.76 | pass |
| 276 | realtime-2-required | 给我放刘若英后来，播放器没有打开就先打开 | music.play | board.add_widget, music.play | 0.82 | pass |
| 277 | realtime-2-required | 播放梁静茹勇气，然后把倒计时设为四分钟 | music.play, countdown.set | music.play, countdown.set | 0.86 | pass |
| 278 | realtime-2-required | 找陈奕迅孤勇者，播放前确认不是十年 | music.play | music.play | 0.7 | pass |
| 279 | realtime-2-required | 我要听王菲容易受伤的女人，按歌曲名搜索 | music.search | music.search | 0.83 | pass |
| 280 | realtime-2-required | 播放轻松音乐时重新搜索，不要沿用上一首 | music.search | music.search, music.play | 0.8 | pass |
| 281 | realtime-2-required | 我想听点轻松的中文歌，先搜索不要立刻播放 | music.search | music.search | 0.84 | pass |
| 282 | realtime-2-required | 放一点适合写代码的纯音乐，结果要重新搜索 | music.search | music.search, music.play | 0.79 | pass |
| 283 | realtime-2-required | 来点不吵的背景音乐，别播刚才那首 | music.search | music.search, music.play | 0.78 | pass |
| 284 | realtime-2-required | 找适合睡前的歌，播放器放在桌面左下 | music.search, widget.move | music.search, widget.move | 0.74 | pass |
| 285 | realtime-2-required | 我想听轻快但不太吵的音乐，先展示列表 | music.search | music.search | 0.82 | pass |
| 286 | realtime-2-required | 播放舒缓钢琴，三分钟后提醒我休息眼睛 | music.play, countdown.set, todo.add_item | music.play, countdown.set, todo.add_item | 0.88 | pass |
| 287 | realtime-2-required | 来点粤语老歌，如果识别不准就交给 realtime | music.search | music.play | 0.74 | fail: missing=music.search |
| 288 | realtime-2-required | 刚才不是这首，重新搜陈奕迅的十年 | music.search | music.search | 0.86 | pass |
| 289 | realtime-2-required | 不要播放试听版，优先用已登录的音乐账号 | music.auth_status | music.auth_status | 0.92 | pass |
| 290 | realtime-2-required | 给我找运动时听的歌，并把下一首按钮准备好 | music.search | music.search | 0.76 | pass |
| 291 | realtime-2-required | 换成轻松一点的，不要继续现在的歌曲 | music.search | music.search | 0.9 | pass |
| 292 | realtime-2-required | 搜索雨天适合听的音乐，只要歌曲不要电台 | music.search | music.search | 0.79 | pass |
| 293 | realtime-2-required | 找午休背景音乐，播放前把电视暂停 | tv.pause, music.search | tv.pause, music.search | 0.83 | pass |
| 294 | realtime-2-required | 我说的是轻松音乐，不是上一首，重新搜索 | music.search | music.search | 0.9 | pass |
| 295 | realtime-2-required | 给我一首安静的英文歌，先搜完整曲库 | music.play | music.search, music.play | 0.82 | pass |
| 296 | realtime-2-required | 播放适合开车的歌，但音量不要改 | music.play | music.play | 0.78 | pass |
| 297 | realtime-2-required | 搜白噪音或自然声，不要打开电视 | music.search | music.search | 0.8 | pass |
| 298 | realtime-2-required | 来点周末感觉的歌，如果没把握就让我确认 | music.search | music.play | 0.77 | fail: missing=music.search |
| 299 | realtime-2-required | 先暂停当前歌曲，再找轻柔民谣 | music.pause, music.search | music.pause, music.search | 0.9 | pass |
| 300 | realtime-2-required | 把音乐换成专注模式用的播放列表 | music.play | music.play | 0.84 | pass |
| 301 | realtime-2-required | 打开电视并切到 CCTV5，完成后全屏 | board.add_widget, tv.select_channel, tv.fullscreen | board.add_widget, tv.play, tv.select_channel, tv.fullscreen, widget.fullscreen_focus | 0.98 | pass |
| 302 | realtime-2-required | 播放 CCTV13 新闻频道，然后刷新重大新闻 | tv.play, headline.request_refresh | tv.play, tv.select_channel, headline.request_refresh | 0.95 | pass |
| 303 | realtime-2-required | 电视切到电影频道，但不要关闭音乐 | tv.select_channel | tv.select_channel | 0.86 | pass |
| 304 | realtime-2-required | 暂停电视直播，继续播放音乐 | tv.pause, music.resume | tv.pause, music.resume | 0.96 | pass |
| 305 | realtime-2-required | 把电视从全屏退出来，再切到 CCTV1 | tv.select_channel | tv.fullscreen, tv.select_channel | 0.9 | pass |
| 306 | realtime-2-required | 我想看体育频道，先打开电视再选 CCTV5 | board.add_widget, tv.select_channel | board.add_widget, tv.play, tv.select_channel | 0.97 | pass |
| 307 | realtime-2-required | 电视全屏后把侧边栏隐藏 | app.sidebar.set, tv.fullscreen | tv.fullscreen, widget.fullscreen_focus, app.sidebar.set | 0.92 | pass |
| 308 | realtime-2-required | 打开 CCTV6，同时把电视窗口放到右上角 | board.add_widget, tv.play, widget.move | tv.play, tv.select_channel, widget.move | 0.9 | fail: missing=board.add_widget |
| 309 | realtime-2-required | 把电视音频先暂停，然后开始录音 | tv.pause, recorder.start | tv.pause, recorder.start | 0.98 | pass |
| 310 | realtime-2-required | 切到 CCTV13，如果失败就保留频道选择界面 | tv.select_channel | tv.select_channel | 0.82 | pass |
| 311 | realtime-2-required | 打开电视，但不要遮住天气卡片 | board.add_widget, tv.play, widget.move | board.add_widget, tv.play, widget.move | 0.9 | pass |
| 312 | realtime-2-required | 播放 CCTV1 综合频道，再设十分钟倒计时 | tv.play, countdown.set | tv.play, tv.select_channel, countdown.set | 0.97 | pass |
| 313 | realtime-2-required | 帮我看新闻直播，优先 CCTV13 | tv.play, tv.select_channel | tv.play, tv.select_channel | 0.9 | pass |
| 314 | realtime-2-required | 把电视窗口调大一点并置顶 | widget.resize, widget.bring_to_front | widget.resize, widget.bring_to_front, widget.focus | 0.94 | pass |
| 315 | realtime-2-required | 关闭电视，同时把音乐继续播放 | widget.remove, music.resume | widget.remove, music.resume | 0.96 | pass |
| 316 | realtime-2-required | 打开电视后不要自动全屏，先让我确认频道 | board.add_widget | board.add_widget, tv.play | 0.66 | pass |
| 317 | realtime-2-required | 把当前电视直播暂停五分钟后提醒我回来 | tv.pause, todo.add_item | tv.pause, countdown.set, todo.add_item | 0.75 | pass |
| 318 | realtime-2-required | 切换到电影频道并记录到便签 | tv.select_channel, note.write | tv.select_channel, note.write | 0.7 | pass |
| 319 | realtime-2-required | 电视卡住了，重新选择 CCTV1 并播放 | tv.select_channel | tv.select_channel, tv.play | 0.78 | pass |
| 320 | realtime-2-required | 打开电视小工具，如果没有就新增一个 | board.add_widget | board.add_widget, tv.play | 0.7 | pass |
| 321 | realtime-2-required | 查北京今天会不会下雨，顺便记到便签 | weather.set_city, note.write | weather.set_city, note.write | 0.8 | pass |
| 322 | realtime-2-required | 看上海现在天气，如果冷就提醒我带外套 | weather.set_city, todo.add_item | weather.set_city, todo.add_item | 0.77 | pass |
| 323 | realtime-2-required | 明早去杭州，帮我看天气并加一条待办 | weather.set_city, todo.add_item | weather.set_city, todo.add_item | 0.78 | pass |
| 324 | realtime-2-required | 洛杉矶天气打开看看，再显示本地时间 | weather.set_city, worldClock.set_zones | board.add_widget, weather.set_city, worldClock.set_zones | 0.76 | pass |
| 325 | realtime-2-required | 广州天气怎么样，同时刷新空气相关摘要 | weather.set_city | weather.set_city | 0.55 | pass |
| 326 | realtime-2-required | 帮我查武汉今天适不适合跑步 | weather.set_city | weather.set_city | 0.8 | pass |
| 327 | realtime-2-required | 成都天气卡片放最前，别打开新闻 | weather.set_city, widget.bring_to_front, widget.focus | widget.focus, widget.bring_to_front, weather.set_city | 0.82 | pass |
| 328 | realtime-2-required | 波士顿现在冷不冷，再换算华氏和摄氏 | weather.set_city, converter.set | weather.set_city, converter.set | 0.78 | pass |
| 329 | realtime-2-required | 北京和上海天气都打开，我要对比 | board.add_widget, weather.set_city | board.add_widget, weather.set_city | 0.74 | pass |
| 330 | realtime-2-required | 我明天出门，先查杭州天气再设早上八点提醒 | weather.set_city, todo.add_item | weather.set_city, countdown.set, todo.add_item | 0.76 | pass |
| 331 | realtime-2-required | 查东京天气，同时打开东京世界时钟 | weather.set_city, board.add_widget, worldClock.set_zones | weather.set_city, board.add_widget, worldClock.set_zones | 0.96 | pass |
| 332 | realtime-2-required | 给我看巴黎天气，顺便显示巴黎时间 | weather.set_city, board.add_widget, worldClock.set_zones | weather.set_city, worldClock.set_zones | 0.92 | fail: missing=board.add_widget |
| 333 | realtime-2-required | 查深圳天气，不要误打开重大新闻 | weather.set_city | weather.set_city | 0.98 | pass |
| 334 | realtime-2-required | 外面适合带伞吗，默认看北京 | weather.set_city | weather.set_city | 0.97 | pass |
| 335 | realtime-2-required | 帮我把天气城市改成纽约并聚焦天气卡片 | weather.set_city, widget.focus | weather.set_city, widget.focus | 0.96 | pass |
| 336 | realtime-2-required | 查广州天气后把结果发到留言板 | weather.set_city, messageBoard.send | weather.set_city, messageBoard.send | 0.95 | pass |
| 337 | realtime-2-required | 切换天气到成都，同时打开倒计时十五分钟 | weather.set_city, countdown.set | weather.set_city, countdown.set | 0.96 | pass |
| 338 | realtime-2-required | 今天适合洗车吗，看上海天气 | weather.set_city | weather.set_city | 0.97 | pass |
| 339 | realtime-2-required | 查北京体感温度，然后翻译成英文一句话 | weather.set_city, translate.set_draft | weather.set_city, translate.set_draft | 0.95 | pass |
| 340 | realtime-2-required | 天气窗口如果没开，先打开再查武汉 | board.add_widget, weather.set_city | board.add_widget, weather.set_city | 0.94 | pass |
| 341 | realtime-2-required | 显示北京伦敦纽约时间，并打开表盘时钟 | board.add_widget, worldClock.set_zones | worldClock.set_zones, board.add_widget, dialClock.set_night_mode | 0.93 | pass |
| 342 | realtime-2-required | 世界时钟加东京和巴黎，然后切到夜间模式 | worldClock.set_zones, dialClock.set_night_mode | worldClock.set_zones, board.add_widget, dialClock.set_night_mode | 0.88 | pass |
| 343 | realtime-2-required | 设二十五分钟专注倒计时，同时播放轻音乐 | countdown.set, music.play | countdown.set, music.play | 0.97 | pass |
| 344 | realtime-2-required | 倒计时暂停后，便签记一下暂停原因是开会 | countdown.pause, note.write | countdown.pause, note.write | 0.96 | pass |
| 345 | realtime-2-required | 继续刚才的倒计时，结束后提醒我喝水 | countdown.resume, todo.add_item | countdown.resume, todo.add_item | 0.95 | pass |
| 346 | realtime-2-required | 把表盘时钟调成夜间模式，并缩小一点 | dialClock.set_night_mode, widget.resize | board.add_widget, dialClock.set_night_mode, widget.resize | 0.9 | pass |
| 347 | realtime-2-required | 关闭时钟夜间模式，再显示纽约时间 | dialClock.set_night_mode, worldClock.set_zones | dialClock.set_night_mode, worldClock.set_zones | 0.86 | pass |
| 348 | realtime-2-required | 半小时后提醒我检查部署日志 | countdown.set, todo.add_item | countdown.set, todo.add_item | 0.9 | pass |
| 349 | realtime-2-required | 设置一分三十秒倒计时，名称叫泡茶 | countdown.set | countdown.set | 0.92 | pass |
| 350 | realtime-2-required | 把倒计时重置，然后重新设五分钟 | countdown.reset, countdown.set | countdown.reset, countdown.set | 0.9 | pass |
| 351 | realtime-2-required | 显示东京现在几点，同时查东京天气 | worldClock.set_zones, weather.set_city | worldClock.set_zones, weather.set_city | 0.93 | pass |
| 352 | realtime-2-required | 明早九点提醒我给客户回电话 | todo.add_item | todo.add_item | 0.9 | pass |
| 353 | realtime-2-required | 二十分钟后让我休息，不要打开待办列表 | countdown.set | countdown.set, todo.add_item | 0.88 | pass |
| 354 | realtime-2-required | 世界时钟只保留北京和旧金山 | worldClock.set_zones | worldClock.set_zones | 0.92 | pass |
| 355 | realtime-2-required | 表盘时钟放到桌面中央，别挡住电视 | widget.move | widget.move | 0.84 | pass |
| 356 | realtime-2-required | 设一个四十五分钟会议倒计时并开始录音 | countdown.set, recorder.start | countdown.set, recorder.start | 0.91 | pass |
| 357 | realtime-2-required | 暂停计时器，同时把音乐也暂停 | countdown.pause, music.pause | countdown.pause, music.pause | 0.9 | pass |
| 358 | realtime-2-required | 倒计时恢复后把待办窗口放最前 | countdown.resume, widget.bring_to_front, widget.focus | countdown.resume, widget.focus, widget.bring_to_front | 0.9 | pass |
| 359 | realtime-2-required | 打开表盘而不是世界时钟 | board.add_widget | board.add_widget, dialClock.set_night_mode | 0.9 | pass |
| 360 | realtime-2-required | 我说打开时钟时优先打开表盘时钟 | assistant.reply | assistant.reply | 0.55 | pass |
| 361 | realtime-2-required | 便签记下今天要验证音乐登录和播放完整歌曲 | note.write | note.write | 0.83 | pass |
| 362 | realtime-2-required | 把刚才搜索到的王菲红豆追加到便签 | note.write | note.write | 0.76 | pass |
| 363 | realtime-2-required | 添加待办：修复 realtime 工具暴露策略 | todo.add_item | todo.add_item | 0.9 | pass |
| 364 | realtime-2-required | 明天下午三点提醒我检查 Vercel 日志 | todo.add_item | countdown.set, todo.add_item | 0.87 | pass |
| 365 | realtime-2-required | 把买牛奶标记完成，再新增买咖啡豆 | todo.complete_item, todo.add_item | todo.complete_item, todo.add_item | 0.88 | pass |
| 366 | realtime-2-required | 清空便签前先弹确认，不要直接删除 | note.clear | note.clear | 0.74 | pass |
| 367 | realtime-2-required | 把会议纪要追加到便签并开始录音 | note.write, recorder.start | note.write, recorder.start | 0.86 | pass |
| 368 | realtime-2-required | 添加待办订酒店，备注写靠近会场 | todo.add_item | todo.add_item | 0.88 | pass |
| 369 | realtime-2-required | 把复盘语音测试设为今天晚上九点提醒 | todo.add_item | todo.add_item | 0.72 | pass |
| 370 | realtime-2-required | 便签写下：轻松音乐要重新搜索 | note.write | note.write | 0.84 | pass |
| 371 | realtime-2-required | 给待办加一条关闭留言板不能发送关闭两个字 | todo.add_item | todo.add_item | 0.9 | pass |
| 372 | realtime-2-required | 把部署完成这项待办勾掉 | todo.complete_item | todo.complete_item | 0.9 | pass |
| 373 | realtime-2-required | 五分钟后提醒我看倒计时有没有声音 | countdown.set, todo.add_item | countdown.set, todo.add_item | 0.9 | pass |
| 374 | realtime-2-required | 便签新增一段英文 hello realtime，再打开翻译 | note.write, board.add_widget, translate.set_draft | note.write, board.add_widget, translate.set_draft | 0.85 | pass |
| 375 | realtime-2-required | 把桌面问题列表写入便签，编号从一开始 | note.write | note.write | 0.83 | pass |
| 376 | realtime-2-required | 添加待办：测试多轮语音不要重复回复 | todo.add_item | todo.add_item | 0.95 | pass |
| 377 | realtime-2-required | 把今天的新闻摘要追加到便签 | headline.request_refresh, note.write | headline.request_refresh, note.write | 0.9 | pass |
| 378 | realtime-2-required | 待办里添加查看 Apple Music token | todo.add_item | todo.add_item | 0.9 | pass |
| 379 | realtime-2-required | 清理已完成待办前先让我确认 | todo.clear_completed | todo.clear_completed | 0.92 | pass |
| 380 | realtime-2-required | 便签保存当前播放歌曲和天气城市 | note.write | note.write | 0.78 | pass |
| 381 | realtime-2-required | 把临时验证码 839201 存到剪贴板，不要发留言板 | clipboard.add_text | clipboard.add_text | 0.98 | pass |
| 382 | realtime-2-required | 复制演示账号 demo@example.com 到剪贴板并固定 | clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 383 | realtime-2-required | 清理普通剪贴板记录，保留固定内容 | clipboard.clear | clipboard.clear | 0.86 | pass |
| 384 | realtime-2-required | 把项目口令 demo-token 固定保存到剪贴板 | clipboard.add_text | clipboard.add_text | 0.96 | pass |
| 385 | realtime-2-required | 剪贴板添加一条 WiFi 密码提示但不要读出来 | clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 386 | realtime-2-required | 把刚才的搜索关键词复制到剪贴板 | clipboard.add_text | clipboard.add_text | 0.72 | pass |
| 387 | realtime-2-required | 清空剪贴板前先确认一次 | clipboard.clear | clipboard.clear | 0.9 | pass |
| 388 | realtime-2-required | 把会议链接存到剪贴板，并写入便签 | clipboard.add_text, note.write | clipboard.add_text, note.write | 0.9 | pass |
| 389 | realtime-2-required | 复制客服回复模板到剪贴板 | clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 390 | realtime-2-required | 固定保存 Vercel 项目名 xiaozhuoban | clipboard.add_text | clipboard.add_text | 0.93 | pass |
| 391 | realtime-2-required | 剪贴板里新增一条不要上传的本地路径 | clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 392 | realtime-2-required | 把 1234 临时验证码存起来，十分钟后提醒删除 | clipboard.add_text, countdown.set, todo.add_item | clipboard.add_text, countdown.set, todo.add_item | 0.92 | pass |
| 393 | realtime-2-required | 把当前歌曲名复制到剪贴板 | clipboard.add_text | clipboard.add_text | 0.86 | pass |
| 394 | realtime-2-required | 清理剪贴板里未固定的测试记录 | clipboard.clear | clipboard.clear | 0.78 | pass |
| 395 | realtime-2-required | 把翻译结果复制到剪贴板，但不要覆盖便签 | clipboard.add_text | clipboard.add_text | 0.74 | pass |
| 396 | realtime-2-required | 保存命令：打开表盘时钟 到剪贴板 | clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 397 | realtime-2-required | 复制今天日期到剪贴板并打开便签 | clipboard.add_text, board.add_widget | clipboard.add_text, board.add_widget, note.write | 0.88 | pass |
| 398 | realtime-2-required | 剪贴板新增一条部署 id 占位信息 | clipboard.add_text | clipboard.add_text | 0.9 | pass |
| 399 | realtime-2-required | 固定保存音乐登录状态检查步骤 | clipboard.add_text | clipboard.add_text | 0.82 | pass |
| 400 | realtime-2-required | 清理剪贴板后发一条完成提示 | clipboard.clear | clipboard.clear, messageBoard.send | 0.83 | pass |
| 401 | realtime-2-required | 把 hello world 翻译成中文，然后复制结果 | translate.set_draft, clipboard.add_text | translate.set_draft, clipboard.add_text | 0.93 | pass |
| 402 | realtime-2-required | 把今天适合出门吗翻译成英文 | translate.set_draft | translate.set_draft | 0.92 | pass |
| 403 | realtime-2-required | 计算十二乘十二，再把结果写进便签 | calculator.set_display, note.write | calculator.set_display, board.add_widget, note.write | 0.93 | pass |
| 404 | realtime-2-required | 2 斤是多少克，同时打开换算器 | converter.set | converter.set, board.add_widget | 0.9 | pass |
| 405 | realtime-2-required | 三点五公里换算成米 | converter.set | converter.set | 0.92 | pass |
| 406 | realtime-2-required | 把 good night realtime 翻译成中文 | translate.set_draft | translate.set_draft | 0.98 | pass |
| 407 | realtime-2-required | 计算 199 加 299，然后添加到剪贴板 | calculator.set_display, clipboard.add_text | calculator.set_display, clipboard.add_text | 0.96 | pass |
| 408 | realtime-2-required | 五美元大概是多少人民币，先打开换算器等待我确认汇率 | converter.set | board.add_widget, converter.set | 0.9 | pass |
| 409 | realtime-2-required | 把十平方米换算成平方厘米 | converter.set | converter.set | 0.98 | pass |
| 410 | realtime-2-required | 把一小时二十分钟换算成分钟 | converter.set | converter.set | 0.98 | pass |
| 411 | realtime-2-required | 翻译：close message board，不要执行关闭命令 | translate.set_draft | translate.set_draft | 0.99 | pass |
| 412 | realtime-2-required | 计算十五分钟加二十五分钟是多少 | calculator.set_display | calculator.set_display | 0.97 | pass |
| 413 | realtime-2-required | 把两公斤半换算成克 | converter.set | converter.set | 0.98 | pass |
| 414 | realtime-2-required | 把 Fahrenheit 68 转成摄氏度 | converter.set | converter.set | 0.99 | pass |
| 415 | realtime-2-required | 把播放轻松音乐翻译成英文 | translate.set_draft | translate.set_draft | 0.98 | pass |
| 416 | realtime-2-required | 计算 1024 除以 8，并显示在计算器 | calculator.set_display | calculator.set_display | 0.99 | pass |
| 417 | realtime-2-required | 把十二米换成公里再写到便签 | converter.set, note.write | converter.set, note.write | 0.95 | pass |
| 418 | realtime-2-required | 翻译一段：the music is still preview mode | translate.set_draft | translate.set_draft | 0.98 | pass |
| 419 | realtime-2-required | 把 0.9 以下交给 realtime 翻译成英文备忘 | translate.set_draft, note.write | translate.set_draft | 0.96 | fail: missing=note.write |
| 420 | realtime-2-required | 计算部署失败次数三加五再乘二 | calculator.set_display | calculator.set_display | 0.97 | pass |
| 421 | realtime-2-required | 刷新重大新闻，然后打开美股三大指数 | headline.request_refresh, market.set_indices | headline.request_refresh, board.add_widget, market.set_indices | 0.76 | pass |
| 422 | realtime-2-required | 看纳指和道指，顺便刷新财经新闻 | market.set_indices, headline.request_refresh | market.set_indices, headline.request_refresh | 0.72 | pass |
| 423 | realtime-2-required | 打开恒生和上证行情，不要自动开全球指数 | board.add_widget, market.set_indices | board.add_widget, market.set_indices | 0.74 | pass |
| 424 | realtime-2-required | 今天有什么头条新闻，结果追加到便签 | headline.request_refresh, note.write | headline.request_refresh, note.write | 0.75 | pass |
| 425 | realtime-2-required | 看美股三大指数，同时显示纽约时间 | market.set_indices, worldClock.set_zones | market.set_indices, worldClock.set_zones | 0.7 | pass |
| 426 | realtime-2-required | 只刷新新闻，不要打开行情窗口 | headline.request_refresh | headline.request_refresh | 0.78 | pass |
| 427 | realtime-2-required | 把新闻窗口放到右侧，行情放到左侧 | widget.move | widget.move | 0.73 | pass |
| 428 | realtime-2-required | 查询上证指数后把市场窗口置顶 | market.set_indices, widget.bring_to_front | market.set_indices, widget.bring_to_front, widget.focus | 0.77 | pass |
| 429 | realtime-2-required | 打开财经观察桌板并刷新重大新闻 | board.switch, headline.request_refresh | board.switch, headline.request_refresh | 0.68 | pass |
| 430 | realtime-2-required | 看恒生指数，如果没有行情工具就打开命令面板 | market.set_indices, app.command_palette.open | market.set_indices, app.command_palette.open | 0.66 | pass |
| 431 | realtime-2-required | 刷新新闻后发一句摘要到留言板 | headline.request_refresh, messageBoard.send | headline.request_refresh, messageBoard.send | 0.74 | pass |
| 432 | realtime-2-required | 全球指数不要刷新，先关闭那个小工具 | widget.remove | widget.remove | 0.76 | pass |
| 433 | realtime-2-required | 打开重大新闻但不要播放电视 | board.add_widget, headline.request_refresh | board.add_widget, headline.request_refresh | 0.78 | pass |
| 434 | realtime-2-required | 行情窗口太大了，缩小后显示纳指 | widget.resize, market.set_indices | widget.resize, market.set_indices | 0.73 | pass |
| 435 | realtime-2-required | 把新闻和天气并排放，我要看今天情况 | widget.move, weather.set_city, headline.request_refresh | headline.request_refresh, weather.set_city, widget.move | 0.82 | pass |
| 436 | realtime-2-required | 刷新头条后提醒我十五分钟后再看 | headline.request_refresh, countdown.set, todo.add_item | headline.request_refresh, countdown.set, todo.add_item | 0.96 | pass |
| 437 | realtime-2-required | 打开上证和深证行情，别误开音乐 | board.add_widget, market.set_indices | board.add_widget, market.set_indices | 0.94 | pass |
| 438 | realtime-2-required | 只显示美股指数，关闭港股窗口 | market.set_indices, widget.remove | market.set_indices, widget.remove | 0.9 | pass |
| 439 | realtime-2-required | 新闻刷新失败就记录到便签 | headline.request_refresh, note.write | headline.request_refresh, note.write | 0.88 | pass |
| 440 | realtime-2-required | 打开重大新闻小工具后马上聚焦它 | board.add_widget, headline.request_refresh, widget.focus | board.add_widget, headline.request_refresh, widget.focus | 0.92 | pass |
| 441 | realtime-2-required | 开始录音，并在便签写下会议开始 | recorder.start, note.write | recorder.start, note.write | 0.93 | pass |
| 442 | realtime-2-required | 停止录音后播放刚才录音检查声音 | recorder.stop, recorder.play | recorder.stop, recorder.play | 0.93 | pass |
| 443 | realtime-2-required | 暂停录音回放，同时把电视也暂停 | recorder.pause, tv.pause | recorder.pause, tv.pause | 0.94 | pass |
| 444 | realtime-2-required | 开始录一段测试音频，十秒后提醒我停止 | recorder.start, countdown.set, todo.add_item | recorder.start, countdown.set, todo.add_item | 0.92 | pass |
| 445 | realtime-2-required | 打开录音机但先不要开始录 | board.add_widget | board.add_widget | 0.9 | pass |
| 446 | realtime-2-required | 会议开始，打开录音机、便签和倒计时 | board.add_widget | board.add_widget | 0.88 | pass |
| 447 | realtime-2-required | 停止录音并把文件状态写到留言板 | recorder.stop, messageBoard.send | recorder.stop, messageBoard.send | 0.93 | pass |
| 448 | realtime-2-required | 播放刚才录音，如果没有录音就告诉我 | recorder.play | recorder.play, assistant.reply | 0.86 | pass |
| 449 | realtime-2-required | 录音机放到音乐旁边，避免遮住封面 | widget.move | widget.move | 0.9 | pass |
| 450 | realtime-2-required | 开始录音后把表盘时钟调成夜间模式 | recorder.start, dialClock.set_night_mode | recorder.start, dialClock.set_night_mode | 0.91 | pass |
| 451 | realtime-2-required | 暂停录音播放，再继续音乐 | recorder.pause, music.resume | recorder.pause, music.resume | 0.96 | pass |
| 452 | realtime-2-required | 帮我录一段语音命令复现过程 | recorder.start | recorder.start | 0.9 | pass |
| 453 | realtime-2-required | 停止录音并打开剪贴板保存测试编号 | recorder.stop, board.add_widget, clipboard.add_text | recorder.stop, board.add_widget, clipboard.add_text | 0.92 | pass |
| 454 | realtime-2-required | 录音之前先关闭电视声音 | tv.pause, recorder.start | tv.pause, recorder.start | 0.97 | pass |
| 455 | realtime-2-required | 开始录音，然后三分钟倒计时 | recorder.start, countdown.set | recorder.start, countdown.set | 0.95 | pass |
| 456 | realtime-2-required | 播放录音时把音乐暂停 | recorder.play, music.pause | music.pause, recorder.play | 0.95 | pass |
| 457 | realtime-2-required | 打开录音机，窗口放到左上角 | board.add_widget, widget.move | board.add_widget, widget.move | 0.93 | pass |
| 458 | realtime-2-required | 如果录音还在进行就先停止再播放 | recorder.stop, recorder.play | recorder.stop, recorder.play | 0.9 | pass |
| 459 | realtime-2-required | 会议结束，停止录音并追加纪要到便签 | recorder.stop, note.write | recorder.stop, note.write | 0.94 | pass |
| 460 | realtime-2-required | 录音回放暂停后聚焦待办窗口 | recorder.pause, widget.focus | recorder.pause, widget.focus | 0.91 | pass |
| 461 | realtime-2-required | 关闭留言板，不要把关闭两个字发出去 | widget.remove | widget.remove | 0.97 | pass |
| 462 | realtime-2-required | 留言板发送：我在测试多轮语音 | messageBoard.send | messageBoard.send | 0.98 | pass |
| 463 | realtime-2-required | 把留言板收起来，同时保留便签 | widget.remove | widget.remove | 0.9 | pass |
| 464 | realtime-2-required | 打开留言板并发送收到，不要关闭窗口 | board.add_widget, messageBoard.send | board.add_widget, messageBoard.send | 0.95 | pass |
| 465 | realtime-2-required | 留言板回复：部署完成后再测一次 | messageBoard.send | messageBoard.send | 0.97 | pass |
| 466 | realtime-2-required | 我说关闭留言板时执行关闭，不是发送消息 | widget.remove | widget.remove | 0.98 | pass |
| 467 | realtime-2-required | 把天气摘要发到留言板 | weather.set_city, messageBoard.send | weather.set_city, messageBoard.send | 0.7 | pass |
| 468 | realtime-2-required | 留言板发一句：音乐已经重新搜索 | messageBoard.send | messageBoard.send | 0.99 | pass |
| 469 | realtime-2-required | 先清空输入框，再发送测试通过 | messageBoard.send | messageBoard.clear_draft, messageBoard.send | 0.95 | pass |
| 470 | realtime-2-required | 关闭留言板后打开待办 | widget.remove, board.add_widget | widget.remove, board.add_widget | 0.9 | pass |
| 471 | realtime-2-required | 留言板不要重复发送刚才那句话 | assistant.reply | assistant.reply | 0.55 | pass |
| 472 | realtime-2-required | 发送一条包含英文 realtime ready 的留言 | messageBoard.send | messageBoard.send | 0.98 | pass |
| 473 | realtime-2-required | 把留言板移到底部，然后发送正在测试 | widget.move, messageBoard.send | widget.move, messageBoard.send | 0.88 | pass |
| 474 | realtime-2-required | 如果留言板没打开，先打开再发收到 | board.add_widget, messageBoard.send | board.add_widget, messageBoard.send | 0.82 | pass |
| 475 | realtime-2-required | 不要发消息，只把留言板窗口置顶 | widget.bring_to_front | widget.bring_to_front, widget.focus | 0.96 | pass |
| 476 | realtime-2-required | 留言板发送：十分钟后回来 | messageBoard.send | messageBoard.send | 0.99 | pass |
| 477 | realtime-2-required | 关闭留言板和新闻窗口 | widget.remove | widget.remove | 0.9 | pass |
| 478 | realtime-2-required | 把关闭留言板这个命令写到便签，不要执行 | note.write | note.write | 0.92 | pass |
| 479 | realtime-2-required | 发送消息前先确认内容是我在测试 | messageBoard.send | assistant.reply | 0.6 | fail: missing=messageBoard.send |
| 480 | realtime-2-required | 留言板窗口太碍事了，直接收起来 | widget.remove | widget.remove | 0.97 | pass |
| 481 | realtime-2-required | 播放陈奕迅十年，同时查上海天气并写到便签 | music.play, weather.set_city, note.write | music.play, weather.set_city, note.write | 0.9 | pass |
| 482 | realtime-2-required | 打开电视 CCTV13，再刷新新闻，最后暂停音乐 | board.add_widget, tv.select_channel, headline.request_refresh, music.pause | board.add_widget, tv.select_channel, tv.play, headline.request_refresh, music.pause | 0.86 | pass |
| 483 | realtime-2-required | 查北京天气，如果适合出门就加待办买咖啡 | weather.set_city, todo.add_item | weather.set_city, todo.add_item | 0.78 | pass |
| 484 | realtime-2-required | 打开市场行情、重大新闻和纽约时间，排成一列 | board.add_widget, market.set_indices, headline.request_refresh, worldClock.set_zones, board.auto_align | board.add_widget, market.set_indices, headline.request_refresh, worldClock.set_zones, widget.move | 0.82 | fail: missing=board.auto_align |
| 485 | realtime-2-required | 开始录音，设四十五分钟倒计时，并打开会议便签 | recorder.start, countdown.set, board.add_widget | recorder.start, countdown.set, board.add_widget, note.write | 0.84 | pass |
| 486 | realtime-2-required | 搜索轻松音乐但先不播放，然后打开待办 | board.add_widget, music.search | music.search, board.add_widget, todo.add_item | 0.83 | pass |
| 487 | realtime-2-required | 把 hello world 翻译成中文，再复制到剪贴板 | translate.set_draft, clipboard.add_text | translate.set_draft, clipboard.add_text | 0.92 | pass |
| 488 | realtime-2-required | 新建旅行桌板，打开杭州天气和东京时间 | board.create, board.add_widget, weather.set_city, worldClock.set_zones | board.create, board.add_widget, weather.set_city, worldClock.set_zones | 0.88 | pass |
| 489 | realtime-2-required | 关闭留言板，再把音乐播放器放最前 | widget.remove, widget.bring_to_front | widget.remove, widget.focus, widget.bring_to_front | 0.85 | pass |
| 490 | realtime-2-required | 播放王菲红豆后，三分钟后提醒我检查是否试听 | music.play, countdown.set, todo.add_item | music.play, countdown.set, todo.add_item | 0.84 | pass |
| 491 | realtime-2-required | 打开表盘时钟而不是世界时钟，然后隐藏侧栏 | board.add_widget, app.sidebar.set | board.add_widget, dialClock.set_night_mode, app.sidebar.set | 0.9 | pass |
| 492 | realtime-2-required | 把电视切到 CCTV5，再把体育新闻刷新一下 | tv.select_channel, headline.request_refresh | tv.select_channel, headline.request_refresh | 0.76 | pass |
| 493 | realtime-2-required | 清理剪贴板普通记录，再把项目口令固定 | clipboard.clear, clipboard.add_text | clipboard.clear, clipboard.add_text | 0.83 | pass |
| 494 | realtime-2-required | 添加待办提交报告，同时明早九点提醒 | todo.add_item | todo.add_item, countdown.set | 0.78 | pass |
| 495 | realtime-2-required | 计算两公斤是多少克，把结果发到留言板 | converter.set, messageBoard.send | converter.set, messageBoard.send | 0.9 | pass |
| 496 | realtime-2-required | 天气改成武汉，世界时钟改成北京伦敦纽约 | weather.set_city, worldClock.set_zones | weather.set_city, worldClock.set_zones | 0.95 | pass |
| 497 | realtime-2-required | 把音乐暂停，开始录音，然后打开倒计时 | music.pause, recorder.start, board.add_widget | music.pause, recorder.start, board.add_widget | 0.92 | pass |
| 498 | realtime-2-required | 新建学习桌板并打开翻译、计算器、便签 | board.create, board.add_widget | board.create, board.add_widget | 0.93 | pass |
| 499 | realtime-2-required | 刷新新闻后把摘要追加到便签并复制 | headline.request_refresh, note.write, clipboard.add_text | headline.request_refresh, note.write, clipboard.add_text | 0.9 | pass |
| 500 | realtime-2-required | 退出全屏，显示侧边栏，再整理桌面 | app.fullscreen.set, app.sidebar.set, board.auto_align | app.fullscreen.set, app.sidebar.set, board.auto_align | 0.94 | pass |
| 501 | realtime-2-required | 打开时钟，啊不是世界时钟，是那个表盘时钟 | board.add_widget | board.add_widget, dialClock.set_night_mode | 0.96 | pass |
| 502 | realtime-2-required | 播放十年，不对，是陈奕迅的十年 | music.play | music.play | 0.97 | pass |
| 503 | realtime-2-required | 关闭留言，准确说关闭留言板窗口 | widget.remove | widget.remove | 0.98 | pass |
| 504 | realtime-2-required | 我想听轻松音乐，别继续上一首，重新搜 | music.search | music.search | 0.96 | pass |
| 505 | realtime-2-required | 打开天气，城市先用北京，刚才说错了不是上海 | board.add_widget, weather.set_city | board.add_widget, weather.set_city | 0.95 | pass |
| 506 | realtime-2-required | 把电视全屏，等下先别全屏，先切 CCTV5 | tv.select_channel | tv.select_channel | 0.93 | pass |
| 507 | realtime-2-required | 添加待办买票，哦再加一条订酒店 | todo.add_item | todo.add_item | 0.98 | pass |
| 508 | realtime-2-required | 翻译 close message board，只翻译不要执行 | translate.set_draft | translate.set_draft | 0.97 | pass |
| 509 | realtime-2-required | 搜索王菲红豆，如果识别成王飞请改成王菲 | music.search | music.search | 0.96 | pass |
| 510 | realtime-2-required | 打开表盘时钟，别打开全球时钟列表 | board.add_widget | board.add_widget, dialClock.set_night_mode | 0.97 | pass |
| 511 | realtime-2-required | 我刚说关闭，其实是关闭留言板 | widget.remove | widget.remove | 0.92 | pass |
| 512 | realtime-2-required | 音乐上一首不是我要的，重新搜周杰伦晴天 | music.search | music.search | 0.93 | pass |
| 513 | realtime-2-required | 把天气改成杭州，不是广州 | weather.set_city | weather.set_city | 0.96 | pass |
| 514 | realtime-2-required | 我要整理桌面，记得需要弹确认 | board.auto_align | board.auto_align | 0.9 | pass |
| 515 | realtime-2-required | 录音先暂停，不对，是暂停回放 | recorder.pause | recorder.pause | 0.94 | pass |
| 516 | realtime-2-required | 新闻别打开全球指数，只要重大新闻 | headline.request_refresh | headline.request_refresh | 0.91 | pass |
| 517 | realtime-2-required | 把计算器放大，算了先聚焦就行 | widget.focus | widget.focus | 0.9 | pass |
| 518 | realtime-2-required | 播放 CCTV1，不是 CCTV13 | tv.play | board.add_widget, tv.select_channel, tv.play | 0.9 | pass |
| 519 | realtime-2-required | 写到便签：关闭留言板，不要真的关闭 | note.write | note.write | 0.95 | pass |
| 520 | realtime-2-required | 如果你没把握，交给 realtime 解析 | assistant.reply | assistant.runtime_diagnostics | 0.7 | fail: missing=assistant.reply |
| 521 | realtime-2-required | 清空便签内容，但必须先问我确认 | note.clear | note.clear | 0.88 | pass |
| 522 | realtime-2-required | 整理桌面所有小工具，等我确认后再执行 | board.auto_align | board.auto_align | 0.89 | pass |
| 523 | realtime-2-required | 清理剪贴板普通记录，不要删固定项 | clipboard.clear | clipboard.clear | 0.78 | pass |
| 524 | realtime-2-required | 关闭音乐和电视之前先确认一次 | widget.remove | music.pause, tv.pause | 0.76 | fail: missing=widget.remove |
| 525 | realtime-2-required | 删除临时倒计时，保留正在运行的那个 | widget.remove | widget.remove | 0.82 | pass |
| 526 | realtime-2-required | 清空待办已完成项，需要弹确认 | todo.clear_completed | todo.clear_completed | 0.96 | pass |
| 527 | realtime-2-required | 关闭全部新闻和行情窗口，确认后执行 | widget.remove | widget.remove | 0.74 | pass |
| 528 | realtime-2-required | 把留言板收起来但不要删除历史消息 | widget.remove | widget.remove | 0.71 | pass |
| 529 | realtime-2-required | 重置倒计时前先告诉我当前状态 | assistant.runtime_diagnostics, countdown.reset | assistant.reply | 0.62 | fail: missing=assistant.runtime_diagnostics,countdown.reset |
| 530 | realtime-2-required | 清空搜索结果不要影响播放中的歌曲 | assistant.reply | assistant.reply | 0.55 | pass |
| 531 | realtime-2-required | 关闭所有临时小工具，保留桌板 | widget.remove | widget.remove | 0.67 | pass |
| 532 | realtime-2-required | 把便签清空并写新内容，先确认清空 | note.clear, note.write | note.clear, note.write | 0.93 | pass |
| 533 | realtime-2-required | 清理剪贴板时保留 pinned 内容 | clipboard.clear | clipboard.clear | 0.66 | pass |
| 534 | realtime-2-required | 撤销刚才的关闭动作，如果不能撤销就提示 | assistant.reply | assistant.reply | 0.6 | pass |
| 535 | realtime-2-required | 自动整理桌面后不要改变全屏状态 | board.auto_align | board.auto_align | 0.86 | pass |
| 536 | realtime-2-required | 关闭电视直播，但不要清除频道选择 | tv.pause | tv.pause | 0.82 | pass |
| 537 | realtime-2-required | 停止录音前确认当前是否正在录 | assistant.runtime_diagnostics, recorder.stop | assistant.reply | 0.61 | fail: missing=assistant.runtime_diagnostics,recorder.stop |
| 538 | realtime-2-required | 删除临时桌板之前先让我确认 | board.delete | board.delete | 0.83 | pass |
| 539 | realtime-2-required | 清除留言板输入框，不要发送空消息 | messageBoard.clear_draft | messageBoard.clear_draft | 0.95 | pass |
| 540 | realtime-2-required | 关闭全部媒体小工具前先弹统一确认 | widget.remove | widget.remove | 0.7 | pass |
| 541 | realtime-2-required | 把表盘时钟调暗一点，进入夜间模式 | dialClock.set_night_mode | dialClock.set_night_mode | 0.97 | pass |
| 542 | realtime-2-required | 音乐封面太小了，把播放器面板放大 | widget.resize | widget.resize | 0.92 | pass |
| 543 | realtime-2-required | 电视窗口太挡眼，缩小并放到右上角 | widget.resize, widget.move | widget.resize, widget.move | 0.94 | pass |
| 544 | realtime-2-required | 隐藏侧栏让桌面更宽，但保留所有小工具 | app.sidebar.set | app.sidebar.set | 0.96 | pass |
| 545 | realtime-2-required | 把音乐播放控件居中，登录按钮别挡封面 | widget.move | widget.move | 0.9 | pass |
| 546 | realtime-2-required | 倒计时声音太像计时器，先暂停倒计时 | countdown.pause | countdown.pause | 0.98 | pass |
| 547 | realtime-2-required | 把天气卡片放大一点方便读温度 | widget.resize | widget.resize | 0.95 | pass |
| 548 | realtime-2-required | 把新闻窗口缩小，避免挡住便签 | widget.resize, widget.move | widget.resize | 0.93 | fail: missing=widget.move |
| 549 | realtime-2-required | 音乐窗口不要全屏，只把封面放大 | widget.resize | widget.resize | 0.9 | pass |
| 550 | realtime-2-required | 把表盘放到中间并打开夜间模式 | widget.move, dialClock.set_night_mode | widget.move, dialClock.set_night_mode | 0.96 | pass |
| 551 | realtime-2-required | 电视全屏时隐藏侧边栏 | app.sidebar.set, tv.fullscreen | tv.fullscreen, widget.fullscreen_focus, app.sidebar.set | 0.97 | pass |
| 552 | realtime-2-required | 把世界时钟文字放大，显示北京伦敦纽约 | widget.resize, worldClock.set_zones | worldClock.set_zones, widget.resize | 0.96 | pass |
| 553 | realtime-2-required | 让待办窗口宽一点，长文本不要折断 | widget.resize | widget.resize | 0.95 | pass |
| 554 | realtime-2-required | 把剪贴板窗口移到右侧并缩窄 | widget.move, widget.resize | widget.move, widget.resize | 0.96 | pass |
| 555 | realtime-2-required | 显示侧边栏，但不要压缩音乐封面 | app.sidebar.set | app.sidebar.set | 0.9 | pass |
| 556 | realtime-2-required | 退出全屏后把音乐播放器恢复正常大小 | app.fullscreen.set, widget.resize | app.fullscreen.set, widget.resize | 0.86 | pass |
| 557 | realtime-2-required | 让录音机窗口别盖住倒计时 | widget.move | widget.move | 0.84 | pass |
| 558 | realtime-2-required | 把翻译窗口调宽，方便输入长英文 | widget.resize | widget.resize | 0.9 | pass |
| 559 | realtime-2-required | 把桌面布局排紧凑一点 | board.auto_align | board.auto_align | 0.88 | pass |
| 560 | realtime-2-required | 音乐登录按钮放右上角但不要覆盖封面 | widget.move | widget.move | 0.78 | pass |
| 561 | realtime-2-required | 新建今日计划桌板，打开待办、便签和天气 | board.create, board.add_widget, weather.set_city | board.create, board.add_widget, weather.set_city | 0.83 | pass |
| 562 | realtime-2-required | 写下今天三件事：部署、测试、复盘 | note.write | note.write | 0.95 | pass |
| 563 | realtime-2-required | 设二十五分钟专注倒计时并播放轻音乐 | countdown.set, music.play | countdown.set, music.play | 0.92 | pass |
| 564 | realtime-2-required | 把九点开会添加到待办并开始录音准备 | todo.add_item, recorder.start | todo.add_item, recorder.start | 0.89 | pass |
| 565 | realtime-2-required | 刷新新闻后只把重要事项写到便签 | headline.request_refresh, note.write | headline.request_refresh, note.write | 0.82 | pass |
| 566 | realtime-2-required | 把复盘 realtime 断线问题加入待办 | todo.add_item | todo.add_item | 0.96 | pass |
| 567 | realtime-2-required | 十五分钟后提醒我查看监控脚本日志 | countdown.set, todo.add_item | countdown.set, todo.add_item | 0.9 | pass |
| 568 | realtime-2-required | 打开项目冲刺桌板并整理窗口 | board.switch, board.auto_align | board.switch, board.auto_align | 0.9 | pass |
| 569 | realtime-2-required | 把部署 id 复制到剪贴板并固定 | clipboard.add_text | clipboard.add_text | 0.94 | pass |
| 570 | realtime-2-required | 查上海天气决定下午是否出门 | weather.set_city | weather.set_city | 0.93 | pass |
