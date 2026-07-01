# Realtime Voice Tool Exposure Systematic Plan

## 背景

当前已经有两类强证据：

- `docs/realtime-live-semantic-catalog-700-report.md` 显示 Realtime-2 在完整工具目录、文本输入和强制 function call 条件下，可以为 700 条命令选出正确工具。
- `docs/realtime-tool-exposure-700-report.md` 显示本地 `RealtimeToolExposurePlanner` 可以为 700 条命令暴露 expected tools。

但真实语音仍出现过“没有音乐类工具”“没有频道工具”“没有倒计时工具”等问题。这说明失败点不在 Realtime-2 的语义能力本身，也不只是某几个关键词缺失，而在生产语音链路的工具暴露、session.update 时序、fallback 策略和执行闭环没有被同一套门禁约束。

## 目标

把语音命令稳定收敛到同一条真实路径：

```text
麦克风/文字 transcript
-> RealtimeToolExposurePlanner 生成候选工具
-> Realtime session.update 暴露候选工具和模块 scoped context
-> Realtime-2 function_call
-> 本地校验 selected tool 属于 exposedTools
-> AssistantHarness 校验参数、绑定目标、确认策略
-> ActionRegistry 执行
-> function_call_output 回传 Realtime
-> UI 状态变化、确认或澄清
```

`assistant.execute_command` 只能作为明确降级 fallback，不能作为常规语音命令主路径。

## 核心判断

### 700 live semantic 证明什么

它证明：

- Realtime-2 能理解 700 条中文命令。
- Realtime-2 在完整工具目录下能选出正确工具名。
- 工具语义目录本身大体足够。

它不证明：

- 真实 WebRTC audio session 已经拿到同样的工具目录。
- 真实 session.update 已按模块暴露了 scoped tools。
- Realtime function_call 已经进入 Harness。
- 工具参数、widgetId、确认策略和 UI 状态变更可用。
- 用户真实语音不会被 VAD、转写、时序、fallback 或 stale response 破坏。

### 当前需要解决的问题

```text
700 live semantic:
完整工具目录 + 文本 input + 自定义 batch function -> Realtime 选工具

真实语音:
麦克风 -> WebRTC -> 初始 session tools
-> assistant.select_tool 或 assistant.execute_command
-> scoped session.update
-> function_call
-> Harness
-> UI
```

这两条路径目前没有被同一个工具暴露门禁绑定。系统性修复必须让真实语音路径也强制经过 `RealtimeToolExposurePlanner`，并把模型选择限制在本地 exposedTools 内。

## 架构原则

- Realtime-2 负责自然语言理解、模块选择、工具选择和参数抽取。
- 本地负责候选工具暴露、目标绑定、风险策略、确认、执行和状态验证。
- 初始 Realtime session 只保留少量导航工具，不直接暴露全部细节工具。
- 具体模块工具必须通过 scoped `session.update` 暴露。
- 任何模型选择都不能绕过 Harness。
- 任何 fallback 都必须有结构化 trace，不能表现为 UI 没反应。

## 代码改造

### 1. 收紧 execute_command fallback

现状风险：

- `assistant.execute_command` 如果描述为 “Use this for all UI control requests”，模型会倾向把 Realtime 当转写器。
- 针对倒计时、音乐、电视的保守 fallback 指令会把系统重新拉向本地解析。

改造：

- 删除按具体模块触发 `execute_command` 的保守指令。
- 将 `assistant.execute_command` 描述改成仅用于明确降级：
  - selector 工具不可用。
  - scoped session.update 超时或失败。
  - data channel 不可用。
  - transcript fallback 已被本地判定为必要。
- 每次使用该工具必须记录 `REALTIME_FALLBACK_EXECUTE_COMMAND`。

验收：

- 普通命令不应直接走 `assistant.execute_command`。
- 真实失败时能看到明确 fallback reason。

### 2. 真实语音 selection 必须过 ToolExposurePlanner

在 `OpenAIRealtimeWebRtcAdapter.handleToolSelection()` 中，当收到 `assistant.select_tool` 后，使用真实用户命令或 final transcript 重新计算候选工具：

```ts
const exposurePlan = buildRealtimeToolExposurePlan(
  selection.userCommand || finalTranscript,
  this.currentContext,
  this.currentTools,
  this.moduleRegistry
);

if (!exposurePlan.exposedTools.some((tool) => tool.name === selectedTool.name)) {
  rejectSelection("REALTIME_SELECTED_TOOL_NOT_EXPOSED", exposurePlan);
}
```

拒绝时必须记录：

- transcript
- selectedTool
- selectedModule
- targetHint
- exposedTools
- excludedReasons
- contextVersion
- toolCatalogVersion
- sessionReady

