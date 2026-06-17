# 小工具模块化、Realtime 语音控制与自我学习改造计划

Date: 2026-06-17

Status: planning

Scope: 日常小工具优先；游戏与 AI 表单暂不作为首批完整性测试对象。

Priority: 先做安全边界、Realtime 稳定性和工具能力扩展；暂不继续堆 UI 小功能。

## 1. 背景与目标

当前小工具的定义、快捷命令、AI 工具调用、Realtime 上下文、运行时能力和测试记录分散在多个中心文件中。新增或改造一个工具时，通常需要同时修改工具定义、快捷路由、状态 action、capability bridge、Realtime 工具暴露、上下文序列化和测试用例。

本计划的目标是把每个小工具改造成可注册、可测试、可热加载、可语音操控的标准模块。未来新增工具时，AI 或远程 Codex 可以围绕同一套模块协议生成代码；用户确认后，系统可以注册到工具库，并通过本地 harness 和 Realtime-2 直接语音操控。

最终系统需要具备：

- 每个小工具拥有独立模块，包含定义、别名、快捷命令、工具调用、上下文、Realtime 暴露规则、执行策略和测试矩阵。
- 本地 harness 优先处理确定性命令，高置信度命令不调用模型。
- 已完成且测试通过的快捷命令默认保留；只有存在语义冲突、风险升级或误命中证据时才迁移、降级或移除。
- Realtime-2 是实时语音交互、口语语义理解、工具编排和会话上下文维护层；它只接收候选工具或局部上下文，不接收全量桌面上下文。
- 复杂口语、多重语义、缺参追问、连续轮次和打断协作交给 Realtime-2；本地快捷解析只覆盖稳定、高置信度和可学习的表达，不能无限扩大。
- 原始语音转写应优先交给独立 STT 模型或 Realtime 转写能力，例如 `gpt-4o-mini-transcribe` 或 `gpt-realtime-whisper`；Realtime-2 不承担所有 STT、翻译和工具执行职责。
- 一句话包含多个工具、多个命令时，系统生成结构化 CommandPlan，再按依赖关系顺序或并发执行。
- 所有执行都经过本地 harness 校验、权限判断、确认门和日志记录。
- Realtime API 必须绑定登录用户鉴权，服务端只信任 Supabase access token 推导出的 user id，不能信任客户端传入的 safetyIdentifier。
- Realtime 会话必须以 `session.updated` 作为配置生效信号，不能只以 DataChannel open 作为可用状态。
- 后台成功解析并执行的未命中表达，可以沉淀为本地学习候选；用户确认后扩大本地命中范围。
- AI 生成的新工具必须经过 schema 校验、沙箱测试和用户确认，才能加入工具库。

## 2. 关键架构原则

### 2.1 模块声明能力，本地统一注册

每个小工具必须通过标准模块声明自己的能力，而不是把规则散落到全局路由中。

模块化改造必须保留每个工具的独立模块边界。即使某些工具暂时仍通过兼容层接入，也要保留或逐步补齐独立模块目录，为未来动态注册、禁用、卸载和热加载做准备。

迁移过程中，现有已完成的快捷命令作为兼容资产处理：

- 无冲突、无误命中、风险等级明确的快捷命令继续保留。
- 快捷命令应逐步从全局路由迁移到对应工具模块，但迁移不得改变已验证语义。
- 出现冲突时，优先通过模块别名、动作风险、上下文状态和置信度阈值消歧，而不是直接删除旧命令。
- 删除或改写已有命令必须有失败日志、冲突说明和回归测试。

模块应声明：

- `type`
- `definition`
- `aliases`
- `shortcuts`
- `tools`
- `context`
- `realtime`
- `capability`
- `executionPolicy`
- `testMatrix`

### 2.2 本地确定性先行，复杂口语交给 Realtime-2

语音命令进入系统后，处理顺序固定为：

1. 本地快捷命令精确匹配。
2. 本地口语归一化与高置信度结构化匹配。
3. 本地候选模块选择。
4. 本地无法稳定解释的低置信度、复杂、多意图片段交给 Realtime-2。
5. Realtime-2 先判断应该使用哪个模块或工具类别，再在第二阶段接收该模块局部上下文并返回结构化动作。
6. 本地 harness 校验并执行。

模型不能直接操作 UI 或绕过本地权限控制。

本地解析器的目标不是无限扩充正则和别名，而是覆盖稳定、低风险、可测试的常用表达。以下情况应进入 Realtime-2：

- 口语里存在省略、指代、反悔、插入语或多重语义。
- 一句话包含多个工具，且顺序或依赖关系不清楚。
- 用户说的是“刚才那个”“继续这个”“把它关了”等依赖会话上下文的表达。
- 本地候选模块置信度低于阈值，或多个模块分数接近。
- 需要自然追问缺失参数。

以下情况应继续本地处理：

- 明确的打开、关闭、聚焦、隐藏窗口。
- 学习过且风险低的快捷命令。
- 本地可计算、可格式化、可直接路由的确定性请求。
- 已经通过回归测试覆盖的常见同义表达。

### 2.3 Realtime-2 两阶段上下文

Realtime-2 不能一次性接收全量桌面上下文。

以下是通用协议。文档中的 `music`、`weather` 等 JSON 只作为示例，不能理解为两阶段上下文只服务音乐模块。所有 `WidgetAssistantModule` 都必须实现同一套 catalog 和 scoped context 接口。

第一阶段是 `Module Catalog / Candidate Modules`。目标是让 Realtime-2 判断应该使用哪个模块或工具类别。它只接收极简工具目录、候选模块、能力摘要和少量 examples，不接收具体私密状态、完整 widget 数据、剪贴板内容或便签全文。

```json
{
  "userText": "...",
  "localParse": {
    "normalizedText": "...",
    "segments": [],
    "candidateModules": []
  },
  "moduleCatalog": [
    {
      "type": "module_type",
      "displayName": "模块名称",
      "aliases": ["别名1", "别名2"],
      "capabilities": ["能力1", "能力2"],
      "shortcutExamples": ["示例1", "示例2"],
      "riskSummary": ["哪些动作需要确认"]
    }
  ]
}
```

第二阶段是 `Selected Module Scoped Context`。目标是在 Realtime-2 已经选中模块后，只补这个模块完成具体操作所需的上下文。它可以包含该模块 tools、参数 schema、相关实例、必要状态、局部 examples 和执行策略；不得包含其他模块上下文、完整桌面上下文或不相关隐私数据。

```json
{
  "userText": "...",
  "selectedModule": "module_type",
  "selectedToolHint": "optional_tool_name",
  "moduleContext": {
    "tools": [],
    "toolSchemas": {},
    "instances": [],
    "stateSummary": {},
    "shortcutExamples": [],
    "executionPolicy": {},
    "riskPolicy": {}
  }
}
```

每个模块必须实现：

```ts
realtime: {
  exposeCatalog(): RealtimeModuleCatalogItem;
  getScopedContext(input: ScopedContextRequest): RealtimeScopedModuleContext;
}
```

模块 scoped context 示例：

- `music`：可以提供当前播放状态、是否已登录、队列摘要、搜索和播放工具；不能把完整用户音乐历史默认发给 Realtime-2。
- `weather`：可以提供当前城市、默认城市、查询工具和城市槽位；不需要其他小工具状态。
- `clipboard`：只能提供是否为空、条目数量、可执行动作；不能默认提供完整剪贴板内容。
- `todo`：可以提供待办数量、必要摘要和目标选择信息；不能默认发送所有待办全文。
- `recorder`：可以提供录音状态和麦克风权限状态；不能发送录音内容。

两阶段上下文的控制规则：

- 第一阶段只允许 `assistant.select_tool` 或等价工具选择能力，不暴露真实工具参数 schema。
- Realtime-2 第一阶段返回 `selectedModule`、`selectedToolHint`、`confidence`、`missingContext` 和 `question`。
- `confidence < 0.65` 时默认不进入执行阶段，应追问或让用户选择候选工具。
- 第二阶段只发送被选中模块的 scoped context，且必须经过 `redactContext()`。
- 第二阶段返回的动作必须转换为 `CommandPlan`，再交给 harness validate。
- 任何阶段都不得把完整桌面状态、完整剪贴板、完整便签、完整录音、完整搜索历史塞给 Realtime-2。

### 2.4 所有模型输出都必须回到 harness

无论结果来自本地规则、Realtime-2、其他 LLM 还是远程 Codex，最终都必须转换为结构化 `CommandPlan`，并经过本地 harness 校验、权限判断和执行调度。

### 2.5 低成本 24 小时待机

产品目标是“24 小时打开”，但不是“24 小时让 Realtime-2 持续理解所有麦克风音频”。

默认运行模式必须是：

```txt
24 小时本地待机
=> 本地 VAD / 唤醒词 / 手动按钮检测
=> 唤醒后创建 Realtime-2 短会话
=> 阶段性对话期间保持 Realtime-2
=> 空闲或预算接近上限后断开
=> 回到本地待机
```

成本目标：

- 标准目标：每天低于 10 美元。
- 省钱目标：每天低于 1 美元。
- 达到预算软上限后，降级为本地命令 + UI 状态气泡。
- 达到预算硬上限后，当天不再自动连接 Realtime-2，除非用户手动确认。

省钱目标下，Realtime-2 不能处理所有语音。它只处理：

- 本地低置信度命令。
- 多命令复杂组合。
- 缺参追问。
- 阶段性连续对话。
- 用户明确进入语音对话模式。

本地必须处理：

- 唤醒检测。
- 常见快捷命令。
- 学习过的命令。
- 简单打开、关闭、暂停、查询、添加、清空等高置信度命令。

