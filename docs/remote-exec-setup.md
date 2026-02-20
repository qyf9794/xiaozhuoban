# 远程一键执行（GitHub 公网 API）

## 1) 生成 Fine-grained PAT（一次）
- 访问：https://github.com/settings/personal-access-tokens/new
- Repository access：Only select repositories → `qyf9794/xiaozhuoban`
- Permissions（Repository）：
  - Actions: Read and write
  - Contents: Read-only
- 复制 token（仅显示一次）

## 2) 在小桌板「远程执行」组件里添加如下配置

### 方案A：触发 build_web
- 方法：`POST`
- URL：
  `https://api.github.com/repos/qyf9794/xiaozhuoban/actions/workflows/remote-exec.yml/dispatches`
- Body：
```json
{"ref":"feat/remote-link-executor","inputs":{"action":"build_web","payload":"from widget"}}
```
- Headers：
```json
{"Authorization":"Bearer <YOUR_PAT>","Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}
```

### 方案B：触发 test_all
把 Body 里的 `action` 改成 `test_all` 即可。

## 3) 结果查看
- Actions 页面：
  https://github.com/qyf9794/xiaozhuoban/actions/workflows/remote-exec.yml

> 安全提示：PAT 不要分享，不要放到公开仓库。建议定期轮换。