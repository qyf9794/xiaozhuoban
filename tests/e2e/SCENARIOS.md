# MVP1 E2E Scenarios (Playwright Draft)

1. 创建与恢复
- 新建 Workspace
- 新建 Board
- 添加便签 Widget 并输入文本
- 刷新页面后内容和布局仍存在

2. 布局模式切换
- 在 grid 模式拖动 Widget，检查吸附
- 切换到 free 模式拖动 Widget，检查自由移动
- 再切回 grid，布局状态不丢失

3. AI 生成 Widget
- 打开 AI 生成器
- 输入提示词并生成
- 检查自动新增 AI 表单 Widget
- 提交表单并看到反馈消息

4. 全局搜索
- 打开 Cmd/Ctrl + K
- 搜索便签内容关键词
- 检查命中 Widget 条目