### 2.6 安全边界与连接稳定性优先

Realtime 相关 API 和连接状态是后续工具扩展的地基，必须早于大规模迁移工具完成。

API 安全边界：

- `/api/realtime/session` 必须要求 `Authorization: Bearer <supabase-session-access-token>`。
- `/api/realtime/tool-call` 必须要求同样的 Supabase access token。
- 服务端通过 Supabase `auth.getUser(token)` 校验用户身份。
- OpenAI Safety Identifier 只能由服务端使用 `data.user.id` 生成，不再信任客户端传入的 `safetyIdentifier`。
- 未登录、token 过期、用户不存在时返回 401，不创建 Realtime client secret，也不调用 Responses API。

连接稳定性：

- DataChannel open 只表示传输层打开，不表示模型已应用当前 instructions 和 tools。
- DataChannel open 后发送 `session.update`。
- 收到 `session.updated` 后才把 UI 状态改为“聆听中”或允许工具选择。
- `sessionReady=false` 时，不处理用户语音触发的工具调用。
- 3-5 秒内未收到 `session.updated` 时断开并显示“会话配置未生效”。

轮次与打断稳定性：

- 监听 `response.created`、`response.done`、`response.cancelled`。
- 维护 `activeResponseId`。
- 工具结果回传时先发送 `function_call_output`。
- 只有没有 active response 时才发送 `response.create`。
- 用户打断、连续说话、并发工具结果返回时，不应因为重复 `response.create` 触发 active response 竞态。

配置一致性：

- Realtime model、instructions、turn detection、tool selector 和 tool name 编解码必须收敛到共享模块。
- 前端和 API 不应各自维护一份相似但可能漂移的 Realtime 配置。
- 文本 tool-call fallback 不应默认使用 `gpt-realtime-2`，应使用独立低延迟文本模型配置。

## 3. 组件职责边界

### 3.1 本地 Harness

本地 harness 是确定性控制中枢。

职责：

- 管理 `WidgetAssistantModule` 注册。
- 维护模块 catalog、aliases、shortcuts、tools。
- 做口语归一化、快捷命令匹配和候选模块选择。
- 生成初步 CommandPlan。
- 判断命令是否可本地直接执行。
- 调度顺序和并发执行。
- 管理 confirmation gate。
- 管理状态气泡和 operationId。
- 写入完整日志。
- 执行前端本地工具调用。

禁止：

- 静默执行高风险命令。
- 接受模型返回结果后绕过校验直接执行。
- 把隐私上下文直接交给模型。

### 3.2 Realtime-2

Realtime-2 是实时语音交互层、口语意图解析器、工具编排器、会话上下文维护者和打断/轮次管理的协作者。它不是纯转写器，也不是纯翻译器，更不能直接执行工具。

职责：

- 作为实时语音交互层，承担“听、理解、说/输出”的交互核心；但语音转写可由独立 STT 模型承担。
- 处理真实口语、停顿、啰嗦表达、省略、指代、反悔和多重语义。
- 把口语意图解析为结构化动作，不要求本地快捷解析无限扩大。
- 坚持两阶段解析：先判断模块或工具类别，再请求该模块 scoped context 生成具体操作。
- 作为工具编排器，选择何时调用哪个工具、如何填参数、如何把 tool result 融入下一轮回应。
- 在一段实时会话中维护“刚才讨论的对象”“当前任务上下文”“最近一次工具调用结果”等短期上下文。
- 参与打断、轮次管理和缺参追问，避免用户没说完就过早截断或执行。
- 解析一句话里的多个命令，并生成结构化 CommandPlan 或澄清问题。
- 根据局部模块上下文补全参数，输出可校验的 tool selection 或 action args。

禁止：

- 直接执行工具。
- 直接接收全量桌面上下文。
- 代替本地快捷命令处理高置信度命令。
- 长期保存工具状态。
- 承担所有 STT、所有翻译和所有 fallback 文本解析职责。
- 在第一阶段接收完整 tool schemas、widget 实例详情或私密内容。
- 在低置信度时强行生成执行计划。

建议模型分工：

- `gpt-4o-mini-transcribe` 或 `gpt-realtime-whisper`：负责低成本、稳定的输入转写。
- `gpt-realtime-2`：负责实时口语交互、工具选择、局部上下文补参、短期会话上下文和打断协作。
- 独立文本模型：负责非实时文本 fallback、批量离线分析和低成本工具选择；不使用 Realtime 模型作为默认文本 fallback。

### 3.3 其他大语言模型

例如低延迟文本模型，不作为实时语音主链路。

适合：

- 非实时文本命令解析。
- 批量测试用例生成。
- 工具模块代码生成。
- 日志总结。
- 离线回放分析。
- 低成本 intent 分类。
- Realtime-2 不可用时的降级兜底。
- `/api/realtime/tool-call` 的文本工具选择和参数生成 fallback。

不适合：

- 接管实时语音判断。
- 直接执行本地工具。
- 在用户一句话中间接管控制流。
- 默认复用 `gpt-realtime-2` 的实时会话配置。

### 3.4 未来远程 Codex

远程 Codex 是异步工程代理，不参与毫秒级桌面语音控制。

职责：

- 根据用户目标生成或修改 `WidgetAssistantModule`。
- 编写测试矩阵。
- 分析失败日志。
- 自动修复工具模块。
- 生成新工具代码。
- 做跨文件重构。
- 连接远程服务或 API。
- 执行长任务计划。
- 提交 PR 或生成补丁。

禁止：

- 接收实时麦克风流。
- 接收未过滤的完整桌面状态。
- 直接执行本地 UI 工具。
- 未经用户确认安装新工具。

## 4. 标准模块协议

建议定义：

```ts
export interface WidgetAssistantModule {
  type: string;
  definition: WidgetDefinition;
  aliases: string[];
  shortcuts: ShortcutRule[];
  tools: AssistantAction[];
  context: WidgetContextProvider;
  realtime: WidgetRealtimeProvider;
  executionPolicy: WidgetExecutionPolicy;
  capability?: WidgetCapabilityRegistration;
  testMatrix?: WidgetTestMatrix;
}

export interface ShortcutRule {
  id: string;
  intent: string;
  actions?: string[];
  targets?: string[];
  patterns?: string[];
  slots?: ShortcutSlot[];
  order?: "fixed" | "any";
  noiseTolerant?: boolean;
  examples: string[];
  risk: "safe" | "confirm" | "destructive";
}

export interface WidgetExecutionPolicy {
  defaultMode: "sequential" | "parallel" | "latest-wins";
  exclusiveActions?: string[];
  destructiveActions?: string[];
  requiresConfirmation?: string[];
  requiresMountedWidget?: boolean;
  canRunInParallelWith?: string[];
  conflictsWith?: string[];
}
```

模块目录建议：

```txt
apps/web/src/widgets/modules/music/
  definition.ts
  assistant.ts
  shortcuts.ts
  tools.ts
  context.ts
  realtime.ts
  capability.ts
  executionPolicy.ts
  test-cases.json
```

### 4.1 每个工具模块的强制交付项

每个工具模块不能只交付 UI 或少量命令，必须交付一套可被 harness、Realtime-2、测试 runner 和学习系统共同使用的完整描述。

每个模块必须包含：

- 工具身份：`type`、显示名称、图标、分类、是否可多实例。
- 别名体系：中文名、英文名、口语别名、历史学习别名、禁止别名。
- 窗口能力：打开、关闭、聚焦、隐藏、恢复、是否关闭前确认。
- 核心动作：该工具真正能做的业务动作。
- 参数槽：每个动作需要哪些参数、默认值、缺参时如何追问。
- 语义边界：相近词如何区分，例如“关闭音乐”是关窗口，“暂停音乐”是暂停播放。
- 状态模型：模块公开给 harness 的最小状态。
- 上下文预算：发给 Realtime-2 的局部上下文最大大小和字段白名单。
- 权限需求：麦克风、剪贴板、网络、登录、第三方 token、外部 API。
- 风险等级：safe、confirm、destructive。
- 确认策略：哪些动作必须确认，确认文案是什么。
- 执行策略：顺序、并发、latest-wins、互斥动作、跨工具并发白名单。
- 失败模型：常见失败原因、用户可见文案、是否可重试。
- 学习策略：哪些表达可以学习，哪些必须确认，哪些禁止学习。
- 测试矩阵：单工具、组合命令、低置信度兜底、真实页面和回归测试。

### 4.2 工具动作定义要求

每个 action 必须声明：

```ts
export interface WidgetModuleActionSpec {
  name: string;
  intent: string;
  description: string;
  argsSchema: unknown;
  resultSchema: unknown;
  risk: "safe" | "confirm" | "destructive";
  requiresMountedWidget?: boolean;
  requiresAuth?: boolean;
  requiresPermission?: string[];
  idempotency: "idempotent" | "repeatable" | "stateful" | "destructive";
  missingArgPolicy: "ask" | "use_default" | "fail";
  concurrencyKey?: string;
  examples: string[];
}
```

验收要求：

- 每个 action 都有参数 schema。
- 每个 action 都有成功和失败 result schema。
- 每个 action 都声明风险等级。
- 每个 action 都有至少 3 条自然语言 examples。
- 对外部 API、登录、权限依赖必须显式声明。
- destructive action 必须进入确认门。
- 不允许长期使用一个过宽的 generic args schema 覆盖所有能力。
- 每个 capability 必须有最小参数 schema，例如 `music.pause` 为 `{}`，`messageBoard.post` 为 `{ text: string }`，`tv.select_channel` 为 `{ channelName?: string; channelUrl?: string }`。
- 模型生成的额外字段必须被 schema 拒绝或记录为 ignored field，不能静默进入执行层。

