const cloud = require('../../utils/cloud.js');
const leaderboardUtil = require('../../utils/leaderboard.js');

Page({
  data: {
    activeTab: 0,
    weeklyList: [],
    weeklyWeekLabel: '',
    weeklyEmpty: false,
    weeklyPreview: false,
    allTimeList: [],
    allTimeSkip: 0,
    allTimeHasMore: true,
    allTimeLoading: false,
    myRank: null,
    cloudEnabled: false,
    refreshing: false,
    loadError: '',
    settling: false
  },

  onLoad() {
    this.setData({ cloudEnabled: cloud.isCloudEnabled() });
    this.refreshAll();
  },

  onShow() {
    this.refreshAll();
  },

  refreshAll() {
    const that = this;
    return cloud.syncUserToCloud().then(function () {
      return that.loadData(true);
    });
  },

  onPullDownRefresh() {
    const that = this;
    this.setData({ refreshing: true, allTimeSkip: 0, allTimeHasMore: true, loadError: '' });
    this.refreshAll().finally(function () {
      that.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.activeTab === 1 && this.data.allTimeHasMore && !this.data.allTimeLoading) {
      this.loadAllTimeRanking(false);
    }
  },

  switchTab(e) {
    const tab = parseInt(e.currentTarget.dataset.tab, 10);
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 1 && this.data.allTimeList.length === 0) {
      this.loadAllTimeRanking(true);
    }
  },

  loadData(resetAllTime) {
    const that = this;
    const tasks = [this.loadWeeklyRanking()];
    if (resetAllTime) {
      this.setData({ allTimeSkip: 0, allTimeHasMore: true });
    }
    tasks.push(this.loadAllTimeRanking(!!resetAllTime));
    return Promise.all(tasks);
  },

  loadWeeklyRanking() {
    const that = this;
    if (!cloud.isCloudEnabled()) {
      that.setData({
        weeklyList: [],
        weeklyWeekLabel: '',
        weeklyEmpty: true,
        weeklyPreview: false,
        loadError: ''
      });
      return Promise.resolve();
    }
    return cloud.fetchLatestWeeklyRanking().then(function (doc) {
      if (!doc || !doc.top50 || doc.top50.length === 0) {
        that.setData({
          weeklyList: [],
          weeklyWeekLabel: '',
          weeklyEmpty: true,
          weeklyPreview: false
        });
        return;
      }
      const list = doc.top50.map(function (item, index) {
        const mapped = leaderboardUtil.mapRankingItem(item, index);
        mapped.weeklyBadge = leaderboardUtil.WEEKLY_BADGE;
        mapped.showBadge = true;
        return mapped;
      });
      const isPreview = !!doc.isPreview;
      const label = isPreview
        ? '实时预览榜（周一凌晨正式定榜）'
        : (doc.weekStart ? doc.weekStart + ' 周榜' : '本周宗师榜');
      that.setData({
        weeklyList: list,
        weeklyWeekLabel: label,
        weeklyEmpty: false,
        weeklyPreview: isPreview
      });
    });
  },

  loadAllTimeRanking(reset) {
    const that = this;
    if (this.data.allTimeLoading) return Promise.resolve();
    if (!reset && !this.data.allTimeHasMore) return Promise.resolve();

    const skip = reset ? 0 : this.data.allTimeSkip;
    this.setData({ allTimeLoading: true });

    return Promise.all([
      cloud.fetchAllTimeRanking(skip, leaderboardUtil.TOP_LIMIT),
      cloud.fetchMyAllTimeRank()
    ])
      .then(function (results) {
        const res = results[0];
        const myRank = results[1];
        const merged = reset ? res.list : that.data.allTimeList.concat(res.list);
        that.setData({
          allTimeList: merged,
          allTimeSkip: skip + res.list.length,
          allTimeHasMore: res.hasMore,
          myRank: myRank,
          allTimeLoading: false,
          loadError: res.error || (res.list.length === 0 ? '' : '')
        });
      })
      .catch(function (err) {
        const msg = (err && err.errMsg) || '';
        const hint = msg.indexOf('FUNCTION_NOT_FOUND') >= 0 || msg.indexOf('-501000') >= 0
          ? '请部署 getLeaderboard 云函数'
          : msg || '加载失败';
        that.setData({
          allTimeLoading: false,
          loadError: hint
        });
      });
  },

  runSettlement() {
    const that = this;
    if (!cloud.isCloudEnabled()) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' });
      return;
    }
    if (that.data.settling) return;
    that.setData({ settling: true });
    cloud
      .runWeeklySettlement()
      .then(function (result) {
        if (!result || !result.ok) {
          wx.showModal({
            title: '定榜失败',
            content: (result && result.message) || '定榜未完成，请稍后重试',
            showCancel: false
          });
          return;
        }
        wx.showToast({ title: '定榜完成', icon: 'success' });
        return that.refreshAll();
      })
      .catch(function (err) {
        const msg = (err && err.errMsg) || '';
        const hint =
          msg.indexOf('选择一个云环境') >= 0
            ? '请右键 cloudfunctions 文件夹 → 当前环境 / 切换环境，选择你的云开发环境后再部署'
            : msg.indexOf('FUNCTION_NOT_FOUND') >= 0 || msg.indexOf('-501000') >= 0
              ? '请先右键 cloudfunctions → 选择云环境，再部署 getLeaderboard 云函数'
              : msg || '网络异常，请稍后重试';
        wx.showModal({
          title: '定榜失败',
          content: hint,
          showCancel: false
        });
      })
      .finally(function () {
        that.setData({ settling: false });
      });
  }
});
