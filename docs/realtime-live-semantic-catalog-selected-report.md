# Realtime-2 Live Semantic Catalog 1 Selected Report

- Date: 2026-06-20T00:08:22.377Z
- Model: gpt-realtime-2
- Credential source: production-ephemeral-token
- Source site: https://xiaozhuoban.bqxb.org
- Cases: 1/1 passed
- Batch size: 1
- Initial pass: 1/1
- Secret handling: Realtime credentials are never written to this report.

## Failure Summary

None.

## Failures

None.

## Per-Command Results

| id | route | command | expected | actual | confidence | result |
| --- | --- | --- | --- | --- | --- | --- |
| 072 | realtime-2-required | 停止录音 | must=recorder.stop | recorder.stop | 0.98 | pass |