### 4.2.1 Dry-run / Preview 要求

高风险桌面操作必须统一进入：

```txt
plan => preview => confirm => execute
```

必须 preview 的操作：

- 删除多个 widget。
- 自动整理桌面。
- 重命名桌板。
- 导入备份。
- AI 生成并添加新 widget。
- 清空或覆盖 widget 状态。
- 发布、发送、外部写入或跨服务操作。

Preview 必须包含：

- 将要执行的命令列表。
- 影响的 widget 或数据范围。
- 是否可撤销。
- 失败后的恢复策略。
- 用户确认或取消按钮。

### 4.3 模块上下文要求

每个模块必须实现三个层级的上下文：

```txt
catalog context
=> 只描述模块能做什么，用于 Realtime-2 第一阶段选工具

tool context
=> 只描述被选中工具需要的状态，用于 Realtime-2 第二阶段补参

debug context
=> 只在本地日志或开发模式使用，不能默认发给模型
```

上下文字段要求：

- 默认不得包含完整用户内容。
- 剪贴板、便签、录音、搜索历史等敏感内容必须摘要化或省略。
- 每个模块必须定义 `maxRealtimeContextTokens`。
- 每个模块必须定义 `redactContext()`。
- Realtime-2 第二阶段上下文必须能解释为什么需要这些字段。

### 4.4 每个工具的设计说明文件

每个模块目录必须包含 `README.md` 或 `module.md`，说明：

- 工具目标。
- 用户常用说法。
- 支持动作列表。
- 不支持动作列表。
- 窗口控制语义。
- 多命令组合示例。
- 并发策略。
- 权限和登录要求。
- 测试覆盖摘要。
- 已知限制。

## 5. 快捷命令与候选模块选择

### 5.1 快捷命令必须加入模块

快捷命令是工具的语言入口，应归属于工具模块。

已经实现并验证过的快捷命令应作为迁移输入保留。模块化的目标是把它们归档、标注风险和补齐测试，而不是重写一套不兼容的新命令。

例子：

- “关闭音乐”属于 `music` 模块，语义是关闭窗口。
- “暂停音乐”属于 `music` 模块，语义是暂停播放。
- “查北京天气”属于 `weather` 模块。
- “清空剪贴板”属于 `clipboard` 模块。

### 5.2 通用命令与专属命令

通用命令由系统层自动组合：

- 打开 + 小工具名
- 关闭 + 小工具名
- 隐藏 + 小工具名
- 聚焦 + 小工具名

专属命令由模块声明：

- 音乐：播放、搜索、下一首、上一首、暂停、继续。
- 天气：查询城市天气、切换城市。
- 剪贴板：保存文本、清空。
- 待办：添加事项、完成事项。

保留策略：

- 通用窗口命令可以由系统层统一生成，但工具模块仍要声明自己接受的别名和窗口语义。
- 专属业务命令必须归属到工具模块。
- 如果旧快捷命令已经覆盖某个专属业务动作，模块应引用或迁移该规则，并保留原测试用例。
- “关闭音乐”等历史纠正过的语义必须固化为模块负例和回归测试，避免重新被解析成暂停。

### 5.3 口语归一化

本地候选选择器需要处理啰嗦表达。

例子：

```txt
关闭，啊，这个，音乐
=> 关闭 音乐
=> widget.close music
```

归一化应处理：

- 停顿词：啊、嗯、呃、那个、这个、就是、然后。
- 礼貌词：帮我、请、麻烦、一下、吧。
- 标点和重复空格。
- 同义动作：关闭、关掉、收起来、退出。
- 乱序表达：音乐关掉、关一下音乐。

### 5.4 候选模块选择器

本地候选模块选择器负责输出候选模块和置信度。

评分因素：

- 文本是否包含模块 aliases。
- 文本是否包含该模块动作词。
- 文本是否类似该模块 examples。
- 当前焦点窗口。
- 最近使用小工具。
- 当前正在播放、录音或运行的小工具。
- 历史学习规则。

输出示例：

```json
{
  "text": "帮我放一首周杰伦",
  "normalizedText": "放 周杰伦",
  "candidates": [
    {
      "type": "music",
      "score": 0.91,
      "reason": "包含播放动词，符合 music shortcut examples"
    }
  ]
}
```

## 6. 多命令解析与执行规划

### 6.1 目标

一句话可能包含：

- 一个工具的多个命令。
- 多个工具的多个命令。
- 顺序命令和并发命令混合。
- 需要确认的命令。
- 依赖前一步结果的命令。

系统必须先生成 `CommandPlan`，再执行。

### 6.2 CommandPlan

```ts
export interface CommandPlan {
  id: string;
  sourceText: string;
  normalizedText: string;
  commands: PlannedCommand[];
  dependencies: CommandDependency[];
  executionGroups: ExecutionGroup[];
  confidence: number;
  needsConfirmation: boolean;
  createdBy: "local" | "realtime-2" | "text-llm" | "learned";
}

export interface PlannedCommand {
  id: string;
  module: string;
  tool: string;
  args: Record<string, unknown>;
  risk: "safe" | "confirm" | "destructive";
  confidence: number;
  dependsOn?: string[];
}

export interface ExecutionGroup {
  id: string;
  mode: "sequential" | "parallel";
  commandIds: string[];
}
```

### 6.3 连接词规则

需要识别：

- `然后`：顺序。
- `再`：顺序。
- `先`：前置顺序。
- `最后`：尾部顺序。
- `同时`：并发。
- `顺便`：默认并发，若存在依赖则顺序。
- `和`、`以及`：可能是并发，也可能是同一动作的多个目标。

例子：

```txt
先打开音乐，再播放周杰伦，同时查北京天气
```

计划：

```json
{
  "executionGroups": [
    {
      "mode": "parallel",
      "items": [
        {
          "mode": "sequential",
          "commands": ["open-music", "music-search-play"]
        },
        {
          "mode": "sequential",
          "commands": ["open-weather", "weather-query-beijing"]
        }
      ]
    }
  ]
}
```

### 6.4 排序与并发规则

必须顺序执行：

- 同一工具内，后一步依赖前一步结果。
- 搜索后播放第一首。
- 打开窗口后执行需要 mounted widget 的能力。
- 需要确认的命令及其依赖链。

可以并发执行：

- 不同工具之间无共享资源、无依赖、无冲突的命令。
- 打开天气与打开音乐。
- 关闭多个窗口。
- 刷新新闻与查询天气。

只阻塞相关链路：

- 确认弹窗只阻塞依赖它的命令。
- 某个工具失败只影响它的依赖命令，不影响无关并发命令。

模块可声明覆盖策略：

```ts
weather.executionPolicy = {
  defaultMode: "latest-wins",
  canRunInParallelWith: ["music", "clipboard", "todo"]
};
```

例如：

```txt
查北京天气，再查上海天气
```

天气模块可以选择：

- 两次都执行。
- 或 `latest-wins`，只保留上海。

### 6.5 多命令 Realtime-2 兜底

当本地解析低置信度时，先把分段和候选目录发给 Realtime-2：

下面是跨 `music` 和 `weather` 的多模块示例。实际发送结构必须遵循 2.3 节的通用协议，由涉及到的模块各自提供 catalog 和 scoped context。

```json
{
  "userText": "先打开音乐，然后播放周杰伦，同时打开天气查北京",
  "localParse": {
    "segments": [
      { "text": "打开音乐", "confidence": 0.96, "candidate": "music" },
      { "text": "播放周杰伦", "confidence": 0.78, "candidate": "music" },
      { "text": "打开天气查北京", "confidence": 0.84, "candidate": "weather" }
    ]
  },
  "moduleCatalog": [
    { "type": "music", "capabilities": ["打开", "搜索", "播放"] },
    { "type": "weather", "capabilities": ["打开", "查询城市天气"] }
  ]
}
```

Realtime-2 只返回结构化计划，不直接执行。

## 7. 每工具完整性测试矩阵

### 7.1 每个工具必须有独立测试文件

建议：

```txt
apps/web/src/widgets/modules/music/test-cases.json
apps/web/src/widgets/modules/weather/test-cases.json
apps/web/src/widgets/modules/clipboard/test-cases.json
```

### 7.2 每个工具至少覆盖

每个日常工具至少 60 条测试。复杂工具如 music、recorder、tv 至少 80 条测试。

- 20 条单工具命令。
- 10 条口语噪音命令。
- 5 条失败或缺参命令。
- 5 条 Realtime-2 兜底命令。
- 5 条与其他工具组合命令。
- 5 条窗口控制命令。
- 5 条权限、登录或 mounted capability 场景。
- 5 条学习系统回归命令。

覆盖类别：

- 精确命令。
- 啰嗦口语。
- 乱序表达。
- 缺少参数。
- 多义表达。
- 错误参数。
- 当前状态相关命令。
- 窗口打开/关闭。
- Realtime-2 兜底。
- 执行失败恢复。
- 多命令组合。
- 并发与顺序执行。
- 学习候选生成。
- 负例回归。
- 状态气泡。
- 日志脱敏。
- 真实页面验证。

### 7.3 测试用例格式

```json
{
  "id": "music-close-noisy-001",
  "input": "关闭，啊，这个，音乐",
  "expected": {
    "commands": [
      {
        "module": "music",
        "intent": "widget.close",
        "tool": "widget.close",
        "args": { "type": "music" }
      }
    ],
    "execution": "sequential",
    "needsRealtime": false,
    "needsConfirmation": true
  }
}
```

