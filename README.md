# 供应商管理系统（Supabase 云端版）

原生 JavaScript 前端，连接现有 Eurasia 项目的 public.suppliers 表。

## 运行
Node.js 22+，执行 npm ci、npm run dev。验证：npm run check、npm test、npm run build。
Vercel 使用 Other、npm run build、输出 dist。

## 登录与数据
使用已有 Supabase 邮箱密码账号登录，无公开注册入口。数据库 RLS 限定授权账号，匿名请求无法读取供应商。新增和编辑直接保存云端，刷新按钮读取最新数据。同一账号在不同设备共享记录。会话保存在 sessionStorage，关闭标签页后需要重新登录。前端只使用 publishable key，无 service role key。

既有浏览器本地数据不会自动导入或删除。名片记录已通过受授权的数据库插件迁入。地址、英文公司名等现有数据库字段保持原样；前端编辑仅修改列表表单字段。

## 账号授权
当前允许已有管理员账号访问；新增团队成员前需明确授权并调整 RLS 策略。使用 Supabase 控制台管理账号及密码。静态旧部署不会自动更新，请使用新的生产域名。
