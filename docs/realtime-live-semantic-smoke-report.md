# Realtime-2 Live Semantic Gate Report

- Date: 2026-06-30T15:28:15.036Z
- Model: gpt-realtime-2
- Credential source: local-openai-api-key
- Transport: OpenAI Realtime WebSocket
- Cases: 7/7 passed
- Secret handling: Realtime credentials are never written to this report.

| id | command | mode | expected | actual | result |
| --- | --- | --- | --- | --- | --- |
| music_entity_exact | 播放王菲的红豆 | select | music.search, music.play | {"functionName":"assistant.select_tool","name":"music.search","selectedModule":"music","confidence":0.99,"targetHint":"王菲 红豆"} | pass |
| music_mood_research | 我想听点轻松的音乐 | select | music.search, music.play | {"functionName":"assistant.select_tool","name":"music.search","selectedModule":"music","confidence":0.96,"targetHint":"轻松的音乐"} | pass |
| close_message_board | 关闭留言板 | select | widget.remove | {"functionName":"assistant.select_tool","name":"widget.remove","selectedModule":"messageBoard","confidence":0.99,"targetHint":"关闭留言板"} | pass |
| open_default_clock | 打开时钟 | select | board.add_widget | {"functionName":"assistant.select_tool","name":"board.add_widget","selectedModule":"dialClock","confidence":0.98,"targetHint":"打开 时钟"} | pass |
| hide_sidebar | 隐藏侧边栏 | select | app.sidebar.set | {"functionName":"assistant.select_tool","name":"app.sidebar.set","selectedModule":"app","confidence":0.95,"targetHint":"隐藏侧边栏"} | pass |
| organize_desktop | 整理桌面 | select | board.auto_align | {"functionName":"assistant.select_tool","name":"board.auto_align","selectedModule":"board","confidence":0.98,"targetHint":"整理桌面"} | pass |
| music_weather_plan | 播放陈奕迅的十年，然后查上海天气 | plan | music.search, weather.current | {"functionName":"assistant.select_command_plan","names":["music.search","weather.current"],"targets":["播放 陈奕迅 的 十年","查询 上海 天气"]} | pass |