### 7.4 测试分层

每个模块至少要有以下测试层级：

#### 模块静态校验

验证：

- module schema 合法。
- aliases 不与其他模块高风险冲突。
- shortcuts 不互相覆盖危险语义。
- action args schema 和 result schema 存在。
- executionPolicy 声明完整。
- context provider 有字段白名单和 token 预算。

#### 本地解析测试

验证：

- 精确命令命中。
- 口语归一化命中。
- 乱序表达命中。
- 低置信度时不误执行。
- 多义表达能追问或进入 Realtime-2。
- learned shortcut 命中优先级正确。

#### CommandPlan 测试

验证：

- 单命令 plan。
- 同一工具多命令顺序 plan。
- 多工具并发 plan。
- mixed plan。
- destructive action 确认依赖。
- 失败传播只影响依赖链。

#### 执行器测试

验证：

- action 成功执行。
- action 参数错误。
- 权限缺失。
- 登录缺失。
- mounted capability 未注册。
- 外部 API 失败。
- 用户取消确认。
- 重试路径。

#### Realtime-2 兜底测试

验证：

- 未登录或 Supabase token 无效时不能创建 Realtime session。
- DataChannel open 后未收到 `session.updated` 时不能进入“聆听中”。
- `session.updated` 后才允许处理语音触发的工具选择。
- `response.created` 到 `response.done` / `response.cancelled` 期间不会重复发送冲突的 `response.create`。
- 第一阶段只发送 catalog。
- 第二阶段只发送相关模块上下文。
- 第一阶段工具选择低置信度时进入追问，不直接执行。
- Realtime 返回 plan 后经过 harness validate。
- Realtime 输出非法 tool 时被拒绝。
- Realtime 缺参时进入追问。
- Realtime 工具选择、参数生成、tool result 融入下一轮回应均写入脱敏日志。

#### 真实页面测试

验证：

- 小工具 UI 状态真实改变。
- 状态气泡可见。
- 并发状态不会覆盖。
- 确认弹窗可见且可取消。
- 日志记录完整但不泄露敏感内容。

### 7.5 首批工具专项测试要求

#### music

必须覆盖：

- 打开、关闭、聚焦音乐窗口。
- “关闭音乐”关闭窗口，“暂停音乐”暂停播放。
- 搜索歌曲、专辑、播放列表。
- 播放第一首、加入队列、下一首、上一首、继续播放。
- Apple Music 未登录、token 缺失、授权失败、搜索失败。
- MusicKit 正式播放与 iTunes preview fallback。
- “打开音乐，搜索周杰伦，播放第一首”的顺序依赖。
- “打开音乐，同时查天气”的跨工具并发。
- 低置信度音乐请求进入 Realtime-2 补 query。
- 学习“把音乐收了”后本地命中关闭窗口。

#### weather

必须覆盖：

- 打开、关闭、聚焦天气窗口。
- 查询指定城市。
- 城市缺失时追问或使用已确认默认城市。
- 城市名歧义。
- 连续查询多个城市时的 latest-wins 或历史保留策略。
- 与音乐、世界时钟、新闻并发。
- API 失败或离线状态。
- 学习默认城市。

#### clipboard

必须覆盖：

- 打开、关闭、聚焦剪贴板窗口。
- 保存文本。
- 清空剪贴板必须确认。
- 剪贴板为空时的安全响应。
- 敏感内容不进入模型上下文和日志。
- “清空剪贴板，然后保存 xxx”的确认依赖。
- 用户取消确认后后续依赖命令跳过。

#### todo

必须覆盖：

- 添加待办。
- 添加带时间、优先级或备注的待办。
- 完成待办。
- 删除待办必须确认。
- 缺少待办内容时追问。
- “添加待办：买牛奶，然后打开倒计时 10 分钟”的组合计划。
- 相似事项去重或确认。

#### translate

必须覆盖：

- 翻译指定文本。
- 指定目标语言。
- 未指定目标语言时使用默认或追问。
- 源文本过长时摘要或要求确认。
- 翻译结果复制到剪贴板的组合命令。
- 不把长隐私文本默认发给 Realtime-2。

#### calculator

必须覆盖：

- 基础四则运算。
- 中文数字和单位。
- 表达式非法。
- 除零。
- 结果写入窗口。
- “计算后保存到剪贴板”的跨工具依赖。
- 本地可算表达式不得调用模型。

#### countdown

必须覆盖：

- 设置倒计时。
- 开始、暂停、重置。
- “十分钟后提醒我”。
- 多个倒计时实例目标选择。
- 时间缺失或不合法。
- 与音乐组合，例如“播放音乐，然后十分钟后停止”。

#### worldClock

必须覆盖：

- 显示多个城市或时区。
- 城市别名。
- 删除或替换时区。
- 与天气组合。
- 城市歧义和无效城市。

#### market

必须覆盖：

- 查询指数。
- 查询多个市场。
- 市场别名，如标普、纳指、恒生。
- 数据不可用。
- 刷新行情。
- 与新闻组合。

#### headline

必须覆盖：

- 打开新闻。
- 刷新新闻。
- 指定主题。
- 指定地区。
- API 失败。
- 与市场组合，例如“看美股行情和相关新闻”。

#### recorder

必须覆盖：

- 打开录音。
- 开始录音。
- 暂停、继续、停止。
- 麦克风权限缺失。
- 录音中关闭窗口必须确认。
- 录音内容不进入模型上下文。
- 与 Realtime 麦克风占用冲突处理。

#### tv

必须覆盖：

- 打开电视。
- 播放频道。
- 暂停、继续、全屏。
- 搜索频道。
- mounted capability 未注册。
- 与音乐播放资源冲突。
- “打开电视播放 CCTV1，同时查天气”的并发。

### 7.6 首批工具

首批迁移和测试：

- music
- weather
- clipboard
- todo
- translate
- calculator
- countdown
- worldClock
- market
- headline
- recorder
- tv

游戏和 AI 表单暂不进入首批完整性测试。

## 8. 状态气泡与并发可视化

一句话多个命令时，UI 不能只显示一个状态。应显示父操作和多个子操作。

状态：

- `pending`
- `running`
- `waiting_confirmation`
- `success`
- `failed`
- `cancelled`
- `skipped`

示例：

```txt
正在执行：3 个操作

音乐
- 打开中
- 搜索周杰伦
- 播放中

天气
- 打开中
- 查询北京

剪贴板
- 等待确认
```

验收：

- 并发命令同时显示。
- 失败、确认、完成状态清楚。
- 每个子命令都有 operationId。
- 失败只影响依赖链。
- 用户能看到当前正在操作哪个工具。

## 9. 自我学习系统

### 9.1 目标

系统不仅要能执行命令，还要能把“Realtime-2 成功兜底 + 用户确认 + 执行成功”的结果沉淀为本地可命中的知识。

学习必须可审计、可撤销、可测试。危险行为必须确认，不能静默学习。

### 9.2 学习内容

#### 命令别名学习

例子：

```txt
把音乐收了
```

第一次本地未命中，Realtime-2 判断为：

```txt
widget.close music
```

执行成功后生成学习候选：

```json
{
  "type": "shortcut_alias",
  "module": "music",
  "rawText": "把音乐收了",
  "normalizedText": "音乐 收",
  "intent": "widget.close",
  "confidence": 0.92,
  "source": "realtime-success"
}
```

确认后，第二次同样表达由本地 harness 直接命中。

#### 模块别名学习

如果用户多次把“小唱片”“播放器”“歌单”解析成 `music`，系统可以建议：

```txt
是否把“小唱片”作为音乐小工具的别名？
```

确认后加入 `music.aliases` 的本地学习层。

#### 参数习惯学习

例子：

```txt
查天气
```

如果用户总是查北京，可建议：

```txt
你经常查询北京天气，是否以后“查天气”默认查询北京？
```

确认后保存默认参数。未确认时仍然追问。

#### 多命令计划学习

例子：

```txt
开始工作
```

第一次解析为：

- 打开待办。
- 打开天气。
- 播放白噪音。
- 打开时钟。

执行成功后可建议保存为宏命令。确认后生成 learned macro。

#### 失败案例学习

如果“关闭音乐”被错误解析成暂停，用户纠正：

```txt
关闭是关闭窗口，不是暂停
```

系统应生成负例和回归测试：

```json
{
  "negativeExample": "关闭音乐",
  "wrongIntent": "music.pause",
  "correctIntent": "widget.close",
  "module": "music"
}
```

#### 新工具模块学习

AI 生成新工具后，必须经过：

1. schema validate
2. sandbox test
3. 展示工具能力摘要
4. 用户确认安装
5. 写入工具库
6. 注册 aliases、shortcuts、tools、context
7. 自动生成测试矩阵

### 9.3 自动学习、确认学习和禁止学习

可以自动进入候选池：

- 口语噪音。
- 同义表达。
- 低风险打开/关闭窗口别名。
- 已成功执行多次的 harmless shortcut。
- 失败回归测试用例。

必须用户确认：

- 删除、清空、覆盖类命令。
- 支付、发送、发布类命令。
- 打开外部网站或远程服务。
- 安装新工具。
- 保存宏命令。
- 保存个人默认参数。
- 跨工具自动化流程。

禁止学习：

- 一次性敏感内容。
- 密码、token、隐私文本。
- 未经确认的破坏性操作。
- 模型不确定但碰巧成功的操作。

### 9.4 学习数据存储

学习结果先进入数据层，不直接改源码。

建议：

```txt
learned-shortcuts.json
learned-aliases.json
learned-macros.json
learned-defaults.json
learned-negative-examples.json
installed-widget-modules.json
```

