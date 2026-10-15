# 企业挖掘：免费优先

## 可用功能
- OpenStreetMap：不需要 API Key；从“企业挖掘”创建任务，选择 `OpenStreetMap（免费）`，使用“实时搜索”按钮。服务器使用 Nominatim 将城市转换成区域，再通过公共 Overpass API 查找企业。结果仅即时展示，不自动写入 CRM。
- Google Places：可选付费数据源，需要在 Vercel 设置 `GOOGLE_MAPS_API_KEY`，并在 Google Cloud 启用 Places API (New) 和结算。
- Overture Maps：已在任务选项中预留，**尚未实现直接查询或批量导入**。开放 GeoParquet 数据需要按城市边界下载/处理，可使用 DuckDB 或 overturemaps CLI 在独立批处理程序中运行，而非使用 Vercel 请求直接扫描全球数据。

## 使用限制和合规
- 公共 Nominatim 和 Overpass 不保证可用性；当前每次请求限一个城市中心的小区域以及少量关键词，每次最多 80 条返回。不要将其用于自动、大规模或高频调用。批量拓展请自托管 OSM 数据提取或使用付费服务。
- 使用 OpenStreetMap 数据和衍生数据时保留 © OpenStreetMap contributors / ODbL 署名，并评估 ODbL 对数据集再分发的义务。
- Google Places 数据不自动长期保存；独立官网数据须在允许的条件下取得并标注来源。
- 地图 POI 不是完整工商名录；部分物流企业缺失地址、网站、电话或邮箱，结果与搜索关键词不一定完全对应。
- OSM 搜索结果现在可以手动选择并批量保存为候选企业（每次最多 80 条、同一 OSM ID 自动去重）；每个候选可人工补充公开邮箱/电话及来源 URL，再审核导入 CRM。导入会核对同名公司和已经关联的同官网域名线索，遇到可能重复项会暂停并提示人工处理，不会覆盖原始 CRM 记录。\n- 新导入的邮箱联系人默认 email_allowed=false 且 status=待核实，因此不会被邮件发送模块直接使用。\n- **已新增** “官网提取联系方式”：对具有 HTTPS 网站的候选企业，服务器限定单次最多检查该官网内 3 页（首页、Contact、Impressum 等），提取页面上公开的 mailto/邮箱与 tel 电话并记录来源 URL。发现的信息仍然标注为未核实，需要人工审核。\n- **尚未实现** 跨网站交叉验证、自动合并重复 CRM 企业或批量营销邮件。官网检查不保证可读取所有页面；JavaScript 动态页面、禁止抓取网站、HTTP-only 网站可能失败。

## 数据库与预览
- 已有 Supabase 项目执行了 `database/lead_discovery.sql`、来源扩展，以及 `database/lead_stage_osm.sql` 和 `database/lead_import_reviewed.sql`。新环境需按顺序执行这些 SQL 并确认账户权限。
- 预览地址随 PR 分支最新提交自动更新；合并前不影响生产主分支。

参考：https://docs.overturemaps.org/getting-data/ 和 https://wiki.openstreetmap.org/wiki/Overpass_API

## 后台批量官网补全（V5）

- 已新增 `lead_enrich_jobs` 持久任务表、`lead_enqueue_batch` 授权排队 RPC、`lead_enrich_worker` 后台受限 RPC、Vercel Queue 的 `freight-lead-enrich` 订阅，以及前端跨页多选和任务进度列表。
- Vercel **开发预览分支**的 `LEAD_WORKER_SECRET` 已安全设置，Supabase 仅保存 SHA-256 摘要，未写入 GitHub。生产环境目前不自动启用本新队列。
- 点击“批量官网补全”最多选择 500 家，其中有 HTTPS 官网且未导入 CRM 的 OSM / 独立来源候选可以入队；后台每次最多处理 3 家，再投递下一段队列，浏览器关闭也不会取消已经排队的任务。
- 任务状态：`queued` / `running` / `completed` / `failed`。失败项可以重新选择并提交；已完成项不会重复处理。进度列表读取 Supabase 而不是浏览器缓存。
- 每家公司最多抓取同域名 3 个公开 HTTPS HTML 页面，不跟随外部跳转；邮箱仍属于**待核实**，导入 CRM 后 `email_allowed=false`。系统不会自动发送邮件。
- 测试范围：代码已通过 Vercel 预览构建；由于测试库未有专用受控企业样本，本轮没有触发对真实网站的批量抓取或完整队列吞吐测试。需要先用少量明确获准核实的官网做端到端验证，再增加处理规模。队列处理仍受 Vercel 平台配额、网站 robots 约束及目标网站访问政策影响。
