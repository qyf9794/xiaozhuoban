# Stage-One Assistant Rollout Review

## Implementation Recap

Stage one now has a shortcut-first assistant foundation:

- Pure assistant contracts, action registry, target resolver, tool scoping, and compact context summaries.
- `AssistantHarness` lifecycle for shortcut/model/function-call routing, confirmation, cancellation, timeout, audit, and tool results.
- Board actions with fixed-size resize refusal.
- State actions for non-game widgets, plus a capability bridge for media and mounted widget effects.
- Guardrails for games, AI forms, dynamic widget generation, complex planning, and long-text rewrite.
- Realtime session endpoint and WebRTC adapter based on current OpenAI Realtime docs.
- Voice/text dock with mockable Harness path and bounded command history.
- Local and Supabase audit logging without raw audio.
- Mocked acceptance tests for the core stage-one commands.

## Known Limitations

- Live Realtime voice has a transport adapter and endpoint, but still needs a credentialed manual test with microphone permission.
- Media capabilities now register from mounted TV, music, recorder, and dial clock widgets, but browser autoplay and permission rules can still require a user gesture.
- `widget.focus` and `widget.fullscreen_focus` now update board focus state; fullscreen still depends on browser fullscreen permission behavior.
- Full repository build currently depends on local Tauri/Cargo tooling for the desktop app.
- Playwright scenarios are documented but not wired as executable browser E2E tests in this scaffold.

## Failed Command Examples

- "大富翁掷骰" returns a short out-of-scope response.
- "提交这个 AI 表单" returns a short out-of-scope response.
- "帮我生成一个新工具" returns a short out-of-scope response and makes no server tool call.
- "帮我重写这篇长文" returns a short out-of-scope response and does not enter long-form Realtime processing.

## Reliability Notes

- Simple commands should hit `IntentShortcutRouter` before Realtime.
- Realtime initial tools are desktop-scoped only; widget detail tools load by selected widget type.
- Context summaries omit full widget payloads.
- Audit logs sanitize large and sensitive fields before local or Supabase persistence.

## Next-Stage Recommendations

- Continue broadening widget detail capabilities beyond the stage-one media and clock controls.
- Add a browser-level Realtime smoke test once a mock authenticated desktop fixture and microphone-permission path exist.
- Add executable Playwright E2E once a mock authenticated desktop fixture exists.
- Run live Realtime validation with `OPENAI_API_KEY` and Supabase credentials.
- Keep Codex-powered dynamic widget generation in a separate stage-two design, with a tighter sandbox and review flow.
