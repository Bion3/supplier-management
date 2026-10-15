# 企业挖掘配置说明
1. 在 Supabase SQL Editor 运行 `database/lead_discovery.sql`，确认 RLS 与 `freight_companies` 权限一致。
2. 在 Vercel 项目环境变量中设置 `GOOGLE_MAPS_API_KEY`（仅 Server 环境），在 Google Cloud 启用 Places API (New)、结算和 API 使用限额，并限制该密钥可访问的 API。
3. 部署包含 `api/discovery-search.js` 的分支，在 `/discovery.html` 登录现有 CRM 后保存任务，点击“实时搜索”。
4. 每次调用至多搜索前两条关键词，各请求至多返回 20 条。费用由 Google Cloud 计费；当前不自动翻页或批量跑 1000 条。
5. Google 返回的公司名称、地址、电话、网站仅短暂展示，不写入 Supabase。Place ID 可以长期保存；独立官网数据的采集与持久化需进一步实现并核对适用条款。
6. 还未实现官网联系页爬取、企业邮箱验证、CRM 自动入库或批量发送。上线前提供 Google 必要的署名、隐私政策和服务条款。
