# 部署状态与配置边界

2026-10-15 已将日期倒数邮件程序升级到原 VPS。远端 10 项模拟邮件测试通过，dry-run 成功，随后原 systemd 服务以正式 send 模式执行成功（Result=success，ExecMainStatus=0）。本地与已部署程序 SHA-256 一致。

生日与倒数统一读取，已过期的倒数不会按年重复。原定时器保持启用，每天北京时间 09:00 检查；本次检查识别出当天已发送的提醒，未重复发信。未额外发送真实倒数测试邮件，后续收件箱送达仍以实际到期提醒为准。升级步骤见 UPDATE.md。

生日后台已启用正式发送模式，每天北京时间 09:00 检查生日。新记录默认开启邮件提醒，旧记录通过条件写入补齐缺失邮件选项，明确关闭的记录会保留关闭状态。

仓库只保存后台源代码、测试及部署模板。实际服务器地址、SSH 主机指纹、收件邮箱、邮件回执和发信密钥由部署环境维护，不随网站源代码发布。

运行环境中的配置与状态：

- /etc/birthday-reminder/config.json：数据库地址、接收邮箱、发信地址及模式。
- /etc/birthday-reminder/secrets.env：邮件及数据库凭据，root 私密权限。
- /var/lib/birthday-reminder/sent.json：已发送提醒的去重记录。
- /var/lib/birthday-reminder/last-run.json：最近一次运行摘要。
- journalctl -u birthday-reminder.service：执行日志。

具体安装、测试和停用步骤见 README.md。
