# 摸鱼经济学

微信小程序：记录上班摸鱼（上厕所、喝水、充电、聊天八卦），换算成「摸鱼收入」，并可在养鱼场用摸鱼币养鱼、孵化、排行竞技。

## 功能概览

| 模块 | 说明 |
|------|------|
| 主页 | 记录摸鱼行为，实时计算本月收入 |
| 明细 | 按月查看摸鱼记录 |
| 养鱼场 | 摸鱼币兑换、神秘鱼卵商店、喂食孵化、设备升级 |
| 排行 | 历史总榜 / 周榜 |
| 统计 | 摸鱼数据图表与周报 |
| 我的 | 登录、薪资配置、清空数据 |

## 技术栈

- 微信小程序原生开发
- 微信云开发（云函数 + 云数据库 + 云存储）
- ECharts（`components/ec-canvas`）

## 本地运行

1. 用 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 打开本项目目录
2. 开通云开发，在 `config.js` 中填写 `cloudEnvId`（或使用工具绑定的默认环境）
3. 右键 `cloudfunctions` 文件夹 → 选择当前云环境
4. 分别上传并部署以下云函数：
   - `validateAndAddRecord` — 摸鱼记录审核与保存
   - `exchangeCurrency` — 人民币兑换摸鱼币
   - `calcOfflineProgress` — 离线养鱼进度
   - `fishFarm` — 商店 / 喂食 / 孵化 / 卖出 / 升级
   - `getLeaderboard` — 排行榜
   - `weeklyReport` / `weeklySettlement` — 周报相关（可选）

## 配置

编辑 `config.js`：

```js
cloudEnvId: '你的云环境ID',
weeklyReportTemplateId: '', // 订阅消息模板 ID（可选）
appVersion: '2.0.0'
```

## 数据库

云数据库主要集合：`users`、`records`。

索引与字段说明见：

- [docs/FISHFARM_DB.md](docs/FISHFARM_DB.md)
- [docs/CHEAT_AUDIT.md](docs/CHEAT_AUDIT.md)

## 项目结构

```
wxchat/
├── pages/           # 页面（home、details、fishfarm、stats、leaderboard、profile）
├── cloudfunctions/  # 云函数
├── utils/           # 业务逻辑（cloud、fishFarm、auth 等）
├── components/      # 公共组件
├── images/          # 图片与 Tab 图标
└── config.js        # 全局配置
```

## 许可证

个人学习 / 非商业用途。如需开源协议可自行补充。
