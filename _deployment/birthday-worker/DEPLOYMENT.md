# 部署状态与配置边界

生日后台已启用正式发送模式，每天北京时间 09:00 检查生日。新记录默认开启邮件提醒，旧记录通过条件写入补齐缺失邮件选项，明确关闭的记录会保留关闭状态。

仓库只保存后台源代码、测试及部署模板。实际服务器地址、SSH 主机指纹、收件邮箱、邮件回执和发信密钥由部署环境维护，不随网站源代码发布。

运行环境中的配置与状态：

- /etc/birthday-reminder/config.json：数据库地址、接收邮箱、发信地址及模式。
- /etc/birthday-reminder/secrets.env：邮件及数据库凭据，root 私密权限。
- /var/lib/birthday-reminder/sent.json：已发送提醒的去重记录。
- /var/lib/birthday-reminder/last-run.json：最近一次运行摘要。
- journalctl -u birthday-reminder.service：执行日志。

具体安装、测试和停用步骤见 README.md。
