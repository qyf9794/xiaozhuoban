# Realtime-2 Live Semantic Catalog 7 Selected Report

- Date: 2026-06-19T16:49:48.450Z
- Model: gpt-realtime-2
- Credential source: production-ephemeral-token
- Source site: https://xiaozhuoban.bqxb.org
- Cases: 7/7 passed
- Batch size: 7
- Secret handling: Realtime credentials are never written to this report.

## Failure Summary

None.

## Failures

None.

## Per-Command Results

| id | route | command | expected | actual | confidence | result |
| --- | --- | --- | --- | --- | --- | --- |
| 125 | realtime-2-required | 一分半以后叫我，场景1 | anyOf=todo.add_item/countdown.set | countdown.set, todo.add_item | 0.9 | pass |
| 259 | realtime-2-required | 把音乐窗口退出全屏，然后调整到宽度 520 | anyOf=app.fullscreen.set/widget.resize | app.fullscreen.set, widget.resize | 0.76 | pass |
| 399 | realtime-2-required | 固定保存音乐登录状态检查步骤 | anyOf=clipboard.add_text/note.write; forbid=music.auth_status | assistant.runtime_diagnostics | 0.78 | pass: recoverable_non_action |
| 454 | realtime-2-required | 录音之前先关闭电视声音 | must=tv.pause,recorder.start | tv.pause, recorder.start | 0.92 | pass |
| 493 | realtime-2-required | 清理剪贴板普通记录，再把项目口令固定 | anyOf=clipboard.clear/clipboard.add_text | clipboard.clear, clipboard.add_text | 0.74 | pass |
| 536 | realtime-2-required | 关闭电视直播，但不要清除频道选择 | must=tv.pause | tv.pause | 0.86 | pass |
| 623 | realtime-2-required | 播放轻松音乐前只加载音乐相关工具，不要全量发送 | anyOf=music.search/music.play | board.add_widget, music.play | 0.88 | pass |
