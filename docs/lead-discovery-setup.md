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
- 当前不会自动挖掘官网联系方式、交叉验证、批量入库或发送营销邮件。

## 数据库与预览
- 已有 Supabase 项目执行了 `database/lead_discovery.sql` 及后续来源扩展 SQL。新的环境仍需先执行建表迁移。登录需要现有 CRM 授权账号。
- 预览地址随 PR 分支最新提交自动更新；合并前不影响生产主分支。

参考：https://docs.overturemaps.org/getting-data/ 和 https://wiki.openstreetmap.org/wiki/Overpass_API
