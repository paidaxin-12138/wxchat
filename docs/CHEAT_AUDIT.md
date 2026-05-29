# 摸鱼时间审核机制

## users.cheatMarker 字段

```javascript
{
  cheatMarker: {
    suspiciousCount: 0,
    lastViolationTime: null,
    freezeEndTime: null,
    recentRecords: []   // 最近20条 timestamp（毫秒），最新在数组头部
  }
}
```

## 审核规则

| 规则 | 条件 | 处罚 |
|------|------|------|
| 相邻间隔 | 与上一条间隔 < 30 秒 | 可疑 +1 |
| 1小时频率 | 最近1小时 ≥ 12 次 | 可疑 +1 |
| 单次时长 | durationMin > 180 | 可疑 +1 |

一次记录触发多条规则，可疑次数只 +1。

- `suspiciousCount >= 3` → 冻结 24 小时（`freezeEndTime`）
- 冻结期摸鱼币奖励减半（`floor(moneyEarned × 10 × 0.5)`）
- 冻结期满自动解除，`suspiciousCount` 归零

## 云函数

重新部署 `validateAndAddRecord`：

```bash
# 微信开发者工具 → 云开发 → 云函数 → validateAndAddRecord → 上传并部署
```

## 前端调用

```javascript
cloud.submitMoyuRecord({
  type: 'toilet',
  durationMin: 8,
  timestamp: Date.now()
});
```

喝水需传 `waterMl`，充电需传 `chargePowerW`。

## 摸鱼清单

若后续增加 `fishlist` 页面，同样调用 `cloud.submitMoyuRecord(payload)` 即可。
