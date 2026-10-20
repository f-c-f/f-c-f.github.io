# 工作日志

Tools 首页 → 工作日志，路径 `/subsystem/journal/`。沿用 Jekyll subsystem 布局和现有 Tools 密码会话，原 Note 页面及其数据不受影响。

- 页面首先展示当天唯一的 Vditor 编辑框，新的一天默认留白；当天已有内容直接载入，可持续续写与编辑。每日模板为可选操作，标题和项目收在折叠项内。Vditor 3.10.9 加载失败时可使用 Markdown 文本框。
- 自动保存本机草稿；手动保存到 Firebase Realtime Database 的独立节点 `workJournal/YYYY-MM-DD`。
- 日历和历史查询位于编辑框下方。日历周一开始，实心圆为保存记录，空心圆为草稿；支持日期查询、补记、项目筛选和全文搜索，选中记录后回到上方编辑。
- 每周回顾按所选日期所在周展示，含本机草稿；可导出当天、本周 Markdown 及全部 JSON 备份（云端缓存和草稿分别保存）。
- 云端请求有 12 秒超时；首次加载成功后才能云端保存。保存前比较已读版本，并使用 Firebase ETag 条件写入处理多设备冲突。冲突时先导出当天草稿，刷新核对云端内容后合并保存。
- 草稿键 `work-journal-drafts-v1`，云端缓存键 `work-journal-cache-v1`。清理浏览器数据会清理本机草稿，请定期导出。

## 部署与权限

Jekyll 正常构建即可；`scripts/build-tools-ftp.cjs` 和 `scripts/package-tools.mjs` 已纳入新入口。Vditor 的脚本、样式和运行资源使用固定版本 jsDelivr CDN。

当前复用既有 Firebase REST 接口。页面密码只限制前端入口，不构成数据库鉴权；真正私有的数据需要 Firebase Authentication 和相应数据库规则。不要为了让此页可用而放宽数据库全局读写规则。如果 `workJournal` 节点不可读写，页面会提示失败并保留本机草稿。未在开发验证中写入真实云端数据。

记录字段：`date`、`title`、`content`（Markdown）、`projects`（字符串数组）、`updatedAt`（ISO 时间）。Firebase 可能省略空数组，读取时将缺失的 `projects` 视为空数组。
