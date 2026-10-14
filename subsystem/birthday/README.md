# 生日记录

页面路径：`/subsystem/birthday/`，在 Tools 密码登录后的卡片列表进入。

- Firebase Realtime Database 的 `birthdays/{id}` 存储记录，沿用现有项目和访问规则。每条记录单独写入，避免覆盖其他亲友。
- 公历使用原生 `input[type=date]`；农历使用原生年月日下拉框，只提供所选年份实际存在的月份、闰月及日期。保存农历原始日期以及对应公历出生日期，每年的生日另行换算。
- 闰月生日：当年有同名闰月则使用闰月，否则使用普通月。农历三十遇小月按廿九。公历 2 月 29 日遇非闰年按 2 月 28 日。
- 可选提醒导出为 `.ics`，包含未来十次生日，各含提前七天、提前一天和当天的 DISPLAY 提醒，时间为北京时间 09:00。农历事件逐年计算，不使用公历年度重复规则。
- 用户需要导入日历并允许通知；部分客户端不保留导入的 VALARM，需要手动检查。建议使用单独日历，更新时删除旧事件再导入。网页不直接发邮件。

## 依赖及验证

`lunar.js` 为本地保存的 [6tail/lunar-javascript](https://github.com/6tail/lunar-javascript) 库，下载于 2026-10-14，MIT 许可证见 `LUNAR-LICENSE.txt`。它不会发送数据或依赖外部 CDN。未使用浏览器内置 Chinese Calendar 换算，因为不同 ICU 版本的天文计算可能产生一天偏差。

保存版本的 SHA-256：`9750324bfe1aa63c146f8c72b1143df924466c11c8a5277d7d9225c541a18aaa`。

运行 `node --test subsystem/birthday/dates.test.js`。测试包含跨年、北京时间、闰月、大小月、公历闰日、农历往返及 iCalendar 三次提醒。2027 年春节日期按 [香港天文台对照表](https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/2027e.pdf) 核对。
