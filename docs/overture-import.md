# Overture Maps 欧洲企业批量导入

这是一条**文件导入链路**，不是 Vercel 直接扫描全球 Overture 数据。首先从官方数据库按城市或 bounding box 提取企业地点，再上传到系统的候选企业库。

## 获取数据

官方来源：https://docs.overturemaps.org/getting-data/ 和 https://docs.overturemaps.org/getting-data/duckdb/

建议在电脑或专门的数据处理环境安装官方 Python 客户端：

```bash
python -m pip install overturemaps
overturemaps download --help
```

根据 `--help` 确认 `--type=place` 与 `-f geojson` 参数，再针对实际范围（经度最小值、纬度最小值、经度最大值、纬度最大值）执行：

```bash
overturemaps download --bbox=<west>,<south>,<east>,<north> -f geojson --type=place -o places.geojson
```

上面的 `<...>` 是占位符，不可直接复制执行。官方客户端使用 STAC 自动发现最新发布版本，**请把实际发布版本记在系统导入表单里**。导入前请在文件中筛选所需企业行业类别、城市边界，确保企业确实属于所选国家和地区。新版（2026-09-23）使用 `taxonomy.primary` / `basic_category`，不是旧版的 `categories.primary`。

## 在现有 CRM 中使用

1. 进入企业挖掘页面，创建 `Overture Maps（文件导入）` 类型任务，填写国家、城市、关键词。
2. 在 Overture 导入区选择该任务、数据发布版本和文件（GeoJSON / JSON 数组 / NDJSON）。
3. 核实文件确实为所选区域且使用许可允许，勾选确认框，点击“预览并校验”。
4. 页面显示有效、无效、文件内重复条数后，点击导入。
5. 每批提交至多 50 条，单文件至多 5000 条、12MB；重复的 Overture ID 会被跳过。失败中断后可重试，成功条目不会重新插入。
6. 新增企业仅进入待审核候选库，必须核对来源及联系方式后才能进入 CRM；邮件权限继续默认禁止。

数据字段：Overture ID、名称、`taxonomy.primary`、官网、地址、邮箱、电话及 `sources` 的有限上游来源元数据。此处不会强制跨网站验证，也不会自动判定邮箱可投递。

## 安全与许可

Overture 地点数据每条来源可能含不同上游许可，应用端保存发布版本和源属性，使用者仍应核查允许的持久化用途、署名及可能的开放数据义务。官方许可说明：https://docs.overturemaps.org/attribution/

目前只根据用户选定的国家/城市归档，**不对上传文件的空间范围做自动地理围栏验证**；必须在导入前按行政区域或 bbox 提取。对于来自多源的数据，企业名称、联系人和地址也可能不完整或者过时。

数据库迁移：`database/lead_stage_overture.sql`。需要此 RPC 先部署到 Supabase 后，页面导入才能实际完成。