验收：

- Realtime 不能调用未被本地暴露的工具。
- 失败被归类为 selection/exposure 问题，而不是“没反应”。

### 3. 统一工具目录来源

当前风险：

- live semantic 脚本可以手写或构造一套比生产更完整的工具目录。
- 生产 runtime session、文本 fallback、semantic gate 可能使用不同目录形态。

改造：

- 抽出共享 capability catalog 构造逻辑。
- 700 live semantic、runtime session、text fallback、voice session 都读取同一份工具元数据和模块目录。
- 报告中记录 `toolCatalogVersion`，并和生产 session 的版本可比对。

验收：

- 同一命令在 semantic gate、tool exposure gate、live session contract 中使用相同工具名集合。
- 测试脚本不能独立维护一套生产没有的工具目录。

### 4. scoped session.update 强制闭环

当 Realtime 调用 `assistant.select_tool` 后：

1. 本地计算 exposure plan。
2. 本地生成模块 scoped context。
3. 本地发送 scoped `session.update`。
4. 等待 `session.updated`。
5. 再允许 Realtime 发具体工具 function_call。

如果第 4 步超时：

- 不静默 fallback。
- 记录 `REALTIME_SCOPED_SESSION_UPDATE_TIMEOUT`。
- 允许进入明确 fallback，但必须带 trace。

验收：

- 每次工具执行前都能看到最近一次 scoped `session.updated`。
- function_call 使用的工具集合等于 scoped update 暴露集合。

### 5. 诊断快照

每次出现以下情况时必须保存诊断快照：

- 模型回复没有工具。
- 模型没有 function_call。
- selection 低置信。
- selected tool 不在 exposedTools。
- scoped session.update 超时。
- Harness reject。
- 工具执行失败。

快照字段：

```text
commandTraceId
transcript
selectedModule
selectedTool
targetHint
confidence
exposedTools
excludedReasons
currentToolsCount
contextVersion
toolCatalogVersion
sessionReady
lastSessionUpdatedAt
dataChannelState
fallbackReason
harnessRoute
toolResultStatus
errorCode
```

## 测试门禁

### Gate 1: 700 live semantic

命令：

```bash
XIAOZHUOBAN_REALTIME_LIVE_SITE=https://xiaozhuoban.bqxb.org node scripts/realtime-live-semantic-gate.mjs --catalog --limit=700 --batch-size=12
```

验证：

- Realtime-2 在完整目录下能选对工具。

不验证：

- 真实 WebRTC audio。
- 生产 session.update。
- scoped tools。
- Harness 执行。
- UI 状态。

报告：

- `docs/realtime-live-semantic-catalog-700-report.md`

### Gate 2: 700 tool exposure

命令：

```bash
pnpm --filter @xiaozhuoban/web test -- src/assistant/voiceScenarioCatalogStatefulHarness.test.ts
```

其中 `exposes every expected realtime tool before mocked plan execution` 必须通过。

验证：

- 每条 catalog command 的 expected tools 都在 `RealtimeToolExposurePlanner.exposedTools` 中。
- destructive 工具没有误暴露。
- 每个暴露或排除都有 reason。

报告：

- `docs/realtime-tool-exposure-700-report.md`

### Gate 3: live session tool contract

新增脚本建议：

```bash
node scripts/realtime-live-session-tool-contract.mjs --ids=028,061,067,109,681 --mode=text
node scripts/realtime-live-session-tool-contract.mjs --smoke=10 --mode=audio
```

验证真实 session：

- 初始 session 工具只包含 selector、clarification、cancel、plan 和明确 fallback。
- final transcript 生成 exposure plan。
- Realtime selection 必须属于 exposedTools。
- scoped `session.update` 成功。
- scoped function_call 工具必须属于本次 scoped tools。
- 如果模型说没有工具，报告必须包含当时的 exposedTools 和 toolCatalogVersion。

输出报告：

- `docs/realtime-live-session-tool-contract-report.md`

### Gate 4: 700 stateful Harness execution

命令：

```bash
pnpm --filter @xiaozhuoban/web test -- src/assistant/voiceScenarioCatalogStatefulHarness.test.ts
```

改造要求：

- mocked plan 不能绕过 ToolExposurePlanner。
- 模型或模拟选出的每个工具都必须通过 `selectedTool in exposedTools`。
- target-required 工具必须拥有真实 `widgetId`，否则进入 intentional clarification。

报告：

- `docs/realtime-voice-scenario-catalog-stateful-harness-report.md`
- `docs/realtime-voice-scenario-catalog-widget-id-audit-report.md`

### Gate 5: live voice smoke

先运行 10 条，稳定后扩到 30 条。

命令：

