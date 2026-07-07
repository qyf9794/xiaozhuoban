# Assistant Log Cleanup

The production cleanup job removes old rows from `public.assistant_command_logs`.
It does not delete boards, widgets, message-board messages, game records, or local browser diagnostics.

## Schedule

`apps/web/vercel.json` registers:

```json
{
  "path": "/api/assistant/cleanup",
  "schedule": "17 19 * * *"
}
```

Vercel invokes the path with an HTTP `GET` request on production deployments. The schedule is UTC, so this runs around 03:17 in Asia/Shanghai.

## Required Vercel Environment Variables

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
CRON_SECRET=GENERATE_A_RANDOM_SECRET_AT_LEAST_16_CHARS
ASSISTANT_LOG_RETENTION_DAYS=30
```

`SUPABASE_SERVICE_ROLE_KEY` must only exist server-side in Vercel. Do not expose it as a `VITE_` variable.

`ASSISTANT_LOG_RETENTION_DAYS` defaults to 30. The handler clamps the effective value to 7-365 days.

## Manual Verification

Dry run without deleting:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://xiaozhuoban.bqxb.org/api/assistant/cleanup?dryRun=1"
```

Temporary 14-day dry run:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://xiaozhuoban.bqxb.org/api/assistant/cleanup?dryRun=1&days=14"
```

Manual cleanup using the configured/default retention:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://xiaozhuoban.bqxb.org/api/assistant/cleanup"
```

The response includes `matchedRows`, `deletedRows`, `retentionDays`, and `cutoff`.
