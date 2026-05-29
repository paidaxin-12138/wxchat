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
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const year = d.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return {
    weekId: year + '-W' + pad(weekNo),
    weekStart: formatDateYMD(getLastWeekRange(date).start)
  };
}

const avatarUtil = require('./avatar.js');

function getRankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

function formatMoney(amount) {
  const n = parseFloat(amount) || 0;
  return '¥' + n.toFixed(2);
}

function mapRankingItem(item, index) {
  const rank = item.rank != null ? item.rank : index + 1;
  const money = item.totalMoney != null ? item.totalMoney : item.totalMoneyAllTime;
  return {
    rank: rank,
    rankDisplay: getRankMedal(rank),
    openId: item.openId || item._openid || '',
    nickName: item.nickName || '摸鱼达人',
    avatarUrl: avatarUtil.resolveAvatarDisplay(item.avatarUrl || ''),
    totalMoney: (parseFloat(money) || 0).toFixed(2),
    moneyDisplay: formatMoney(money),
    weeklyBadge: item.weeklyBadge || '',
    showBadge: !!item.weeklyBadge
  };
}

function buildHonorText(user) {
  if (user && user.weeklyBadge && user.lastWeekRank > 0) {
    return '🏆 本周荣誉：' + user.weeklyBadge + '（第 ' + user.lastWeekRank + ' 名）';
  }
  return '📅 本周未上榜，下周继续摸鱼';
}

function buildWeekMasterText(user) {
  if (user && user.lastWeekRank > 0) {
    return '本周成功登顶宗师榜第 ' + user.lastWeekRank + ' 名';
  }
  return '';
}

module.exports = {
  WEEKLY_BADGE,
  TOP_LIMIT,
  getLastWeekRange,
  getISOWeekInfo,
  getRankMedal,
  formatMoney,
  mapRankingItem,
  buildHonorText,
  buildWeekMasterText
};
