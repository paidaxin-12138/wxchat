const cloudUtil = require('../../utils/cloud.js');
const rankUtil = require('../../utils/rank.js');
const util = require('../../utils/util.js');

Page({
  data: {
    totalMoney: '0.00',
    rankId: 1,
    rankTitle: '摸鱼萌新',
    ranks: [],
    badges: []
  },

  onShow() {
    const user = cloudUtil.getLocalUser();
    const records = util.getRecords();
    const stats = rankUtil.aggregateStats(records);
    const rank = rankUtil.getRankByMoney(stats.totalMoney);
    const ranks = rankUtil.RANKS.map(function (r) {
      return {
        id: r.id,
        title: r.title,
        threshold: r.threshold,
        unlocked: stats.totalMoney >= r.threshold
      };
    });
    this.setData({
      totalMoney: stats.totalMoney.toFixed(2),
      rankId: rank.id,
      rankTitle: rank.title,
      ranks: ranks,
      badges: rankUtil.getBadgeList(user, records)
    });
  }
});
