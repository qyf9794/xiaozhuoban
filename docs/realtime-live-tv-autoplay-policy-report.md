# Realtime Live Voice Smoke Report

- Run: 2026-07-18T09-00-55-187Z
- Model: gpt-realtime-2
- Transport: Chrome fake microphone -> WebRTC Realtime session -> data channel
- Autoplay policy: browser default policy enforced
- Total: 1
- Passed: 1
- Failed: 0
- Function-call commands: 1/1
- Tool exposure traces: 1/1
- Selected tools inside exposedTools: 1/1
- Scoped session.updated closures: 1/1
- Local shortcut closures after selection: 0/1
- Fallback execute_command uses: 0
- Audio fixtures: tests/audio/realtime-live-tv-switch
- Playback audio fixture: tests/audio/realtime-live-tv-switch/playback-tv.mp4
- Music success rule: music.play.result=success, playbackVerified=true, media clock advanced, title visible, and progress bar above zero.
- TV success rule: tv.play.result=success, playbackVerified=true, channel matches, video is not paused, media clock advanced, and decoded video dimensions are above zero.
- Realtime lifecycle: one Chrome/Realtime session per case
- Evidence root: output/playwright/realtime-live-tv-autoplay-policy/2026-07-18T09-00-55-187Z
- Secret handling: Realtime credentials are never written to this report.

| id | result | spoken command | transcript | exposed modules | exposed tools | selected tool | function tools | query args | channel args | widgetIds | music playback/token | actual playback | progress visible | tv playback | UI changed | realtime path | failure | evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TVA01 | pass | 打开电视，播放 B B C News | 播放BBC新聞 | headline, tv, music | headline.request_refresh, tv.play, tv.select_channel, music.play, tv.fullscreen, tv.pause, board.add_widget, music.next, music.pause, music.previous, music.resume, widget.focus | tv.play | board.add_widget | - | BBC News | wi_1784365269005_xeeggh0q | - | TV yes (0.089s) | no | realtime.tool_selection.success success tool=tv.play<br>realtime.tool_selection.result_deferred pending_session_update tool=tv.play<br>realtime.function_call.add_widget_follow_up received tool=tv.play channel=BBC News<br>assistant.operation success tool=board.add_widget 已添加小工具，已播放电视<br>realtime.tool_result.send success tool=board.add_widget 已添加小工具，已播放电视 | yes (1->2) | exposure / selected_exposed / scoped_updated | - | [before](output/playwright/realtime-live-tv-autoplay-policy/2026-07-18T09-00-55-187Z/TVA01/before.png) / [after](output/playwright/realtime-live-tv-autoplay-policy/2026-07-18T09-00-55-187Z/TVA01/after.png) / [trace](output/playwright/realtime-live-tv-autoplay-policy/2026-07-18T09-00-55-187Z/TVA01/trace.json) |
