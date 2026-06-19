# Realtime-2 Live Semantic Catalog 3 Selected Report

- Date: 2026-06-19T23:23:17.587Z
- Model: gpt-realtime-2
- Credential source: production-ephemeral-token
- Source site: https://xiaozhuoban.bqxb.org
- Cases: 3/3 passed
- Batch size: 3
- Secret handling: Realtime credentials are never written to this report.

## Failure Summary

None.

## Failures

None.

## Per-Command Results

| id | route | command | expected | actual | confidence | result |
| --- | --- | --- | --- | --- | --- | --- |
| 212 | realtime-2-required | 我刚才误触全屏了，恢复普通窗口并聚焦便签 | anyOf=app.fullscreen.set/widget.focus/widget.resize/widget.move/widget.bring_to_front | app.fullscreen.set, widget.resize, widget.focus | 0.84 | pass |
| 626 | realtime-2-required | 关闭留言板只需要窗口工具，不要加载留言发送工具 | must=widget.remove; forbid=messageBoard.send | widget.remove | 0.95 | pass |
| 659 | realtime-2-required | 音乐登录按钮消失后再开始播放 | must=music.play | music.auth_status, music.play | 0.86 | pass |