### 9.5 学习链路

```txt
用户输入
=> 本地 harness 解析失败或低置信度
=> Realtime-2 兜底
=> harness 校验 plan
=> 执行成功
=> 记录 learning candidate
=> 判断学习风险
=> 低风险进入候选池
=> 中高风险请求用户确认
=> 写入本地学习库
=> 更新本地命中索引
=> 生成或更新测试用例
```

## 10. 低成本 24 小时运行模式

### 10.1 目标

用户希望小桌板 24 小时打开，但日成本可控。默认目标是低于 10 美元/天，省钱目标是低于 1 美元/天。

本计划采用“非激进低成本方案”：不强制先走浏览器原生语音识别，也不完全牺牲 Realtime-2 的阶段性对话能力；但 Realtime-2 不能长期持续接收所有麦克风音频。

### 10.2 成本假设

按 2026-06-17 官方价格口径估算：

- GPT-Realtime-2 audio input: `$32 / 1M tokens`。
- GPT-Realtime-2 audio output: `$64 / 1M tokens`。
- 用户音频约 `1 token / 100ms`。
- 助手音频约 `1 token / 50ms`。

换算：

```txt
用户有效语音 1 分钟 ~= 600 audio tokens ~= $0.0192
助手语音输出 1 分钟 ~= 1200 audio tokens ~= $0.0768
```

省钱目标 `$1 / 天` 的安全区间：

```txt
助手几乎不说话：约 52 分钟用户有效语音 / 天
助手输出约为用户语音 25%：约 26 分钟用户有效语音 / 天
助手输出接近用户语音时长：约 10 分钟对话 / 天
```

因此 `$1 / 天` 模式必须默认减少助手语音输出，更多使用状态气泡和短文本反馈。

### 10.3 运行状态机

系统应实现以下状态：

```txt
local_standby
=> local_wake_detected
=> realtime_connecting
=> realtime_command_window
=> realtime_dialogue_window
=> realtime_cooldown
=> local_standby
```

#### local_standby

默认 24 小时状态。

行为：

- 麦克风只用于本地 VAD、音量、人声活动、唤醒词或手动按钮。
- 不连接 Realtime-2。
- 不向 OpenAI 发送音频。
- 可执行文本输入和本地高置信度快捷命令。

验收：

- 待机 1 小时无 Realtime session 创建。
- 待机期间 OpenAI token 估算为 0。
- 背景噪声不会自动连接 Realtime-2。

#### realtime_command_window

用户唤醒后进入短命令窗口。

行为：

- 创建 Realtime-2 session。
- 只发送短时间音频和极简 catalog。
- 本地仍优先处理高置信度命令。
- 命令完成后进入 cooldown。

默认参数：

```txt
commandWindowIdleMs: 10000-15000
maxSingleCommandSessionMs: 60000
assistantAudioDefault: off
assistantFeedbackDefault: status_bubble
```

验收：

- 唤醒后可以完成一个模糊命令。
- 简单命令仍能本地直接执行。
- 10-15 秒无后续语音自动断开。

#### realtime_dialogue_window

当用户明显进入连续对话时，保留阶段性 Realtime-2 对话功能。

触发条件：

- 用户显式说“继续听”“我们聊一下”“接下来我连续说几个命令”。
- Realtime-2 正在追问缺失参数。
- 当前 CommandPlan 有多轮澄清。
- 用户在 cooldown 内继续说话。

默认参数：

```txt
dialogueIdleMs: 30000-60000
maxDialogueSessionMs: 5-15 分钟
assistantAudioMaxSecondsPerTurn: 3-5 秒
assistantVerboseAudio: false
```

验收：

- 用户可以阶段性连续对话，不需要每句话重新连接。
- 连续对话空闲后自动断开。
- 助手默认短答，不进行长语音播报。
- 工具执行反馈优先显示状态气泡。

#### realtime_cooldown

命令完成后的短等待期。

行为：

- 保持短时间连接，等待用户补充。
- 不主动让模型用 idle timeout 追问。
- 超时后断开 Realtime-2。

验收：

- 用户补一句“再查上海天气”可以复用当前会话。
- 无语音补充时自动回到 local_standby。

### 10.4 预算门控

必须实现本地预算估算和硬限制。

记录指标：

- `realtimeActiveMs`
- `estimatedUserAudioSeconds`
- `estimatedAssistantAudioSeconds`
- `textInputTokens`
- `textOutputTokens`
- `estimatedCostUsd`
- `realtimeSessionCount`
- `fallbackCount`
- `localHitCount`

默认预算：

```txt
dailyBudgetUsd: 1.00
softLimitUsd: 0.80
hardLimitUsd: 1.00
singleSessionSoftLimitMs: 5 分钟
singleSessionHardLimitMs: 15 分钟
assistantAudioDailyLimitSeconds: 5-10 分钟
```

软上限行为：

- 继续允许当前用户确认的会话。
- 新的自动唤醒不再直接连接 Realtime-2。
- 提示用户当前进入省钱模式。
- 优先本地解析和状态气泡。

硬上限行为：

- 自动断开 Realtime-2。
- 当天不再自动连接。
- 用户手动确认后才能继续。
- 所有简单命令仍可本地执行。

### 10.5 模型输出成本控制

默认策略：

- 工具执行成功只显示状态气泡。
- 需要语音反馈时使用极短句。
- 长结果不读出，只展示在小工具中。
- Realtime-2 不做长解释。
- 低置信度才进入 Realtime-2。
- 学习成功后，下次本地命中。

禁止：

- 24 小时持续向 Realtime-2 推送音频。
- 开启 Realtime idle timeout 让模型自动反复追问。
- 每个工具执行结果都让 Realtime-2 语音播报。
- 把完整桌面上下文用于降低模型误判。

### 10.6 低成本模式验收

必须完成这些测试：

- 24 小时模拟待机，确认不会创建 Realtime session。
- 1 小时背景噪声测试，确认不会误唤醒或成本明显增长。
- 唤醒后完成一次复杂命令，执行后 10-15 秒自动断开。
- 阶段性连续对话 5 分钟，确认可连续追问和执行。
- 达到 `$0.80` 软上限后自动进入省钱模式。
- 达到 `$1.00` 硬上限后停止自动连接 Realtime-2。
- 状态气泡可显示当日估算成本、Realtime active 时长和当前模式。
- 所有本地命中命令不增加 Realtime 成本。

## 11. 安全、稳定性、日志与审计

### 11.1 Realtime API 鉴权

Realtime API 是 OpenAI 配额入口，必须先补用户鉴权。

要求：

- 客户端请求 `/api/realtime/session` 和 `/api/realtime/tool-call` 时携带 `Authorization: Bearer <supabase-session-access-token>`。
- 服务端使用 Supabase `auth.getUser(token)` 校验登录用户。
- 校验失败返回 401，不创建 OpenAI client secret，不调用 Responses API。
- OpenAI Safety Identifier 由服务端基于 `data.user.id` 生成。
- 客户端传入的 `safetyIdentifier` 只能作为非信任 hint 或完全废弃，不能进入安全决策。

验收：

- 未登录直接请求 session 返回 401。
- 伪造 `safetyIdentifier` 不能影响 OpenAI-Safety-Identifier。
- 已登录用户可以创建 session。
- 日志中只记录 hash 后 user id 或 operation id，不记录 access token。

### 11.2 Realtime 连接状态

连接状态不能只以 DataChannel open 为准。

状态：

- `transport_open`：DataChannel 已打开，但 session 配置未确认。
- `session_updating`：已发送 `session.update`。
- `session_ready`：收到 `session.updated`，可以进入聆听和工具选择。
- `session_failed`：超时或配置失败。

要求：

- `sessionReady=false` 时不处理工具调用。
- 3-5 秒未收到 `session.updated` 时断开。
- UI 文案区分“连接中”“配置中”“聆听中”“配置未生效”。
- session.update 中的 instructions、tools、turn detection 必须来自共享配置模块。

### 11.3 Active Response 防撞

工具结果回传不能无条件创建新 response。

要求：

- 监听 `response.created`、`response.done`、`response.cancelled`。
- 维护 `activeResponseId`。
- `sendToolResult()` 先发送 `function_call_output`。
- 只有没有 active response 时才发送 `response.create`。
- 用户打断时需要取消或等待当前 active response 状态明确后再继续。

验收：

- 连续两个工具结果返回时不出现 active response 竞态。
- 用户打断模型说话后，后续工具结果仍能被正确融入下一轮。
- 自动 turn detection 和应用层 `response.create` 不互相抢占。

### 11.4 共享 Realtime 配置

前端和服务端必须使用同一份 Realtime 配置源。

建议共享模块：

```txt
packages/assistant-core/src/realtimeConfig.ts
```

包含：

- `XIAOZHUOBAN_REALTIME_MODEL`
- `XIAOZHUOBAN_REALTIME_INSTRUCTIONS`
- `encodeRealtimeToolName`
- `decodeRealtimeToolName`
- `createRealtimeTurnDetection`
- `createToolSelectionTool`
- tool selection confidence threshold

要求：

- 前端 WebRTC adapter 和 API session 都从共享模块读取 model、instructions、tools 和 turn detection。
- `/api/realtime/tool-call` 使用独立文本模型配置，例如 `XIAOZHUOBAN_TEXT_TOOL_MODEL`。
- 未配置文本模型时 fallback 到明确的低延迟文本模型，不默认使用 `gpt-realtime-2`。

### 11.5 结构化日志与 Supabase Audit

每次命令处理都必须记录结构化日志。登录用户默认写入 Supabase audit；未登录或本地开发可降级到 localStorage audit。

