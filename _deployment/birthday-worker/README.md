# 生日与日期倒数邮件后台

已有服务器更新日期倒数邮件功能，请按 [UPDATE.md](UPDATE.md) 执行一次后台升级。网页已经支持统一列表和共用数据库，邮件程序需要识别 `kind: "countdown"` 才能按指定日期发信。

独立的 Node.js 程序，复用网页的农历库与日期规则。不会修改 Caddy、代理配置或现有网站。`emailReminder === true` 的记录才会产生邮件提醒，原有日历提醒选项不会自动变成邮件授权。

## 上传及安装

将本目录上传到 VPS 的临时目录，例如 `/root/birthday-reminder-upload/`。使用 root 执行：

```bash
BIRTHDAY_RECIPIENT='你的接收邮箱' bash /root/birthday-reminder-upload/install.sh
```

安装会检查 Node.js；不足 v22 时从 Node 官方站下载 v24 LTS，并校验官方 SHA-256。独立运行时存放在本程序目录，不替换系统 Node。

目录：

- `/opt/birthday-reminder/`：程序、农历库及独立运行时（如需要）。
- `/etc/birthday-reminder/config.json`：数据库地址、接收邮箱、发送模式、发信地址。
- `/etc/birthday-reminder/secrets.env`：`RESEND_API_KEY`，以及需要时的 `FIREBASE_ACCESS_TOKEN`。不提交到 Git。
- `/var/lib/birthday-reminder/`：发送去重状态和上次执行摘要。

首次安装为 `dry-run`，不发送邮件。每天北京时间 09:00 运行；重启后会补跑一次，但只检查执行时当天，不补发前几天遗漏的提醒。

## 验证定时执行

```bash
systemctl start birthday-reminder.service
systemctl status birthday-reminder.timer --no-pager
journalctl -u birthday-reminder.service -n 10 --no-pager
systemctl list-timers birthday-reminder.timer --no-pager
```

如需验证自动触发，可以临时使用 `systemd-run --on-active=15s --unit=birthday-reminder-probe /usr/bin/systemctl start birthday-reminder.service`，随后查看本服务是否新增成功日志。不要在没有收件邮箱和发信配置时切换为 send。

## 配置真实发送

1. 使用服务商提供的私密方式将 `RESEND_API_KEY=...` 写入 `/etc/birthday-reminder/secrets.env`，保持 root 权限 0600。
2. 在 `config.json` 设置 `from` 为服务商验证过的发信地址，并将 `mode` 改为 `send`。
3. 使用 systemd 临时测试服务，以相同运行用户、配置及密钥环境执行 `worker.cjs --test-email`。此操作会向配置的接收邮箱发送一封测试邮件；可保持 config.mode 为 dry-run，独立验证发信，不影响每日任务的预览模式。
4. 网页已提供独立邮件提醒选项，新建记录默认勾选。旧记录缺失选项时，可以先以相同运行用户和环境执行 `migrate-email-defaults.cjs` 补齐 true；迁移不会覆盖明确关闭或并发修改。正式启用后，取消网页中的邮件勾选并保存即可停止该亲友后续邮件。

API 成功响应只代表邮件服务接受请求，是否到达收件箱需用户确认。程序使用本地发送记录与 Resend 幂等键避免重复发送；运行命令必须使用服务自带 flock 锁，避免并发修改状态。

## 停用

```bash
systemctl disable --now birthday-reminder.timer
```

## 本地验证

```bash
node --test _deployment/birthday-worker/worker.test.cjs _deployment/birthday-worker/migrate-email-defaults.test.cjs subsystem/birthday/dates.test.js
```

本包尚不包含发信密钥。部署是否成功以 VPS 实际执行结果为准。
