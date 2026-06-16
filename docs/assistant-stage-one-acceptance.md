# Stage-One Assistant Acceptance Checklist

## Automated Checks

- `pnpm run test`
- `pnpm --filter @xiaozhuoban/web typecheck`
- `pnpm run build`

The mocked acceptance suite covers:

- Shortcut-first weather city update.
- Shortcut-first countdown setup and start.
- Pending destructive action cancellation.
- Short local out-of-scope response for dynamic widget generation.
- Scoped Realtime initial tools and compact context serialization.

## Manual Live Realtime Checks

Prerequisites:

- `apps/web/.env.local` has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and server-only `OPENAI_API_KEY`.
- Supabase schema has been updated with `assistant_command_logs`.
- Browser microphone permission is granted.

Scenarios:

- Say "打开上海天气"; verify the weather widget is added or focused, and the city is Shanghai.
- Say "把第一个倒计时设为 10 分钟并开始"; verify the countdown runs with 600 seconds.
- Say "删除最近的便签", then say "取消"; verify the note is not deleted.
- Say "大富翁掷骰"; verify a short out-of-scope response and no game mutation.
- Select a TV context, say "播放 CCTV1，并全屏"; verify only TV detail tools are loaded before the call.

Observability:

- Confirm `assistant_command_logs` records route, tool, sanitized args, result, and duration.
- Confirm raw audio, full note contents, clipboard history, and recording payloads are absent from logs.
- Confirm Realtime initial session tools do not contain widget-detail tools such as `note.write`, `weather.set_city`, or `tv.play`.
