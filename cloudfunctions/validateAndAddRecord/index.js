const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const AUDIT = {
  minIntervalMs: 30 * 1000,
  maxPerHour: 12,
  maxDurationMin: 180,
  freezeThreshold: 3,
  freezeDurationMs: 24 * 3600 * 1000,
  recentLimit: 20,
  coinRate: 100
};

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function normalizeType(type) {
  return type === 'gossip' ? 'chat' : type;
}

function defaultCheatMarker() {
  return {
    suspiciousCount: 0,
    lastViolationTime: null,
    freezeEndTime: null,
    recentRecords: []
  };
}

function normalizeMarker(marker) {
  const m = Object.assign(defaultCheatMarker(), marker || {});
  if (!Array.isArray(m.recentRecords)) m.recentRecords = [];
  return m;
}

function resolveFreezeState(marker, now) {
  const m = normalizeMarker(marker);
  if (m.freezeEndTime && m.freezeEndTime <= now) {
    return {
      marker: {
        suspiciousCount: 0,
        lastViolationTime: m.lastViolationTime,
        freezeEndTime: null,
        recentRecords: m.recentRecords
      },
      isFrozen: false,
      rewardPenalty: 1,
      freezeRemainHours: 0
    };
  }
  if (m.freezeEndTime && m.freezeEndTime > now) {
    return {
      marker: m,
      isFrozen: true,
      rewardPenalty: 0.5,
      freezeRemainHours: Math.ceil((m.freezeEndTime - now) / 3600000)
    };
  }
  return { marker: m, isFrozen: false, rewardPenalty: 1, freezeRemainHours: 0 };
}

function typeUsesDuration(type) {
  return normalizeType(type) !== 'water';
}

function getMaxDurationMin(type) {
  const t = normalizeType(type);
  const map = { toilet: 180, chat: 480, charge: 720, water: 0 };
  return map[t] != null ? map[t] : AUDIT.maxDurationMin;
}

function checkSuspicious(marker, timestamp, durationMin, type) {
  const ts = timestamp || Date.now();
  const recent = marker.recentRecords || [];
  let suspicious = false;
  if (recent.length > 0 && ts - recent[0] < AUDIT.minIntervalMs) suspicious = true;
  const hourAgo = ts - 3600000;
  if (recent.filter(function (t) { return t > hourAgo; }).length >= AUDIT.maxPerHour) suspicious = true;
  if (typeUsesDuration(type)) {
    const maxDur = getMaxDurationMin(type);
    if ((parseFloat(durationMin) || 0) > maxDur) suspicious = true;
  }
  return suspicious;
}

function applySuspicious(marker, now) {
  const m = normalizeMarker(marker);
  let justFrozen = false;
  m.suspiciousCount = (m.suspiciousCount || 0) + 1;
  m.lastViolationTime = now;
  if (m.suspiciousCount >= AUDIT.freezeThreshold) {
    m.freezeEndTime = now + AUDIT.freezeDurationMs;
    m.suspiciousCount = 0;
    justFrozen = true;
  }
  return { marker: m, justFrozen: justFrozen };
}

function pushRecentRecord(marker, timestamp) {
  const m = normalizeMarker(marker);
  m.recentRecords = [timestamp].concat(m.recentRecords || []).slice(0, AUDIT.recentLimit);
  return m;
}

function getPerMinuteSalary(user) {
  const days = user.workDaysPerMonth || 22;
  const hours = user.workHoursPerDay || 8;
  const salary = user.monthlySalary || 8000;
  const totalHours = days * hours;
  if (totalHours <= 0) return 0;
  return salary / totalHours / 60;
}

function calculateMoneyEarned(type, user, event) {
  const t = normalizeType(type);
  if (t === 'water') {
    const ml = parseFloat(event.waterMl) || 0;
    return roundMoney((ml / 1000) * (user.waterPricePerLiter || 0.5));
  }
  if (t === 'charge') {
    const min = parseFloat(event.durationMin) || 0;
    const power = parseFloat(event.chargePowerW) || user.chargerPower || 20;
    const kwh = (power / 1000) * (min / 60);
    return roundMoney(kwh * (user.electricityPricePerKwh || 0.6));
  }
  const min = parseFloat(event.durationMin) || 0;
  return roundMoney(min * getPerMinuteSalary(user));
}

function buildDetailDesc(type, event) {
  const t = normalizeType(type);
  if (t === 'water') return '喝水 ' + (event.waterMl || 0) + 'ml';
  if (t === 'charge') {
    const min = event.durationMin || 0;
    const hours = min >= 60 ? (min / 60).toFixed(1) + '小时' : min + '分钟';
    return '充电 ' + hours + ' ' + (event.chargePowerW || '') + 'W';
  }
  if (t === 'toilet') return '上厕所 ' + (event.durationMin || 0) + '分钟';
  if (t === 'chat') return '聊天八卦 ' + (event.durationMin || 0) + '分钟';
  return '摸鱼 ' + (event.durationMin || 0) + '分钟';
}

