# Realtime Live Voice Smoke Report

- Run: 2026-07-17T13-39-27-617Z
- Model: gpt-realtime-2
- Transport: Chrome fake microphone -> WebRTC Realtime session -> data channel
- Total: 2
- Passed: 2
- Failed: 0
- Function-call commands: 2/2
- Tool exposure traces: 2/2
- Selected tools inside exposedTools: 2/2
- Scoped session.updated closures: 2/2
- Local shortcut closures after selection: 0/2
- Fallback execute_command uses: 0
- Audio fixtures: tests/audio/realtime-live-focused-media-candidates
- Playback audio fixture: tests/audio/realtime-live-focused-media-candidates/playback-melody.wav
- Music success rule: music.play.result=success, playbackVerified=true, media clock advanced, title visible, and progress bar above zero.
- Realtime lifecycle: pass; session.created=1; transcripts=2; disconnects before final=0; manual disconnects=1; disconnected statuses=1; batch ids=rtb_59ec0727-8669-4de3-ac22-adaf64d21ee7
- Evidence artifacts: cleaned after validation; this summary is the retained record.
- Secret handling: Realtime credentials are never written to this report.

| id | result | spoken command | transcript | exposed modules | exposed tools | selected tool | function tools | query args | channel args | widgetIds | music playback/token | actual playback | progress visible | tv playback | UI changed | realtime path | failure | evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | pass | 打开音乐播放器，先播放王菲的红豆 | 第一月播放起,先播放王菲的《紅豆》。 | music, tv | music.play, music.next, music.pause, music.previous, music.resume, board.add_widget, tv.fullscreen, tv.pause, tv.play, tv.select_channel, widget.focus | music.play | music.play | 王菲 红豆 | - | wi_1784295569778_30e70k1h | music.search.result success source=itunes musicKit=false authorized=false<br>music.play.start started source=itunes musicKit=false authorized=false preview=true<br>music.play.result success source=itunes musicKit=false authorized=false verified=true advanced=0.102s<br>music.search.result success source=itunes musicKit=false authorized=false | yes (0.102s) | yes | - | yes (2->2) | exposure / selected_exposed / scoped_updated | - | [before](output/playwright/realtime-live-focused-media-candidates/2026-07-17T13-39-27-617Z/C01/before.png) / [after](output/playwright/realtime-live-focused-media-candidates/2026-07-17T13-39-27-617Z/C01/after.png) / [trace](output/playwright/realtime-live-focused-media-candidates/2026-07-17T13-39-27-617Z/C01/trace.json) |
| C02 | pass | 播放电视 BBC News | 播放電視BBC News | tv, music | music.play, tv.play, tv.select_channel, music.next, music.pause, music.previous, music.resume, tv.fullscreen, tv.pause, board.add_widget, widget.focus | tv.play | board.add_widget | - | BBC | - | - | no | yes | realtime.tool_selection.success success tool=tv.play<br>realtime.tool_selection.result_deferred pending_session_update tool=tv.play<br>realtime.function_call.add_widget_follow_up received tool=tv.play channel=BBC<br>assistant.operation success tool=board.add_widget 已添加小工具，已切到频道，请手动点击播放<br>realtime.tool_result.send success tool=board.add_widget 已添加小工具，已切到频道，请手动点击播放 | yes (2->3) | exposure / selected_exposed / scoped_updated | - | [before](output/playwright/realtime-live-focused-media-candidates/2026-07-17T13-39-27-617Z/C02/before.png) / [after](output/playwright/realtime-live-focused-media-candidates/2026-07-17T13-39-27-617Z/C02/after.png) / [trace](output/playwright/realtime-live-focused-media-candidates/2026-07-17T13-39-27-617Z/C02/trace.json) |
