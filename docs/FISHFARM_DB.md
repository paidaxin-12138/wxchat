# 摸鱼养鱼场 · 数据库索引

在云开发控制台为以下集合创建索引：

## records

| 索引字段 | 排序 | 说明 |
|---------|------|------|
| `_openid` + `timestamp` | 升序 + **降序** | 用户记录按时间倒序（**推荐，控制台可一键创建**） |
| `timestamp` | 降序 | 时间范围审核 |

控制台若提示缺少索引，点击链接或手动创建组合索引：

- 字段 1：`_openid` 升序
- 字段 2：`timestamp` **降序**

创建后可删除仅含 `_openid` 的旧索引（`_openid_1`）。

## users

| 索引字段 | 排序 | 说明 |
|---------|------|------|
| `totalMoneyAllTime` | 降序 | 历史总榜排行 |
| `_openid` | 升序 | 按 openid 查询用户 |

`doc(_id).update()` 的 `_id + _openid` 索引提示可忽略，按文档 ID 更新无需额外索引。

## fish_species（可选）

若将鱼种配置存入云端，可创建集合 `fish_species`，字段 `id` 唯一索引。当前版本鱼种配置在 `utils/fishData.js` 与云函数内硬编码。

## 云函数部署清单

```bash
# 在 cloudfunctions 目录分别上传并部署：
# - validateAndAddRecord  摸鱼记录审核保存
# - exchangeCurrency      人民币兑换摸鱼币
# - calcOfflineProgress   离线养鱼进度
# - fishFarm              商店/喂食/孵化/卖出/升级
```

## 初始化字段

用户首次进入养鱼场或注册时自动写入：

- `fishCoins: 0`
- `fishTank`: 鱼缸 Lv.1，容量 3
- `fishes: []`
- `inventory: { fishEggs: [], feed: 10 }`
- `cheatMarker`: `{ suspiciousCount, lastViolationTime, freezeEndTime, recentRecords }`
- `lastFishFarmVisit`: 当前时间戳

## 兑换汇率

`1 元人民币 = 100 摸鱼币`，在 `utils/fishData.js` 与 `cloudfunctions/fishFarm/index.js` 中配置。