```json
{
  "time": "2026-06-17T10:00:00+08:00",
  "operationId": "op-123",
  "userIdHash": "user-hash",
  "boardId": "board-id",
  "input": "关闭，啊，这个，音乐",
  "normalizedText": "关闭 音乐",
  "segments": ["关闭 音乐"],
  "candidateModules": [
    { "type": "music", "score": 0.93 }
  ],
  "selectedModule": "music",
  "selectedToolHint": "widget.close",
  "selectionConfidence": 0.93,
  "decision": "local",
  "sourceMode": "shortcut",
  "tool": "widget.close",
  "sanitizedArgs": { "type": "music" },
  "targetWidget": "music-widget-id",
  "result": "success",
  "durationMs": 120,
  "learningCandidate": true
}
```

日志必须能区分：

- local 命中。
- learned 命中。
- Realtime-2 兜底。
- text LLM 降级。
- 用户确认。
- 用户取消。
- 执行失败。
- 工具缺失。
- 权限不足。
- selection confidence。
- 第一阶段 tool selection。
- 第二阶段参数生成。
- scoped context 字段白名单命中情况。
- tool result 是否被融入下一轮回应。

日志不得包含：

- 原始音频。
- API key 或 token。
- 完整剪贴板历史。
- 大段私密文本。
- 未过滤的桌面全量上下文。

日志分析目标：

- 哪些语音命令最常失败。
- 哪些工具选择错误最多。
- 哪些 widget 缺少 capability。
- shortcut、model、function_call 三条路径分别命中多少。
- 哪些表达适合进入学习候选。
- 哪些 scoped context 字段造成模型混淆或泄露风险。

### 11.6 云端写入 Outbox

桌面操作可以继续使用乐观 UI，但云端写入必须有可见、可重试的 outbox。

建议数据结构：

```json
{
  "id": "mutation-id",
  "type": "widget.upsert",
  "payload": {},
  "createdAt": "2026-06-17T10:00:00+08:00",
  "retryCount": 0,
  "status": "pending"
}
```

流程：

1. UI 乐观更新。
2. mutation 进入 outbox。
3. 后台同步。
4. 成功后移除。
5. 失败后显示“有 X 个更改待同步”，支持重试。

验收：

- 网络失败时用户能看到待同步状态。
- 重试成功后 outbox 清空。
- 关闭页面再打开后，未完成 mutation 仍能继续同步。
- 日志能关联 command operationId 与 outbox mutation id。

## 12. 分步实施 Milestones

实施顺序必须覆盖本计划的完整目标链路，而不是只围绕 Realtime 或只围绕模块边界推进。先保护配额入口和连接稳定性，再建立模块协议与全工具骨架；随后把语言入口、两阶段上下文、CommandPlan、执行安全、审计、测试矩阵、真实页面验证、低成本运行、自学习和热加载逐层接上。任何 milestone 完成后都必须运行相关本地测试，并在实施/测试日志中记录输入、计划、结果和未完成项。

### Milestone 0: 职责边界与模型分工冻结

目标：冻结本地 harness、Realtime-2、STT、文本 fallback、远程 Codex 和未来 AI Builder 的职责，防止后续实现互相越界。

交付：

- `LocalHarnessResponsibility`
- `RealtimePlannerResponsibility`
- `TranscriptionResponsibility`
- `TextModelFallbackResponsibility`
- `RemoteCodexResponsibility`
- `AiModuleBuilderResponsibility`
- 模型调用优先级文档。
- `CommandPlan` 初版数据结构。
- “所有模型输出必须回到 harness validate” 规则。

验收：

- 本地高置信度命令不调用任何模型。
- Realtime-2 只负责复杂口语、低置信度、多重语义、短期会话和两阶段工具编排。
- STT 可以由 `gpt-4o-mini-transcribe` 或 `gpt-realtime-whisper` 承担，Realtime-2 不被定义为唯一 STT。
- 文本 fallback 不默认使用 `gpt-realtime-2`。
- 远程 Codex 不参与实时执行，不接收实时麦克风流。
- AI Builder 不直接安装或执行新工具。
- 所有工具执行都有 operationId、权限判断和日志入口。

### Milestone 1: Realtime API 鉴权与配额入口保护

目标：先保护 OpenAI 配额入口，避免未登录请求直接创建 Realtime session 或调用 tool-call fallback。

交付：

- `/api/realtime/session` Supabase access token 校验。
- `/api/realtime/tool-call` Supabase access token 校验。
- 服务端通过 Supabase `auth.getUser(token)` 派生 user id。
- OpenAI Safety Identifier 只由服务端 user id 生成。
- 401 错误响应和前端可见失败状态。
- 鉴权失败测试和不调用 OpenAI 的回归测试。

验收：

- 未登录请求 session 返回 401。
- token 过期请求 session 返回 401。
- 未登录请求 tool-call 返回 401。
- 客户端伪造 `safetyIdentifier` 不影响服务端 Safety Identifier。
- 鉴权失败时不创建 Realtime client secret，不调用 Responses API。
- 日志不记录 Supabase access token、OpenAI key 或原始 authorization header。

### Milestone 2: Realtime 连接稳定性与共享配置

目标：让 Realtime 连接状态、session 配置和 response 生命周期可控，作为后续模块工具扩展的稳定地基。

交付：

- 共享 Realtime 配置模块：model、instructions、turn detection、tool selector、tool name 编解码。
- 独立文本 fallback 模型配置。
- `sessionReady` 状态。
- DataChannel open 后发送 `session.update`。
- 收到 `session.updated` 后才进入“聆听中”。
- `session.updated` 超时失败处理。
- `activeResponseId` 防撞逻辑。
- `response.created` / `response.done` / `response.cancelled` 监听。

验收：

- DataChannel open 但未收到 `session.updated` 时 UI 不显示“聆听中”。
- `sessionReady=false` 时不会处理语音触发的工具调用。
- 3-5 秒未收到 `session.updated` 时断开并显示“会话配置未生效”。
- 工具结果回传时先发送 `function_call_output`。
- 只有没有 active response 时才发送 `response.create`。
- 用户打断和连续工具结果不会触发 active response 竞态。
- 前端和 API 使用同一份 Realtime model、instructions、turn detection 和 selector。
- `/api/realtime/tool-call` 使用明确文本 fallback，不默认走 Realtime 模型。

### Milestone 3: 标准模块协议与注册中心

目标：建立所有小工具共同遵守的模块协议和 registry，让后续快捷命令、Realtime、planner、测试、学习和热加载都只面向模块注册中心。

交付：

- `WidgetAssistantModule`
- `WidgetModuleActionSpec`
- `ShortcutRule`
- `WidgetContextProvider`
- `WidgetRealtimeProvider`
- `WidgetExecutionPolicy`
- `WidgetCapabilityRegistration`
- `WidgetTestMatrix`
- `WidgetAssistantRegistry`
- `registerModule()`
- `enableModule()`
- `disableModule()`
- `unregisterModule()`
- `listModules()`
- legacy action / shortcut / capability 兼容适配器。

验收：

- 可以注册一个空模块。
- 可以读取模块 `type`、`definition`、`aliases`、`tools`、`shortcuts`、`context`、`realtime`、`executionPolicy` 和 `testMatrix`。
- registry 可以按启用状态返回模块、catalog、shortcuts 和 tools。
- 禁用模块后，该模块不再暴露 catalog、shortcuts、tools 或 scoped context。
- 现有手动注册 action 和现有 shortcut router 仍可通过兼容层工作。
- registry 结构支持未来动态注册、禁用、卸载和热加载。
- 构建和现有测试通过。

### Milestone 4: 首批工具模块骨架与设计说明

目标：先为首批日常工具全部落下独立模块边界，哪怕内部仍桥接旧 action；不能等到后期才补模块目录。

交付：

- `apps/web/src/widgets/modules/<type>/assistant.ts`
- `apps/web/src/widgets/modules/<type>/definition.ts`
- `apps/web/src/widgets/modules/<type>/shortcuts.ts`
- `apps/web/src/widgets/modules/<type>/tools.ts`
- `apps/web/src/widgets/modules/<type>/context.ts`
- `apps/web/src/widgets/modules/<type>/realtime.ts`
- `apps/web/src/widgets/modules/<type>/executionPolicy.ts`
- `apps/web/src/widgets/modules/<type>/module.md`
- `apps/web/src/widgets/modules/<type>/test-cases.json`
- 首批工具骨架：music、weather、clipboard、todo、translate、calculator、countdown、worldClock、market、headline、recorder、tv。

验收：

- 每个首批工具都有独立目录和模块导出。
- 每个模块声明工具身份、aliases、窗口语义、核心动作、权限、风险、上下文字段白名单和测试矩阵入口。
- 每个模块的 `module.md` 写明支持动作、不支持动作、窗口控制语义、并发策略、权限、测试覆盖摘要和已知限制。
- 内部桥接旧 action 时必须标注 `legacyBridge: true` 和迁移 TODO。
- 不改变任何已完成快捷命令语义。
- 构建和现有测试通过。

### Milestone 5: 快捷命令归属、候选模块选择与兼容迁移

目标：把现有快捷命令作为兼容资产迁入模块体系，同时建立本地候选模块选择器，避免本地规则无限扩张。

交付：

- `LegacyShortcutInventory`
- `ModuleShortcutManifest`
- `ShortcutMigrationReport`
- `ShortcutConflictReport`
- `normalizeText()`
- `scoreCandidateModules()`
- 通用窗口命令生成器：打开、关闭、隐藏、聚焦、恢复。
- 每个模块的正例、负例和冲突回归测试。

