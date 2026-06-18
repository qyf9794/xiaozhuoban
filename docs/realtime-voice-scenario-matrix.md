# Realtime Voice Scenario Matrix

Purpose: cover clearly different Realtime voice paths so regressions do not hide behind one repeated command shape.

## Scenario Groups

1. Cache and stale UI state
   - Open `/app` after a previous failed command.
   - Expected: voice operation returns to standby after the terminal feedback window; old music failures such as Taylor Swift or previous test commands are not shown as fresh failures.
   - Expected: non-music widget names previously leaked into the music query, such as `世界时钟`, are cleared and do not trigger music search.

2. Music search and playback
   - Command: `播放王菲的你我经历的一刻`.
   - Expected: route to `music.play`, query normalized to `王菲 你我经历的一刻`, selected result prefers a song, and the player attempts Apple Music playback when logged in.
   - Command: `播放陈奕迅的十年`.
   - Expected: route to `music.play`, query normalized to `陈奕迅 十年`, no “没有工具” reply.
   - Command: `我想听点轻松的音乐`.
   - Expected: low-confidence casual request goes through Realtime planning, but final music query is `轻松`, not `我 轻松`.

3. Widget opening
   - Command: `打开钟表`.
   - Expected: choose `board.add_widget` for `dialClock`; do not search music.
   - Command: `打开世界时钟`.
   - Expected: choose `board.add_widget` for `worldClock`; do not search music.
   - Command: `打开电视`.
   - Expected: choose `board.add_widget` for `tv`; no “没有工具” reply.

4. Desktop shell controls
   - Command: `隐藏侧栏`.
   - Expected: choose `app.sidebar.set`.
   - Command: `打开设置`.
   - Expected: choose `app.settings.open`.

5. Cross-widget contamination guard
   - Start with music focused and a non-music command: `打开钟表`.
   - Expected: Realtime still selects `board.add_widget`, and music search input remains unchanged or is cleared if it contained a known widget name.

## Verification Notes

- Voice tests must be short-lived: connect only during the scenario, then disconnect.
- Capture diagnostics for `realtime.voice.user_transcript`, `assistant.operation`, `music.tool.play.request`, `music.play.result`, and `realtime.runtime.disconnect`.
- Treat “connection succeeded” alone as insufficient; each scenario must prove the chosen tool and visible UI outcome.
