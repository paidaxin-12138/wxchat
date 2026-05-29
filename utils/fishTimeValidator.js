/**
 * 摸鱼时间审核（防刷）
 * 规则与 cloudfunctions/validateAndAddRecord 保持同步
 */

const AUDIT = {
  minIntervalMs: 30 * 1000,
  maxPerHour: 12,
  maxDurationMin: 180,
  freezeThreshold: 3,
  freezeDurationMs: 24 * 3600 * 1000,
  recentLimit: 20,
  coinRate: 100
};

/** 各类型单次时长上限（分钟），上厕所 30 分钟属正常范围 */
const MAX_DURATION_BY_TYPE = {
  toilet: 180,
  chat: 480,
  charge: 720,
  water: 0
};

function normalizeType(type) {
  return type === 'gossip' ? 'chat' : type;
}

function typeUsesDuration(type) {
  return normalizeType(type) !== 'water';
}

function getMaxDurationMin(type) {
  const t = normalizeType(type);
  return MAX_DURATION_BY_TYPE[t] != null ? MAX_DURATION_BY_TYPE[t] : AUDIT.maxDurationMin;
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

/** 检查冻结状态，过期则自动解除 */
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
    const remainMs = m.freezeEndTime - now;
    return {
      marker: m,
      isFrozen: true,
      rewardPenalty: 0.5,
      freezeRemainHours: Math.ceil(remainMs / 3600000)
    };
  }
  return {
    marker: m,
    isFrozen: false,
    rewardPenalty: 1,
    freezeRemainHours: 0
  };
}

/**
 * 未冻结时检测可疑行为（多条规则只 +1）
 * @param {string} [type] 摸鱼类型，用于按类型判断时长上限
 */
function checkSuspicious(marker, timestamp, durationMin, type) {
  const ts = timestamp || Date.now();
  const recent = (marker.recentRecords || []).slice();
  let suspicious = false;

  if (recent.length > 0 && ts - recent[0] < AUDIT.minIntervalMs) {
    suspicious = true;
  }
  const hourAgo = ts - 3600000;
  const hourCount = recent.filter(function (t) {
    return t > hourAgo;
  }).length;
  if (hourCount >= AUDIT.maxPerHour) {
    suspicious = true;
  }
  if (typeUsesDuration(type)) {
    const maxDur = getMaxDurationMin(type);
    if ((parseFloat(durationMin) || 0) > maxDur) {
      suspicious = true;
    }
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
  const recent = [timestamp].concat(m.recentRecords || []);
  m.recentRecords = recent.slice(0, AUDIT.recentLimit);
  return m;
}

function calcFishCoins(moneyEarned, rewardPenalty, opts) {
  opts = opts || {};
  if (opts.isSuspicious || opts.justFrozen) {
    return 0;
  }
  return Math.floor((parseFloat(moneyEarned) || 0) * AUDIT.coinRate * rewardPenalty);
}

function buildResultMessage(opts) {
  const coins = opts.fishCoinsGained || 0;
  if (opts.justFrozen) {
    return '伟大的摸鱼之神察觉到你多次违规，本次摸鱼币已清空，后续24小时奖励减半';
  }
  if (opts.isFrozen && !opts.justFrozen) {
    return '伟大的摸鱼之神正在注视你（剩余 ' + opts.freezeRemainHours + ' 小时），摸鱼币奖励减半';
  }
  if (opts.isSuspicious) {
    return '可疑：操作过快或频率异常，本次摸鱼币已清空（记录已保存）';
  }
  return '摸鱼成功！伟大的摸鱼之神奖励你+' + coins + '摸鱼币';
}

module.exports = {
  AUDIT,
  defaultCheatMarker,
  normalizeMarker,
  resolveFreezeState,
  checkSuspicious,
  getMaxDurationMin,
  typeUsesDuration,
  applySuspicious,
  pushRecentRecord,
  calcFishCoins,
  buildResultMessage
};
