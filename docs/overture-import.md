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

数据库迁移：`database/lead_stage_overture.sql`。**2026-10-16 已在现有 Supabase 项目应用成功并验证 RPC 存在**。已使用已授权 CRM 角色在可回滚事务中验证：首次导入新增 1 条；重复同 ID 再导入新增 0、跳过 1；测试回滚后候选库保持 0 条。前端仍需通过真实 Overture 地区文件及登录账号完成完整端到端测试。

## GitHub Actions 自动准备地区文件（开发版）

仓库新增 `.github/workflows/overture-city-export.yml` 和 `scripts/download_overture_candidates.py`：在 GitHub 后台运行官方 `overturemaps` CLI，按限定 bbox 自动下载 Overture Places，筛选物流、货代、运输、仓储、进出口和批发相关企业，输出 `hamburg-freight-candidates.ndjson` 与 `hamburg-manifest.json`，最多 500 家（可配置）。结果作为 GitHub Actions artifact 保存 7 天，默认不直接写入 Supabase。

运行方法：打开仓库的 Actions → `Build Overture freight leads sample` → `Run workflow`，选择具有工作流文件的分支，设置 `city=hamburg` 和 bbox `9.75,53.40,10.33,53.72`，完成后下载 artifact、解压 NDJSON。然后到 CRM 页面关联 Hamburg 的 Overture 任务、填写实际版本（STAC 最新 release，需人工核实）并导入。若工作流尚未出现在默认分支 Actions 列表，先通过 PR 审核合并；GitHub 不保证 workflow_dispatch 能在非默认分支上的新 workflow 生效。

**真实进度限制：** 这一阶段已提交自动下载/筛选程序，但未确认 GitHub Actions 的真实数据下载任务成功，也没有把批量文件自动转存到 CRM。Vercel 运行时仍不直接查询 Overture S3 数据。建议先检查 Actions 日志及样本质量，避免引入错误企业数据。

为了降低隐私和再发布风险，自动导出的文件不含 email/phone；来源由独立官网补全模块进行核实。自动生成数据仍需遵守 Overture 和其上游来源的许可义务。

## 自动写入 Supabase 候选池（新）

数据库迁移已经应用：
- `database/lead_overture_auto_ingest.sql`：独立后台批次与分片记录、重复提交保护、每片最多 50 条、每批最多 5,000 条；仅接受专用密钥哈希校验成功的请求。
- `database/lead_overture_token_setup.sql`：只允许现有授权 CRM 用户通过页面生成一次性专用令牌，数据库仅保存 SHA-256 哈希。重新生成令牌会立即使旧 GitHub 密钥失效。

首次启用步骤：
1. CRM 中创建来源为 `Overture Maps（文件导入）` 的 Hamburg 任务（使用其任务 UUID）。
2. 在“Overture 后台导入批次”展开“首次启用自动入库”，点击“生成 / 轮换专用密钥”，仅复制一次并保管。
3. GitHub 仓库 Settings → Secrets and variables → Actions → New repository secret：名称 `OVERTURE_INGEST_SECRET`，值为刚生成的令牌。**不要放入代码、Issue、PR、聊天或公开的构建日志。**
4. GitHub Actions 的 `Prepare and import Overture city leads` 手动触发，输入 `city=hamburg`、正确的 bbox、该城市 Overture 任务 UUID、从官方发行记录核实的发布版本，并开启 `auto_import`。
5. 后台先生成仅含企业公开业务信息的 NDJSON（仍提供可下载 artifact），后经 Supabase REST 的受限 RPC 每 50 条写入候选池；任务结束后可在 CRM 的“Overture 后台导入批次”查看新增/跳过/进度。最后一片成功时标记完成。
6. 数据**只进入待审核候选池**，不进入发信队列，也不赋予邮件发送许可。

GitHub Actions 的新 workflow 如果尚未存在于默认分支的 Actions 列表，需要通过 PR 合并才能从界面直接触发。密钥由使用者亲自保存到 GitHub Actions Secrets；本次开发没有办法直接设置 GitHub Secrets，因此自动执行暂不视为已启用。

重试说明：如果同一 GitHub 运行的相同 batch key、chunk number 被再次提交，Supabase 返回已处理结果而不重复计数；新运行会获得新的 batch key，企业 ID 仍会按 Overture provider + ID 去重。若遭遇网络或运行中断，可先检查对应 GitHub run 的 chunk 记录，然后重试。已经完成的批次不接受新片。

安全限制：后台令牌不等于 Supabase 管理员密钥，仅能调用该单一导入 RPC；预览/生产使用的是同一 Supabase 数据库，请确认目标任务及官方发布版本。自动筛选仅按 Overture 的名称/行业文本初筛，不能保证都是有效货代客户；仍需人工二次审核。
