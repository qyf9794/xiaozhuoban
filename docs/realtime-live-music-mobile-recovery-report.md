# Realtime Live Voice Smoke Report

- Run: 2026-07-18T09-54-42-730Z
- Model: gpt-realtime-2
- Transport: Chrome fake microphone -> WebRTC Realtime session -> data channel
- Autoplay policy: browser default policy enforced
- Simulated media autoplay-block recovery: not requested
- Simulated mobile MusicKit recovery: 1/1
- Total: 1
- Passed: 1
- Failed: 0
- Function-call commands: 1/1
- Tool exposure traces: 1/1
- Selected tools inside exposedTools: 1/1
- Scoped session.updated closures: 1/1
- Local shortcut closures after selection: 0/1
- Fallback execute_command uses: 0
- Audio fixtures: tests/audio/realtime-live-music-switch
- Playback audio fixture: tests/audio/realtime-live-music-switch/playback-melody.wav
- Music success rule: music.play.result=success, playbackVerified=true, media clock advanced, title visible, and progress bar above zero.
- TV success rule: tv.play.result=success, playbackVerified=true, channel matches, video is not paused, media clock advanced, and decoded video dimensions are above zero.
- Realtime lifecycle: one Chrome/Realtime session per case
- Evidence root: output/playwright/realtime-live-music-mobile-recovery/2026-07-18T09-54-42-730Z
- Secret handling: Realtime credentials are never written to this report.

| id | result | spoken command | transcript | exposed modules | exposed tools | selected tool | function tools | query args | channel args | widgetIds | music playback/token | actual playback | progress visible | tv playback | UI changed | realtime path | failure | evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MM01 | pass | 打开音乐播放器，先播放王菲的红豆 | 音乐播放季,先播放王菲的红豆。 | music, tv | music.play, music.next, music.pause, music.previous, music.resume, board.add_widget, tv.fullscreen, tv.pause, tv.play, tv.select_channel, widget.focus | music.play | board.add_widget | 王菲 红豆 | - | wi_1784368494826_8fxe6cpp | music.search.result success source=apple musicKit=true authorized=true<br>music.play.start started source=apple musicKit=true authorized=true preview=false<br>music.play.start started source=apple musicKit=true authorized=true<br>music.play.result failed source=apple musicKit=true authorized=true verified=false error=BROWSER_PLAYBACK_BLOCKED<br>music.search.result success source=apple musicKit=true authorized=true<br>music.play.start started source=apple musicKit=true authorized=true<br>music.play.result success source=apple musicKit=true authorized=true verified=true advanced=0.054s | music yes (0.054s) | yes | - | yes (1->2) | exposure / selected_exposed / scoped_updated | - | [before](output/playwright/realtime-live-music-mobile-recovery/2026-07-18T09-54-42-730Z/MM01/before.png) / [after](output/playwright/realtime-live-music-mobile-recovery/2026-07-18T09-54-42-730Z/MM01/after.png) / [trace](output/playwright/realtime-live-music-mobile-recovery/2026-07-18T09-54-42-730Z/MM01/trace.json) |
