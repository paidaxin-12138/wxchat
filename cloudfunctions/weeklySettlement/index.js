/*
 * 数据库索引建议（云开发控制台 → 数据库 → 索引管理）：
 * 1. users 集合：totalMoneyAllTime 降序
 * 2. weekly_rankings 集合：updateTime 降序
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const WEEKLY_BADGE = '摸鱼宗师';
const TOP_LIMIT = 50;

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatDateYMD(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function getLastWeekRange(baseDate) {
  const now = baseDate ? new Date(baseDate) : new Date();
  const day = now.getDay() || 7;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - day + 1);
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);
  return { start: lastMonday, end: lastSunday };
}

function getISOWeekInfo(date) {
  const range = getLastWeekRange(date);
  const d = new Date(range.start);
  d.setDate(d.getDate() + 3);
  const year = d.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return {
    weekId: year + '-W' + pad(weekNo),
    weekStart: formatDateYMD(range.start)
  };
}

async function updateUserBadge(userId, weeklyBadge, lastWeekRank) {
  if (!userId) return;
  await db.collection('users').doc(userId).update({
    data: {
      weeklyBadge: weeklyBadge,
      lastWeekRank: lastWeekRank
    }
  });
}

exports.main = async function () {
  const now = new Date();
  const weekInfo = getISOWeekInfo(now);
  const weekId = weekInfo.weekId;

  const usersRes = await db
    .collection('users')
    .orderBy('totalMoneyAllTime', 'desc')
    .limit(TOP_LIMIT)
    .get();

  const users = usersRes.data || [];
  const top50 = users.map(function (user, index) {
    return {
      openId: user._openid || '',
      userId: user._id || '',
      nickName: user.nickName || '摸鱼达人',
      avatarUrl: user.avatarUrl || '',
      totalMoney: Math.round((user.totalMoneyAllTime || 0) * 100) / 100,
      rank: index + 1
    };
  });

  const rankingDoc = {
    weekStart: weekInfo.weekStart,
    updateTime: db.serverDate(),
    top50: top50
  };

  await db.collection('weekly_rankings').doc(weekId).set({
    data: rankingDoc
  });

  const newOpenIds = {};
  top50.forEach(function (item) {
    if (item.openId) newOpenIds[item.openId] = true;
  });

  const badgeRes = await db.collection('users').where({ weeklyBadge: WEEKLY_BADGE }).limit(100).get();
  const clearTasks = [];
  (badgeRes.data || []).forEach(function (user) {
    if (!newOpenIds[user._openid]) {
      clearTasks.push(updateUserBadge(user._id, null, 0));
    }
  });

  const awardTasks = top50.map(function (item) {
    return updateUserBadge(item.userId, WEEKLY_BADGE, item.rank);
  });

  await Promise.all(clearTasks.concat(awardTasks));

  return {
    weekId: weekId,
    settled: top50.length,
    weekStart: weekInfo.weekStart
  };
};
