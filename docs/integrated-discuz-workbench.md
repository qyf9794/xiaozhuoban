# Discuz 工作台集成说明

该集成是增量模块，默认关闭。它不会嵌入 Discuz 的 Express、SQLite、独立 Realtime 会话或麦克风；工作台只复用小桌板现有光球和当前 `RealtimeSession`。

## 功能开关与服务配置

浏览器和服务端必须同时开启：

```dotenv
VITE_WORKBENCH_ENABLED=true
WORKBENCH_ENABLED=true
WORKBENCH_BACKGROUND_MODEL=gpt-5.6-luna
OPENAI_WEBHOOK_SECRET=whsec_...
```

继续复用小桌板已有的服务端 `OPENAI_API_KEY`，不要增加浏览器密钥，也不要迁移 Discuz 设置中的任何密钥。服务端工作台开启时，Realtime session 固定为 `gpt-realtime-2.1-mini`；打开和关闭工作台不会重新连接或创建第二个 session。

后台还需要现有 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 和 `CRON_SECRET`。`SUPABASE_SERVICE_ROLE_KEY`、`OPENAI_API_KEY`、`OPENAI_WEBHOOK_SECRET` 只能配置在服务端。

## 数据库和 Storage

先应用迁移：

```bash
pnpm dlx supabase@latest migration list
pnpm dlx supabase@latest db push
```

迁移文件为 `apps/web/supabase/migrations/20260719064350_add_integrated_workbench.sql`。它会创建工作台表、RLS、显式授权、私有 `workbench-files` bucket、用户路径策略和 `workbench_tasks` Realtime publication。

文件路径固定为 `{userId}/{topicId}/{fileId}/{fileName}`。浏览器只读取短期签名 URL。旧 `.doc/.xls/.ppt` 可保存和下载，但首版不在线解析。

## OpenAI webhook 和后台恢复

在 OpenAI 项目中创建 webhook，地址指向：

```text
https://<部署域名>/api/workbench/openai-webhook
```

订阅 `response.completed`，把签名密钥保存为 `OPENAI_WEBHOOK_SECRET`。处理器使用官方 Node SDK 的 `client.webhooks.unwrap(rawBody, headers)` 验签，以 `webhook-id` 去重，并在持久化事件后返回 2xx。`/api/workbench/process` 由 Vercel Cron 每分钟恢复卡住的后台任务。

复杂任务通过官方 Responses API 的 background mode 创建；后台模型默认使用 `gpt-5.6-luna`，并显式设置 `reasoning.effort: "none"`，以保持迁移前的有效推理强度和延迟等级。联网使用 hosted `web_search`，生图使用 hosted `image_generation` 并显式指定 `gpt-image-2`，输出使用严格 JSON Schema。所有返回命令仍会经过服务端命令注册表、用户归属、风险和幂等校验。

## Discuz 数据导入

dry-run 不需要目标用户或服务密钥：

```bash
pnpm --filter @xiaozhuoban/web import:discuz-workbench -- --dry-run
```

正式导入前先应用数据库迁移，然后提供目标小桌板 Supabase 用户 ID：

```bash
pnpm --filter @xiaozhuoban/web import:discuz-workbench -- \
  --apply \
  --user-id <SUPABASE_USER_ID> \
  --board-id <OPTIONAL_BOARD_ID>
```

导入器输出批次 ID、条数、文件字节数、缺失文件和 SHA-256 校验和。按批次回滚：

```bash
pnpm --filter @xiaozhuoban/web import:discuz-workbench -- \
  --rollback \
  --user-id <SUPABASE_USER_ID> \
  --batch-id <IMPORT_BATCH_ID>
```

导入范围包括主题、文件、笔记、讨论方向、记录和消息；明确排除 diagnostics、设置、API Key、壁纸、麦克风和模型配置。

## 单会话语音门禁

本地配置好现有 `OPENAI_API_KEY` 后运行：

```bash
pnpm test:workbench-voice
```

门禁用真实合成语音在一个连续 WAV 中说“请打开工作台”和“把工作台收起来”，只连接一次 Realtime，并检查一次 `getUserMedia`、一次 session 创建、两次 `app.workbench.set` 成功操作、无中途断线，以及打开/关闭的可见 DOM 效果。证据写入 `output/playwright/workbench-voice-gate/`。

## 官方依据

- [OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI Voice Agents](https://developers.openai.com/api/docs/guides/voice-agents)
- [OpenAI Background mode](https://developers.openai.com/api/docs/guides/background)
- [OpenAI GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenAI Webhooks](https://developers.openai.com/api/docs/guides/webhooks)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
