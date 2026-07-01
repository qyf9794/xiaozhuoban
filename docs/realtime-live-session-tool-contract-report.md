# Realtime Live Session Tool Contract Report

- Date: 2026-07-01T15:47:14.753Z
- Model: gpt-realtime-2
- Mode: live
- Cases: 5/5 passed
- Secret handling: Realtime credentials are never written to this report.

| id | command | selected | scoped_call | result |
| --- | --- | --- | --- | --- |
| recent_countdown_5m | 倒计时5分钟 | {"selectedTool":"countdown.set","selectedModule":"countdown","targetHint":"倒计时5分钟","confidence":0.98} | {"toolName":"countdown.set","arguments":{"totalSeconds":300,"start":true}} | pass |
| recent_music_wangfei | 我想听王菲的歌 | {"selectedTool":"music.search","selectedModule":"music","targetHint":"王菲","confidence":0.98} | {"toolName":"music.search","arguments":{"query":"王菲","start":true}} | pass |
| recent_tv_bbc | 我想看BBC | {"selectedTool":"tv.select_channel","selectedModule":"tv","targetHint":"BBC","confidence":0.96} | {"toolName":"tv.select_channel","arguments":{"channelName":"BBC","start":true}} | pass |
| recent_close_message_board | 关闭留言板 | {"selectedTool":"widget.remove","selectedModule":"widget","targetHint":"关闭留言板","confidence":0.98} | {"toolName":"widget.remove","arguments":{"targetHint":"messageBoard","targetText":"关闭留言板"}} | pass |
| recent_weather_shanghai | 上海天气 | {"selectedTool":"weather.set_city","selectedModule":"weather","targetHint":"上海天气","confidence":0.98} | {"toolName":"weather.set_city","arguments":{"city":"上海","query":"上海天气","targetHint":"weather"}} | pass |