验收：

- 无冲突旧快捷命令继续命中同一工具、同一参数和同一风险等级。
- “关闭音乐”归属 music 模块且语义是关闭窗口，不是暂停。
- “暂停音乐”归属 music 模块且语义是暂停播放，不是关闭窗口。
- “清空剪贴板”归属 clipboard 模块且进入确认策略。
- 通用窗口命令由系统层组合，但目标 aliases 来自模块。
- 专属业务命令必须归属到对应模块。
- 候选模块选择输出候选 type、score 和 reason。
- 低置信度或候选分数接近时不执行，进入 Realtime-2 或追问。
- 发现冲突时先写冲突报告和回归测试，再做最小修正。

### Milestone 6: 模块化 Realtime 两阶段上下文

目标：把 Realtime-2 的两阶段协议真正接到模块 registry：第一阶段选模块，第二阶段只给 selected module scoped context。

交付：

- `RealtimeModuleCatalogItem`
- `ScopedContextRequest`
- `RealtimeScopedModuleContext`
- `redactContext()`
- `maxRealtimeContextTokens`
- `ModuleCatalogPrompt`
- `ScopedContextPrompt`
- `assistant.select_module` 或等价 selector。
- selected module scoped session update。
- catalog / scoped context snapshot tests。

验收：

- 第一阶段只发送模块 type、displayName、aliases、capabilities、shortcutExamples、riskSummary。
- 第一阶段不发送 widgetId、definitionId、完整 widget state、剪贴板内容、便签全文、录音内容或搜索历史。
- 第二阶段只发送 selected module 的 tools、toolSchemas、instances 摘要、stateSummary、shortcutExamples、executionPolicy 和 riskPolicy。
- 第二阶段上下文必须经过 `redactContext()`。
- `confidence < 0.65` 时追问或让用户选择候选模块，不执行。
- 禁用模块不会出现在 Realtime catalog。
- 每个首批模块都有 catalog 和 scoped context 单测。

### Milestone 7: CommandPlan、Planner 与 Harness Validate

目标：把本地规则、Realtime-2、文本 fallback、学习规则和未来远程 Codex 输出统一成 `CommandPlan`，并在 harness 中校验后执行。

交付：

- `segmentCommandText()`
- `CommandPlan`
- `CommandPlanStep`
- `DependencyGraph`
- `ExecutionGroup`
- `PlanValidator`
- `PlanMerge`
- `RealtimePlanFallback`
- `TextFallbackPlanAdapter`
- schema extra-field rejection / ignored-field logging。

验收：

- “关闭，啊，这个，音乐”本地生成 music close-window plan。
- “音乐关掉一下”本地生成 music close-window plan。
- “帮我查一下北京天气”本地生成 weather query plan。
- “先打开音乐，再播放周杰伦，同时查北京天气”可以生成 mixed plan。
- Realtime 第二阶段返回结果必须先转换为 `CommandPlan`。
- 非法 tool、禁用模块、越权参数和额外字段被拒绝或脱敏记录。
- 已完成且无冲突的快捷命令在 planner 接入后保持原语义。
- 有冲突的快捷命令必须输出冲突原因、候选模块和回归测试，不得静默覆盖。

### Milestone 8: Action Schema、Preview Gate 与确认策略

目标：减少模型参数漂移，并把高风险操作统一收进 plan -> preview -> confirm -> execute 流程。

交付：

- 每个 module action 的最小 args schema。
- 每个 module action 的 result schema。
- 每个 mounted capability 的最小 args schema。
- schema 拒绝额外字段策略。
- `PlanPreview`
- `ConfirmationGate`
- destructive / bulk action policy。
- mounted capability 缺失错误模型。

验收：

- `music.pause` 不接受无关 query。
- `messageBoard.post` 必须有 text。
- `tv.select_channel` 只接受频道相关字段。
- `clipboard.clear`、覆盖内容、导入、批量整理、AI 添加新工具必须 preview。
- 用户取消确认后不执行相关依赖链。
- 高风险命令不会因为 Realtime-2 低置信度而直接执行。
- 每个首批模块至少有一个 schema 拒绝额外字段测试。

### Milestone 9: 执行引擎、并发、取消与状态气泡

目标：让多命令计划可顺序、并发、取消、失败隔离，并且用户能看到每个工具当前状态。

交付：

- `CommandExecutor`
- `ParallelExecutor`
- `SequentialExecutor`
- `FailurePolicy`
- `CancellationPolicy`
- `OperationBubble`
- `CommandGroupBubble`
- `PerToolStatus`
- `ExecutionTimeline`

验收：

- 同一工具依赖命令顺序执行。
- 不同工具无依赖命令并发执行。
- 失败只中断依赖链。
- 确认只阻塞相关链。
- 每个 command 都有 operationId。
- 一句话多个命令时显示多个子状态。
- 并发命令同时显示。
- 用户可以看到当前正在操作哪个模块和工具。
- 状态气泡不会被长队列撑破布局。

### Milestone 10: 结构化 Audit、测试日志与指标口径

目标：让每一次模块选择、参数生成、计划校验、执行、失败和学习候选都能被查询、复盘和生成测试。

交付：

- 登录用户默认 `createSupabaseAssistantAuditAdapter()`。
- 未登录或开发环境 local audit fallback。
- 日志字段：route、source_mode、transcript、normalized、segments、candidateModules、selectionConfidence、selectedModule、selectedToolHint、tool_name、sanitized_args、target_widget、result_status。
- Realtime 第一阶段和第二阶段日志。
- registry enable/disable、fallback、confirmation、learning candidate 日志。
- 真实页面测试 log 模板。
- 命中率、fallback 率、失败率和误命中率查询口径。

验收：

- local、learned、Realtime-2、text LLM、function_call 路径可区分。
- module selection、tool selection、args generation 和 plan validation 都能追踪 operationId。
- 日志不泄露完整剪贴板、便签、录音、token 或全量桌面上下文。
- 能查询最常失败命令、模块选择错误、工具选择错误、缺失 capability 和 fallback 命中率。
- 每个真实页面测试有 input、plan、result 和状态气泡证据。

### Milestone 11: 每工具测试矩阵 Runner

目标：把第 7 节的每工具完整性测试矩阵变成可执行资产，而不是只停留在文档要求。

交付：

- `WidgetModuleTestRunner`
- `test-cases.json` schema。
- 本地解析测试 runner。
- CommandPlan 测试 runner。
- 执行器 mock 测试 runner。
- Realtime 两阶段 snapshot runner。
- 真实页面测试记录模板。
- 回归测试生成入口。

验收：

- 每个模块至少有独立测试文件。
- 每个日常工具至少覆盖单工具、组合命令、窗口控制、失败场景、低置信度兜底和日志脱敏。
- music、recorder、tv 的权限和 mounted capability 场景单独覆盖。
- 测试 runner 可以报告未覆盖动作、未覆盖风险等级和未覆盖 scoped context 字段。
- 失败命令可以被转成回归测试候选。

### Milestone 12: 音乐模块完整 Pilot

目标：用 music 做第一个完整模块，贯通模块协议、快捷命令、Realtime 两阶段、CommandPlan、schema、执行、状态气泡、日志和测试矩阵。

交付：

- `music.assistant.ts`
- `music.shortcuts.ts`
- `music.tools.ts`
- `music.context.ts`
- `music.realtime.ts`
- `music.executionPolicy.ts`
- `music.test-cases.json`
- MusicKit 登录、搜索、播放、专辑、播放列表和控制能力。
- Apple Music 授权失败与 preview fallback 状态。

验收：

- “打开音乐”打开或聚焦音乐小工具。
- “关闭音乐”关闭窗口，不是暂停。
- “暂停音乐”暂停播放，不关闭窗口。
- “搜索周杰伦播放第一首”建立搜索结果依赖。
- 可以搜索并播放歌曲、专辑和播放列表。
- 未登录 Apple Music 时有明确失败状态。
- 低置信度音乐请求进入 Realtime-2 第二阶段补 query。
- music scoped context 不发送完整播放历史。
- 所有动作都有状态气泡和日志。

### Milestone 13: 信息查询类工具完整迁移

目标：迁移主要查询型工具，验证只读或低风险工具的模块化通用性。

工具范围：

1. weather
2. worldClock
3. market
4. headline
5. calculator
6. translate

每个工具交付：

- 独立 module 文件补齐并去掉不必要的 legacy bridge。
- shortcuts。
- tools。
- catalog context。
- scoped context。
- executionPolicy。
- test-cases。
- real-page verification log。
- 最小 action args schema。
- scoped context 字段白名单。
- 旧快捷命令迁移清单。
- 冲突快捷命令处理记录。

每个工具验收：

- 单工具命令通过。
- 口语噪音通过。
- 组合命令通过。
- Realtime 两阶段兜底通过。
- 失败场景通过。
- 状态气泡正确。
- 日志完整。
- 敏感上下文不进入模型。
- 无冲突旧快捷命令继续可用。
- 工具模块可以被 registry 独立发现、注册和禁用。

### Milestone 14: 内容与任务类工具完整迁移

目标：迁移会读取或修改用户内容的工具，重点验证隐私摘要、确认门、失败恢复和学习候选。

工具范围：

1. clipboard
2. todo
3. countdown

每个工具交付：

- 独立 module 文件补齐并去掉不必要的 legacy bridge。
- shortcuts。
- tools。
- catalog context。
- scoped context。
- executionPolicy。
- test-cases。
- real-page verification log。
- 最小 action args schema。
- scoped context 字段白名单。
- 旧快捷命令迁移清单。
- 冲突快捷命令处理记录。

每个工具验收：

