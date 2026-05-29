const RANKS = [
  { id: 1, threshold: 0, title: '摸鱼萌新' },
  { id: 2, threshold: 10, title: '划水学徒' },
  { id: 3, threshold: 50, title: '带薪达人' },
  { id: 4, threshold: 200, title: '摸鱼宗师' },
  { id: 5, threshold: 500, title: '白嫖圣手' },
  { id: 6, threshold: 1000, title: '老板亏哭' },
  { id: 7, threshold: 2000, title: '摸鱼天尊' },
  { id: 8, threshold: 5000, title: '终极摸皇' }
];

const BADGES = [
  {
    id: 'first_money',
    name: '第一桶金',
    desc: '累计总金额 ≥ 1元',
    check: function (s) {
      return s.totalMoney >= 1;
    }
  },
  {
    id: 'toilet_30',
    name: '厕所哲学家',
    desc: '上厕所次数 ≥ 30',
    check: function (s) {
      return s.toiletCount >= 30;
    }
  },
  {
    id: 'water_100L',
    name: '水牛转世',
    desc: '喝水总量 ≥ 100升',
    check: function (s) {
      return s.waterLiters >= 100;
    }
  },
  {
    id: 'charge_100h',
    name: '充电狂魔',
    desc: '充电总时长 ≥ 100小时',
    check: function (s) {
      return s.chargeHours >= 100;
    }
  },
  {
    id: 'chat_50',
    name: '茶水间之王',
    desc: '聊天八卦次数 ≥ 50',
    check: function (s) {
      return s.chatCount >= 50;
    }
  },
  {
    id: 'week_streak',
    name: '摸鱼全勤',
    desc: '连续7天有摸鱼记录',
    check: function (s) {
      return s.maxStreak >= 7;
    }
  },
  {
    id: 'total_10000',
    name: '万元户',
    desc: '累计总金额 ≥ 10000元',
    check: function (s) {
      return s.totalMoney >= 10000;
    }
  }
];

function normalizeType(type) {
  return type === 'gossip' ? 'chat' : type;
}

function getRankByMoney(totalMoney) {
  let rank = RANKS[0];
  for (let i = 0; i < RANKS.length; i++) {
    if (totalMoney >= RANKS[i].threshold) {
      rank = RANKS[i];
    }
  }
  return rank;
}

function getNextRank(rankId) {
  return RANKS.find(function (r) {
    return r.id === rankId + 1;
  });
}

function getRankProgress(totalMoney, rankId) {
  const current = RANKS.find(function (r) {
    return r.id === rankId;
  }) || RANKS[0];
  const next = getNextRank(rankId);
  if (!next) return 100;
  const range = next.threshold - current.threshold;
  if (range <= 0) return 100;
  return Math.min(100, Math.round(((totalMoney - current.threshold) / range) * 100));
}

function aggregateStats(records) {
  const list = Array.isArray(records) ? records : [];
  let totalMoney = 0;
  let toiletCount = 0;
  let waterMl = 0;
  let chargeMin = 0;
  let chatCount = 0;
  const daySet = {};

  list.forEach(function (r) {
    totalMoney += r.moneyEarned || 0;
    const type = normalizeType(r.type);
    if (type === 'toilet') toiletCount++;
    if (type === 'water') waterMl += r.waterMl || 0;
    if (type === 'charge') chargeMin += r.durationMin || 0;
    if (type === 'chat') chatCount++;
    const day = r.dateStr || '';
    if (day) daySet[day] = true;
  });

  const days = Object.keys(daySet).sort();
  let maxStreak = 0;
  let streak = 0;
  let prev = null;
  days.forEach(function (d) {
    if (!prev) {
      streak = 1;
    } else {
      const diff = (new Date(d) - new Date(prev)) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    }
    if (streak > maxStreak) maxStreak = streak;
    prev = d;
  });

  return {
    totalMoney: Math.round(totalMoney * 100) / 100,
    toiletCount: toiletCount,
    waterLiters: waterMl / 1000,
    chargeHours: chargeMin / 60,
    chatCount: chatCount,
    maxStreak: maxStreak
  };
}

function checkRankAndBadges(user, records) {
  const stats = aggregateStats(records);
  const newRankId = getRankByMoney(stats.totalMoney).id;
  const oldRankId = (user && user.rankId) || 1;
  const oldBadges = (user && user.badges) || [];
  const newBadges = [];
  const unlocked = [];

  BADGES.forEach(function (b) {
    if (b.check(stats)) {
      newBadges.push(b.id);
      if (oldBadges.indexOf(b.id) < 0) {
        unlocked.push({ type: 'badge', id: b.id, name: b.name });
      }
    }
  });

  const changes = unlocked.slice();
  if (newRankId > oldRankId) {
    const rank = RANKS.find(function (r) {
      return r.id === newRankId;
    });
    changes.unshift({ type: 'rank', id: newRankId, name: rank ? rank.title : '' });
  }

  return {
    stats: stats,
    rankId: newRankId,
    badges: newBadges,
    totalMoneyAllTime: stats.totalMoney,
    changes: changes
  };
}

function getBadgeList(user, records) {
  const stats = aggregateStats(records);
  const unlocked = (user && user.badges) || [];
  return BADGES.map(function (b) {
    return {
      id: b.id,
      name: b.name,
      desc: b.desc,
      achieved: b.check(stats) || unlocked.indexOf(b.id) >= 0
    };
  });
}

module.exports = {
  RANKS,
  BADGES,
  normalizeType,
  getRankByMoney,
  getNextRank,
  getRankProgress,
  aggregateStats,
  checkRankAndBadges,
  getBadgeList
};
