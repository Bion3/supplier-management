# 行业名录与资源

入口 `/industry-resources.html`，复用现有 CRM 登录、团队权限和 Vercel 项目，无新增后端函数。

- `freight_industry_directories`：资源配置、启停、优先级、采集方式、访问状态、断点。
- `freight_directory_entries`：来源 URL + 企业名称唯一，直接关联 `freight_companies`。同一列表页可包含多家企业。
- `freight_directory_runs`：逐来源记录真实新增、联系方式、跳过和失败数。
- `freight_directory_ingest(p_code,p_entries)`：每批最多100家，invoker权限；按来源档案或唯一同名同地区客户关联，保留阶段、备注、停发。新增联系方式携带实际证据页；同公司相同联系方式不重复创建，不恢复无效/停发地址。

`database/industry_directory_seed.json` 是初始18个来源，不应在后续发布覆盖人工启停和断点。`database/industry_directories.sql` 为已应用的初始结构。

每日采集由 ChatGPT 自动任务“每日采集行业名录企业”执行，北京时间9点前后；逐次读取数据库的当前配置。ENF现有任务单独运行，资源参考不自动采集。公开目录受限则记日志换源，不绕过登录、验证码或付费墙。采集限制下保存断点，目标数量不是保证。

EUROPUR可复用 `python scripts/resources/collect-europur.py 25 25`（数量、起始偏移），输出含企业条目、失败URL和总profile数的JSON。它只读取公开页面，不直接写数据库。对无联系方式的企业仍应检查官网；不能将协会页脚作为企业联系方式。

`contact_checked=true` 仅用于确认已检查可用线索，出现新官网或来源后可重新检查。重复处理时先读entries的evidence与checked_at，避免占用实际采集名额。

运行 `node --test tests/industry-resources.test.js tests/crm-directories.test.js`。已在事务回滚测试中验证幂等与停发/阶段保留，并验证非团队登录用户不可读新表。首批EUROPUR24条，新增23份CRM档案、46条邮箱/电话；未做邮箱投递性认证。
