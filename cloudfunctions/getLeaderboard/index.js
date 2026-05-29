/*
 * 数据库索引建议：
 * users.totalMoneyAllTime 降序
 * weekly_rankings.updateTime 降序
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const WEEKLY_BADGE = '摸鱼宗师';
const TOP_LIMIT = 50;

function mapUser(item, index, baseRank) {
  const rank = baseRank != null ? baseRank + index + 1 : index + 1;
  return {
    openId: item._openid || '',
    nickName: item.nickName || '摸鱼达人',
    avatarUrl: item.avatarUrl || '',
    totalMoney: Math.round((item.totalMoneyAllTime || 0) * 100) / 100,
    totalMoneyAllTime: item.totalMoneyAllTime || 0,
    rank: rank,
    weeklyBadge: item.weeklyBadge || ''
  };
}

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
  return { start: lastMonday };
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

async function runSettlement() {
  const weekInfo = getISOWeekInfo(new Date());
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

  await db.collection('weekly_rankings').doc(weekId).set({
    data: {
      weekStart: weekInfo.weekStart,
      updateTime: db.serverDate(),
      top50: top50
    }
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
    ok: true,
    weekId: weekId,
    settled: top50.length,
    weekStart: weekInfo.weekStart
  };
}

exports.main = async function (event, context) {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const type = (event && event.type) || 'weekly';

  if (type === 'weekly') {
    try {
      const res = await db
        .collection('weekly_rankings')
        .orderBy('updateTime', 'desc')
        .limit(1)
        .get();
      const doc = (res.data && res.data[0]) || null;
      if (doc && doc.top50 && doc.top50.length > 0) {
        return { ok: true, doc: doc };
      }
    } catch (e) {
      console.error('weekly_rankings query fail', e);
    }

    const liveRes = await db
      .collection('users')
      .orderBy('totalMoneyAllTime', 'desc')
      .limit(TOP_LIMIT)
      .get();
    const top50 = (liveRes.data || []).map(function (user, index) {
      return {
        openId: user._openid || '',
        nickName: user.nickName || '摸鱼达人',
        avatarUrl: user.avatarUrl || '',
        totalMoney: Math.round((user.totalMoneyAllTime || 0) * 100) / 100,
        rank: index + 1
      };
    });
    return {
      ok: true,
      doc: {
        weekStart: '实时预览',
        updateTime: Date.now(),
        top50: top50,
        isPreview: true
      }
    };
  }

  if (type === 'allTime') {
    const skip = (event && event.skip) || 0;
    const limit = Math.min((event && event.limit) || TOP_LIMIT, TOP_LIMIT);
    const res = await db
      .collection('users')
      .orderBy('totalMoneyAllTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get();
    const list = (res.data || []).map(function (item, index) {
      return mapUser(item, index, skip);
    });
    return {
      ok: true,
      list: list,
      hasMore: list.length >= limit
    };
  }

  if (type === 'myRank') {
    const meRes = await db.collection('users').where({ _openid: openId }).limit(1).get();
    const me = (meRes.data && meRes.data[0]) || null;
    const myTotal = (me && me.totalMoneyAllTime) || 0;
    const countRes = await db
      .collection('users')
      .where({ totalMoneyAllTime: _.gt(myTotal) })
      .count();
    return {
      ok: true,
      rank: (countRes.total || 0) + 1,
      totalMoney: myTotal
    };
  }

  if (type === 'settle') {
    try {
      return await runSettlement();
    } catch (e) {
      console.error('settle fail', e);
      return { ok: false, message: e.message || 'settle failed' };
    }
  }

  return { ok: false, message: 'unknown type' };
};