- clipboard 默认不发送完整内容，只提供是否为空、条目数量和可执行动作。
- todo 默认不发送全部待办全文，只发送必要摘要和目标选择信息。
- countdown 控制命令可本地命中，复杂组合可进入 Realtime 两阶段。
- 清空、覆盖、批量完成等高风险动作必须 preview / confirm。
- 无冲突旧快捷命令继续可用。
- 工具模块可以被 registry 独立发现、注册和禁用。

### Milestone 15: 媒体与权限类工具完整迁移

目标：迁移依赖浏览器权限、第三方服务或 mounted capability 的工具，验证 capability bridge 和权限错误模型。

工具范围：

1. recorder
2. tv

每个工具交付：

- 独立 module 文件补齐并去掉不必要的 legacy bridge。
- shortcuts。
- tools。
- catalog context。
- scoped context。
- executionPolicy。
- capability registration。
- test-cases。
- real-page verification log。
- 最小 capability args schema。
- 权限和登录失败模型。
- 旧快捷命令迁移清单。
- 冲突快捷命令处理记录。

每个工具验收：

- recorder scoped context 只提供录音状态和麦克风权限状态，不发送录音内容。
- tv scoped context 只提供当前频道、播放状态和必要频道槽位，不发送无关 widget 状态。
- mounted capability 不存在时失败可见且可审计。
- 权限拒绝、设备缺失、外部播放失败都有明确用户文案。
- 无冲突旧快捷命令继续可用。
- 工具模块可以被 registry 独立发现、注册和禁用。

### Milestone 16: 低成本 24 小时运行模式

目标：让“小桌板 24 小时打开”不等于 Realtime-2 24 小时收音。

交付：

- 本地待机状态机。
- 本地 VAD / 唤醒检测接入点。
- Realtime 按需连接和自动断开。
- command window / dialogue window / cooldown 配置。
- 每日预算估算器。
- 软上限和硬上限策略。
- 状态气泡中的成本和模式提示。
- Realtime active time 日志。
- STT 与 Realtime-2 分工策略。

验收：

- 24 小时待机模拟不会创建 Realtime session。
- 唤醒后能进入 Realtime command window。
- 用户阶段性连续对话时能保持 Realtime dialogue window。
- 空闲后自动断开并回到 local_standby。
- 达到 `$0.80` 软上限后切入省钱模式。
- 达到 `$1.00` 硬上限后停止自动连接 Realtime-2。
- 简单命令本地命中，不增加 Realtime 成本。
- 助手语音输出默认短句或关闭，长结果使用状态气泡和工具 UI。

### Milestone 17: 云端写入 Outbox

目标：保留乐观 UI，同时让云端写入失败可见、可重试、可审计。

交付：

- `pending_mutations` outbox。
- mutation retry policy。
- sync status bubble。
- command operationId 与 mutation id 关联。
- 页面重载后的 outbox 恢复。

验收：

- 添加、删除、更新 widget 网络失败时进入 outbox。
- UI 显示待同步数量。
- 用户可以手动重试。
- 重试成功后 outbox 清空。
- 同步失败不会被误记为执行完全成功。
- 日志能关联 command operationId 与 outbox mutation id。

### Milestone 18: 自我学习系统

目标：把 Realtime-2 成功兜底、用户确认和执行成功沉淀成本地规则，但必须可审计、可撤销、可测试。

交付：

- `LearningCandidateRecorder`
- `LearningPolicy`
- `LearnedCommandStore`
- `LearnedShortcutMatcher`
- `LearnedMacroRegistry`
- `RegressionCaseGenerator`
- `ModuleInstallReview`
- `LearningAuditLog`

验收：

- 第一次说“把音乐收了”需要 Realtime-2，成功后生成学习候选。
- 用户确认后，第二次“把音乐收了”本地命中。
- 用户纠正“关闭音乐不是暂停”后生成负例和回归测试。
- 用户说“开始工作”成功执行多个工具后，可保存为宏命令。
- 用户取消学习后，该表达不会进入本地命中范围。
- 学习规则冲突时提示冲突，不静默覆盖旧规则。
- 学习候选必须绑定模块、tool、args schema、风险等级和回归测试。

### Milestone 19: AI 生成模块与热加载

目标：后置 AI Builder，不抢在安全、Realtime 稳定和日常工具可靠性前面。

交付：

- AI module schema。
- module validator。
- sandbox test runner。
- install preview UI。
- user confirmation flow。
- dynamic module registry。
- Prompt 到 LLM JSON schema 到 Zod validate 到 WidgetDefinition preview 的链路。

验收：

- AI 生成一个测试小工具后，用户确认前只能预览。
- 模型只能生成受限 WidgetDefinition JSON，不直接写 React 代码。
- logicSpec 只支持白名单表达式。
- 用户确认后加入工具库。
- “打开 + 工具名”可以命中新工具。
- 新工具能暴露自己的快捷命令。
- Realtime-2 可以通过 catalog 发现它。
- 热加载失败时不会影响已有小工具。
- 热加载新模块不得覆盖已有无冲突快捷命令。
- 新模块快捷命令与已有模块冲突时必须进入安装前 review。
- 用户可以禁用或卸载新工具。

### Milestone 20: 真实页面总体验收

必须在真实页面测试：

```txt
关闭，啊，这个，音乐
打开音乐，播放周杰伦
先打开音乐，再搜索七里香，然后播放第一首
打开音乐，同时查北京天气
关闭音乐和天气
清空剪贴板，然后添加一条待办：明天买牛奶
打开天气查北京，再打开世界时钟看东京时间
暂停音乐，同时打开新闻
帮我放点轻松的音乐，然后把倒计时设为 10 分钟
把音乐收了
开始工作
```

每条测试必须记录：

- 原始输入。
- 归一化文本。
- 命令片段。
- 候选模块。
- 是否调用 Realtime-2。
- 最终 CommandPlan。
- 执行顺序或并发分组。
- 每个工具执行结果。
- 状态气泡截图或日志。
- 是否产生学习候选。

## 13. 风险与约束

### 13.1 API 滥用风险

风险：未登录用户或外部脚本直接调用 Realtime API，消耗 OpenAI 配额。

约束：

- Realtime API 必须校验 Supabase access token。
- OpenAI Safety Identifier 只能由服务端 user id 派生。
- 鉴权失败不创建 session、不调用模型。
- 日志不能记录 token 或 authorization header。

### 13.2 上下文泄露风险

风险：Realtime 或其他模型收到过多桌面上下文。

约束：

- 初始只发送 catalog。
- 选中工具后只发送局部上下文。
- 日志中不得记录敏感 payload。
- 低置信度选择阶段不能携带完整 tool schema 或 widget 状态。

### 13.3 Realtime 连接竞态风险

风险：DataChannel 已打开但 session.update 尚未生效，或 response.create 与自动 turn detection 互相抢占。

约束：

- 收到 `session.updated` 前不能进入 session_ready。
- `sessionReady=false` 时不处理工具调用。
- 维护 active response 状态。
- 工具结果回传时避免重复 `response.create`。

### 13.4 学习误伤风险

风险：错误解析被学习成本地规则。

约束：

- 学习需要成功执行证据。
- 中高风险学习必须用户确认。
- 所有学习规则可撤销。
- 自动生成回归测试。

### 13.5 并发执行风险

风险：多个工具同时执行导致状态冲突。

约束：

- 每个模块声明 executionPolicy。
- harness 做依赖图和冲突检测。
- 失败只影响依赖链。

### 13.6 新工具热加载风险

风险：AI 生成工具执行危险代码或污染工具库。

约束：

- 用户确认前只允许预览。
- 必须 schema validate。
- 必须 sandbox test。
- 必须声明风险等级。
- 必须可禁用和卸载。

### 13.7 成本失控风险

风险：Realtime-2 被当作 24 小时常驻语音理解层，导致静音、背景噪声或助手长语音输出持续计费。

约束：

- 默认 24 小时状态必须是 local_standby。
- Realtime-2 只能按需短连接。
- 阶段性对话必须有 idle timeout 和 hard cap。
- 每日预算必须有软上限和硬上限。
- 助手语音输出默认短句或关闭。
- 达到硬上限后必须停止自动连接。

## 14. 最终成功标准

改造完成后，系统应达到：

- 新增日常小工具时，只需提供标准模块即可注册。
- 本地命中覆盖常见口语表达和学习过的表达。
- Realtime-2 是实时语音交互、复杂口语解析、工具编排和短期会话上下文层，但只按两阶段协议接收 catalog 或 scoped context，不接收全量上下文。
- 输入转写、实时语义理解、文本 fallback 和远程工程代理职责清晰分离。
- Realtime API 受 Supabase 登录用户保护，未授权请求不能消耗 OpenAI 配额。
- Realtime 会话以 `session.updated` 作为 ready 标准，并有 active response 防撞机制。
- 24 小时打开时，默认处于本地低成本待机，Realtime-2 只在唤醒或阶段性对话时短连接。
- 省钱模式下可以把日成本控制在 1 美元目标内，并在预算上限时自动降级。
- 一句话多个工具、多条命令可以生成可审计 CommandPlan。
- 顺序、并发、确认和失败传播规则清晰。
- 每个小工具都有完整测试矩阵。
- 每次执行都有状态气泡和结构化 Supabase/local audit 日志。
- 每个 capability 有最小参数 schema，高风险操作进入 preview / confirm / execute。
- 云端写入失败进入 outbox，用户能看到待同步状态并重试。
- 成功兜底的表达可以在用户确认后沉淀为本地规则。
- AI 生成的新工具可以在用户确认后热加载到工具库。
