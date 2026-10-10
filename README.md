# 供应商管理系统

可直接运行、部署至 Vercel 的中文供应商管理前端骨架。使用原生 JavaScript ES modules，无第三方运行依赖。

## 本地运行

需要 Node.js 22 或更高版本（建议 24 LTS）。

```sh
npm ci
npm run dev
```

打开 http://localhost:3000 。生产构建与验证：

```sh
npm run check
npm test
npm run build
npm run preview
```

## 功能

- 供应商列表、搜索、合作状态筛选和统计。
- 新增、编辑，必填字段及邮箱校验。
- 物流分类、联系人、电话、邮箱、服务线路、备注及合作状态。
- 浏览器 localStorage 持久化；保存失败保留表单，损坏数据不会被自动覆盖。
- 响应式布局、语义化表格、原生模态对话框、键盘操作。

首屏为空，不预填真实业务信息。所有用户输入通过 textContent 渲染。

## 数据结构

存储键 `supplier-hub:v1`，结构 `{ version: 1, suppliers: Supplier[] }`。

| 字段 | 类型 / 含义 |
| --- | --- |
| id | UUID 字符串 |
| name, contact | 必填字符串：公司、联系人 |
| category | 铁路运输 / 公路运输 / 仓储服务 / 清关服务 / 综合物流 / 其他 |
| phone, email, routes, notes | 字符串，可为空 |
| status | 待评估 / 合作中 / 暂停合作 |
| createdAt, updatedAt | ISO 8601 时间字符串 |

校验、序列化及查询逻辑位于 `src/suppliers.js`；交互位于 `src/app.js`。后续可将读取与保存替换为后端 API。

## Vercel 部署

导入 GitHub 仓库 `Bion3/supplier-management`，根目录选择仓库根目录，Framework Preset 选择 Other。`vercel.json` 已配置：

- Install Command：`npm ci`
- Build Command：`npm run build`
- Output Directory：`dist`
- 无环境变量要求，无服务器函数。

如已有项目使用旧的 Next.js / Vite 设置，请改为 Other 并清除冲突的 Dashboard 覆盖项；Node.js 选择 24.x。部署后检查首页及 `/src/app.js` 返回 200，新增、编辑并刷新确认数据保存。

## 当前边界

此版本是单浏览器前端骨架，尚无登录、数据库、团队共享、权限控制或备份。清除浏览器数据会丢失记录。公开部署的页面不含业务数据；录入内容保留在录入者的浏览器。投入团队使用前应接入数据库与认证。
