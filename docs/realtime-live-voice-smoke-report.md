# Realtime Live Voice Smoke Report

- Run: 2026-06-30T16-26-21-937Z
- Model: gpt-realtime-2
- Transport: Chrome fake microphone -> WebRTC Realtime session -> data channel
- Total: 10
- Passed: 10
- Failed: 0
- Function-call commands: 10/10
- Audio fixtures: tests/audio/realtime-live-smoke/*-vad.wav
- Evidence root: output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z
- Secret handling: Realtime credentials are never written to this report.

| id | result | spoken command | transcript | tools | failure | evidence |
|---|---|---|---|---|---|---|
| 01 | pass | 关闭留言板 | 關閉留言板 | widget.remove, assistant.select_tool | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/01/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/01/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/01/trace.json) |
| 02 | pass | 打开音乐播放器 | 打开音乐播放器 | board.add_widget, assistant.select_tool | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/02/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/02/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/02/trace.json) |
| 03 | pass | 我想听王菲的歌 | 我想听王菲的歌。 | music.play, board.add_widget, assistant.select_tool, music | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/03/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/03/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/03/trace.json) |
| 04 | pass | 暂停音乐 | 暂停音乐 | music.pause, board.add_widget, assistant.select_tool, music | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/04/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/04/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/04/trace.json) |
| 05 | pass | 上海天气 | 上海天氣 | weather.set_city, board.add_widget, assistant.select_tool | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/05/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/05/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/05/trace.json) |
| 06 | pass | 打开便签 | 打開便簽 | board.add_widget, assistant.select_tool | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/06/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/06/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/06/trace.json) |
| 07 | pass | 帮我记一下今天测试语音 | 幫我記一下今天測試語音 | note.write, board.add_widget, assistant.select_tool | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/07/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/07/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/07/trace.json) |
| 08 | pass | 十分钟后提醒我 | 十分鐘後提醒我 | countdown.set, board.add_widget, assistant.select_tool | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/08/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/08/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/08/trace.json) |
| 09 | pass | 打开电视然后全屏 | 打開電視然後全屏 | board.add_widget, assistant.select_tool | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/09/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/09/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/09/trace.json) |
| 10 | pass | 关闭所有小工具 | 關閉所有小工具 | widget.remove, assistant.select_tool | - | [before](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/10/before.png) / [after](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/10/after.png) / [trace](output/playwright/realtime-live-voice-smoke/2026-06-30T16-26-21-937Z/10/trace.json) |