function buildRecord(type, event, moneyEarned) {
  const ts = event.timestamp || Date.now();
  const d = new Date(ts);
  const record = {
    id: Date.now() + '_' + Math.floor(Math.random() * 10000),
    type: normalizeType(type),
    timestamp: ts,
    dateStr: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    timeStr: pad(d.getHours()) + ':' + pad(d.getMinutes()),
    moneyEarned: moneyEarned,
    detailDesc: buildDetailDesc(type, event)
  };
  if (normalizeType(type) === 'water') record.waterMl = parseFloat(event.waterMl) || 0;
  else record.durationMin = parseFloat(event.durationMin) || 0;
  if (normalizeType(type) === 'charge') record.chargePowerW = parseFloat(event.chargePowerW) || 0;
  return record;
}

function getRankByMoney(money) {
  const ranks = [
    { id: 1, threshold: 0 }, { id: 2, threshold: 50 }, { id: 3, threshold: 200 },
    { id: 4, threshold: 500 }, { id: 5, threshold: 1000 }, { id: 6, threshold: 2000 },
    { id: 7, threshold: 5000 }, { id: 8, threshold: 10000 }
  ];
  let rank = ranks[0];
  ranks.forEach(function (r) { if (money >= r.threshold) rank = r; });
  return rank;
}

function getDefaultUser() {
  return {
    fishCoins: 0,
    totalMoneyAllTime: 0,
    totalExchangedRMB: 0,
    monthlySalary: 8000,
    workDaysPerMonth: 22,
    workHoursPerDay: 8,
    waterPricePerLiter: 0.5,
    electricityPricePerKwh: 0.6,
    chargerPower: 20,
    rankId: 1,
    badges: [],
    cheatMarker: defaultCheatMarker()
  };
}

exports.main = async function (event) {
  const now = Date.now();
  const type = event.type || (event.record && event.record.type);
  if (!type) {
    return { success: false, ok: false, message: '无效摸鱼类型' };
  }

  const payload = event.record
    ? {
        type: event.record.type,
        durationMin: event.record.durationMin,
        waterMl: event.record.waterMl,
        chargePowerW: event.record.chargePowerW,
        timestamp: event.record.timestamp
      }
    : event;

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  let usersRes = await db.collection('users').where({ _openid: openid }).get();
  let user = usersRes.data && usersRes.data[0];
  if (!user) {
    const addRes = await db.collection('users').add({
      data: Object.assign(getDefaultUser(), { nickName: '摸鱼达人', avatarUrl: '' })
    });
    const doc = await db.collection('users').doc(addRes._id).get();
    user = doc.data;
  }

  const timestamp = payload.timestamp || now;
  const durationMin = parseFloat(payload.durationMin) || 0;

  const freezeState = resolveFreezeState(user.cheatMarker, now);
  let marker = freezeState.marker;
  let rewardPenalty = freezeState.rewardPenalty;
  let isSuspicious = false;
  let justFrozen = false;

  if (!freezeState.isFrozen) {
    isSuspicious = checkSuspicious(marker, timestamp, durationMin, type);
    if (isSuspicious) {
      const applied = applySuspicious(marker, now);
      marker = applied.marker;
      justFrozen = applied.justFrozen;
      if (justFrozen) rewardPenalty = 0.5;
    }
  }

  const moneyEarned = calculateMoneyEarned(type, user, payload);
  if (moneyEarned <= 0) {
    return { success: false, ok: false, message: '收益计算异常，请检查输入' };
  }

  let fishCoinsGained = Math.floor(moneyEarned * AUDIT.coinRate * rewardPenalty);
  if (isSuspicious || justFrozen) {
    fishCoinsGained = 0;
  }
  const record = buildRecord(type, payload, moneyEarned);
  const addRes = await db.collection('records').add({
    data: Object.assign({}, record, { _openid: openid })
  });
  record._id = addRes._id;

  marker = pushRecentRecord(marker, timestamp);
  const newTotalMoney = roundMoney((user.totalMoneyAllTime || 0) + moneyEarned);
  const newFishCoins = (user.fishCoins || 0) + fishCoinsGained;
  const rank = getRankByMoney(newTotalMoney);

  const finalFreeze = resolveFreezeState(marker, now);

  await db.collection('users').doc(user._id).update({
    data: {
      totalMoneyAllTime: newTotalMoney,
      fishCoins: newFishCoins,
      rankId: rank.id,
      cheatMarker: finalFreeze.marker
    }
  });

  const isFrozen = finalFreeze.isFrozen || justFrozen;
  const freezeRemainHours = justFrozen ? 24 : finalFreeze.freezeRemainHours;

  let message = '摸鱼成功！伟大的摸鱼之神奖励你+' + fishCoinsGained + '摸鱼币';
  if (justFrozen) message = '伟大的摸鱼之神察觉到你多次违规，本次摸鱼币已清空，后续24小时奖励减半';
  else if (isFrozen && !justFrozen) message = '伟大的摸鱼之神正在注视你（剩余 ' + freezeRemainHours + ' 小时），摸鱼币奖励减半';
  else if (isSuspicious) message = '可疑：操作过快或频率异常，本次摸鱼币已清空（记录已保存）';

  return {
    success: true,
    ok: true,
    moneyEarned: moneyEarned,
    fishCoinsGained: fishCoinsGained,
    isFrozen: isFrozen,
    isSuspicious: isSuspicious,
    justFrozen: justFrozen,
    freezeRemainHours: freezeRemainHours,
    message: message,
    record: record,
    user: {
      totalMoneyAllTime: newTotalMoney,
      fishCoins: newFishCoins,
      rankId: rank.id,
      cheatMarker: finalFreeze.marker
    },
    changes: []
  };
};
