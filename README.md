# xiaozhuoban
一站式桌面小工具（云端主数据版）

## 本地启动（Web）
1. 安装依赖
```bash
pnpm install
```
2. 配置环境变量
```bash
cp apps/web/.env.example apps/web/.env.local
```
并填写：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3. 启动
```bash
pnpm --filter @xiaozhuoban/web dev
```

## Supabase 初始化
在 Supabase SQL Editor 执行：
- `apps/web/supabase/schema.sql`

## 部署到 Vercel
建议将项目根设置为 `apps/web`，构建参数：
- Build Command: `pnpm --filter @xiaozhuoban/web build`
- Output Directory: `dist`

路由回退已配置：
- `apps/web/vercel.json`