```bash
NODE_PATH=/tmp/xz-playwright-runner/node_modules node scripts/playwright-live-voice-smoke-gate.js
```

该门禁必须使用录音 fixture 通过 Chrome fake microphone 进入真实 WebRTC Realtime session，不能用文字 fallback 冒充语音验证。

初始 10 条：

```text
1. 关闭留言板
2. 打开音乐播放器
3. 我想听王菲的歌
4. 暂停音乐
5. 上海天气
6. 打开便签
7. 帮我记一下今天测试语音
8. 十分钟后提醒我
9. 打开电视然后全屏
10. 关闭所有小工具
```

每条必须记录：

```text
speech_started
speech_stopped
final transcript
tool_exposure.plan
assistant.select_tool
scoped session.update
session.updated
function_call
Harness result
function_call_output
UI mutation / confirmation / clarification
```

验收：

- 10/10 有 transcript。
- 10/10 有 tool exposure trace。
- 10/10 selected tool 属于本地 `exposedTools`。
- 10/10 有 Harness result。
- 8/10 以上走 Realtime function_call 主路径。
- 0 `assistant.execute_command` fallback。
- 0 silent no-op。
- 0 unclassified no-tool reply。

报告：

- `docs/realtime-live-voice-smoke-report.md`

## 失败分类

所有失败必须归类到下面之一：

```text
audio_permission_denied
vad_not_triggered
transcript_empty
session_update_missing
tool_catalog_version_mismatch
tool_exposure_missing
selected_tool_not_exposed
function_call_missing
function_call_empty_arguments
scoped_session_update_timeout
harness_rejected
tool_execution_failed
tool_output_not_returned
ui_state_not_changed
stale_response_after_interrupt
fallback_execute_command_used
```

## 实施顺序

### Phase 1: 修正主路径边界

- 收紧 `assistant.execute_command` prompt 和工具描述。
- 删除按模块兜底的 fallback 指令。
- 为 fallback 增加结构化 reason。

验收：

- 现有 Realtime adapter tests 通过。
- 普通命令不会优先走 `execute_command`。

### Phase 2: selection 绑定 exposure plan

- 在真实语音 `handleToolSelection()` 中加入 exposure plan 校验。
- 记录 selected tool、exposedTools、excludedReasons。
- 拒绝未暴露工具。

验收：

- 新增单元测试覆盖 selected tool not exposed。
- 现有 700 tool exposure 报告仍通过。

### Phase 3: live session contract

- 新增 `scripts/realtime-live-session-tool-contract.mjs`。
- 先覆盖最近失败命令：
  - `倒计时5分钟`
  - `我想听王菲的歌`
  - `我想看BBC`
  - `关闭留言板`
  - `上海天气`
- 再扩到每个模块至少一条。

验收：

- 报告证明真实 session.update 和 scoped function_call 可用。

### Phase 4: live voice smoke

- 人工或录音 fixture 驱动真实麦克风/音频输入。
- 每条命令保存 trace。
- 失败必须修到分类明确。

验收：

- 10/10 smoke 成功、确认或澄清。
- 0 silent no-op。

### Phase 5: 扩展回归

- 保持 700 semantic。
- 保持 700 tool exposure。
- 保持 700 stateful harness。
- 增加 30 条 live voice smoke。
- 对失败高发模块做 targeted rerun。

## 发布门禁

每次改 Realtime 工具暴露或语音执行路径，至少运行：

```bash
pnpm --filter @xiaozhuoban/assistant-core test
pnpm --filter @xiaozhuoban/web test -- src/assistant/openaiRealtimeAdapter.test.ts src/assistant/realtimeTextToolCall.test.ts src/assistant/realtimeToolExposurePlanner.test.ts src/assistant/voiceScenarioCatalogStatefulHarness.test.ts
pnpm --filter @xiaozhuoban/web typecheck
git diff --check
```

上线前必须额外具备：

```text
700 live semantic passed
700 tool exposure passed
700 stateful harness passed
10/10 live voice smoke passed
0 silent no-op
0 unclassified no-tool reply
all fallback paths have errorCode and trace
```

## 成功定义

修复完成后，下面说法必须同时成立：

- Realtime-2 不是只做转写，而是参与工具选择和参数抽取。
- 本地只暴露当前候选工具和 scoped context，不一次性给全量工具 schema。
- 真实语音 selection 必须属于本地 exposedTools。
- Harness 是唯一执行边界。
- `assistant.execute_command` 是可追踪 fallback，不是主路径。
- 700 pass 的含义被分层记录，不再把 semantic pass 误认为 voice execution pass。
- 用户真实说话失败时，可以定位到音频、VAD、transcript、tool exposure、session.update、function_call、Harness、ActionRegistry 或 UI 的具体层级。
