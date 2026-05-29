const config = require('../../config.js');
const util = require('../../utils/util.js');
const cloud = require('../../utils/cloud.js');
const auth = require('../../utils/auth.js');
const rankUtil = require('../../utils/rank.js');
const leaderboardUtil = require('../../utils/leaderboard.js');
const app = getApp();

Page({
  data: {
    nickName: '摸鱼达人',
    avatarUrl: '',
    isLoggedIn: false,
    loginLoading: false,
    version: '2.0.0',
    config: {},
    user: {},
    rankTitle: '摸鱼萌新',
    rankProgress: 0,
    nextRankTitle: '',
    weeklyHonorText: '',
    hasWeeklyBadge: false,
    settingKeys: [
      { key: 'monthlySalary', label: '月薪（元）' },
      { key: 'workDaysPerMonth', label: '每月工作天数' },
      { key: 'workHoursPerDay', label: '每日工作小时' },
      { key: 'waterPricePerLiter', label: '桶装水单价（元/升）' },
      { key: 'electricityPricePerKwh', label: '电费单价（元/度）' },
      { key: 'chargerPower', label: '默认充电器功率（瓦）' }
    ],
    editingKey: '',
    editingLabel: '',
    editValue: '',
    showClearModal: false
  },

  onLoad() {
    this.setData({
      version: app.globalData.version || config.appVersion,
      isLoggedIn: auth.isLoggedIn()
    });
    this.refreshProfile();
  },

  onShow() {
    this.refreshProfile();
    const app = getApp();
    if (auth.isLoggedIn()) {
      this.setData({ isLoggedIn: true });
      if (app && app.globalData) app.globalData.loggedIn = true;
    }
  },

  refreshProfile() {
    const user = cloud.getLocalUser();
    const nickName = wx.getStorageSync('userNickName') || user.nickName || '摸鱼达人';
    let avatarRaw = wx.getStorageSync('userAvatar') || user.avatarUrl || '';
    if (auth.resolveAvatarDisplay(avatarRaw) === '' && avatarRaw) {
      wx.removeStorageSync('userAvatar');
      avatarRaw = '';
    }
    const avatarUrl = auth.resolveAvatarDisplay(avatarRaw);
    this.setData({
      nickName: nickName,
      avatarUrl: avatarUrl,
      isLoggedIn: auth.isLoggedIn()
    });
    this.loadUser();
  },

  loadUser() {
    const user = cloud.getLocalUser();
    const configData = Object.assign({}, util.getDefaultUser(), user);
    const rank = rankUtil.getRankByMoney(user.totalMoneyAllTime || 0);
    const next = rankUtil.getNextRank(rank.id);
    const hourly = util.getHourlySalary(configData);
    const perMin = util.getPerMinuteSalary(configData);
    this.setData({
      user: user,
      config: configData,
      rankTitle: rank.title,
      rankProgress: rankUtil.getRankProgress(user.totalMoneyAllTime || 0, rank.id),
      nextRankTitle: next ? next.title : '已满级',
      weeklyHonorText: leaderboardUtil.buildHonorText(user),
      hasWeeklyBadge: !!(user.weeklyBadge && user.lastWeekRank > 0),
      hourlyStr: hourly.toFixed(2),
      perMinStr: perMin.toFixed(4)
    });
  },

  onWeChatLogin() {
    if (this.data.loginLoading) return;
    this.setData({ loginLoading: true });
    const that = this;
    auth
      .loginWeChat()
      .then(function (res) {
        const app = getApp();
        if (app && app.globalData) app.globalData.loggedIn = true;
        that.setData({
          isLoggedIn: true,
          nickName: res.nickName,
          avatarUrl: res.avatarUrl,
          loginLoading: false
        });
        that.loadUser();
        wx.showToast({ title: '已绑定微信', icon: 'success' });
      })
      .catch(function () {
        that.setData({ loginLoading: false });
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      });
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;
    const that = this;
    wx.showLoading({ title: '上传头像...', mask: true });
    if (!auth.isLoggedIn()) {
      auth.loginWeChat().then(function () {
        that.setData({ isLoggedIn: true });
      });
    }
    auth
      .bindWeChatAvatar(avatarUrl)
      .then(function (url) {
        wx.hideLoading({
          complete: function () {
            that.setData({ avatarUrl: url || '' });
            wx.showToast({ title: '头像已更新', icon: 'success' });
          }
        });
      })
      .catch(function () {
        wx.hideLoading({
          complete: function () {
            wx.showToast({ title: '头像上传失败', icon: 'none' });
          }
        });
      });
  },

  onAvatarError() {
    this.setData({ avatarUrl: '' });
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onNicknameBlur() {
    const that = this;
    auth.bindWeChatNickname(this.data.nickName).then(function (name) {
      that.setData({ nickName: name });
    });
  },

  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' });
  },

  goLeaderboard() {
    wx.switchTab({ url: '/pages/leaderboard/leaderboard' });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  openEdit(e) {
    const key = e.currentTarget.dataset.key;
    const label = e.currentTarget.dataset.label;
    this.setData({
      editingKey: key,
      editingLabel: label,
      editValue: String(this.data.config[key])
    });
  },

  onEditInput(e) {
    this.setData({ editValue: e.detail.value });
  },

  closeEdit() {
    this.setData({ editingKey: '', editValue: '' });
  },

  preventClose() {},

  confirmEdit() {
    const key = this.data.editingKey;
    const result = util.validatePositiveNumber(this.data.editValue);
    if (!result.valid) {
      return wx.showToast({ title: result.message, icon: 'none' });
    }
    const fields = {};
    fields[key] = result.value;
    cloud.updateUser(fields).then(() => {
      this.closeEdit();
      this.loadUser();
      wx.showToast({ title: '已保存', icon: 'success' });
    });
  },

  clearRecords() {
    this.setData({ showClearModal: true });
  },

  closeClearModal() {
    this.setData({ showClearModal: false });
  },

  confirmClearRecords() {
    const that = this;
    if (cloud.isCloudEnabled() && !auth.isLoggedIn()) {
      wx.showModal({
        title: '请先绑定微信',
        content: '清空数据需要同步云端账号，请先完成微信登录绑定。',
        confirmText: '去登录',
        success: function (res) {
          if (res.confirm) that.onWeChatLogin();
        }
      });
      return;
    }
    this.setData({ showClearModal: false });
    cloud.clearAllRecords().then(function () {
      wx.vibrateShort({ type: 'medium' });
      that.setData({
        nickName: '摸鱼达人',
        avatarUrl: ''
      });
      that.loadUser();
      wx.showModal({
        title: '摸鱼之神',
        content:
          '伟大的摸鱼之神已经感受到你的意志，摸鱼记录、养鱼场与头像昵称已全部清空，去忠于公司吧',
        showCancel: false,
        confirmText: '好的'
      });
    });
  },

  onLogout() {
    const that = this;
    wx.showModal({
      title: '解除微信绑定',
      content: '解除后云端数据将不再与本机同步，本地数据仍保留。确定解除吗？',
      confirmText: '解除',
      confirmColor: '#C62828',
      success: function (res) {
        if (!res.confirm) return;
        auth.logoutWeChat().then(function () {
          const app = getApp();
          if (app && app.globalData) app.globalData.loggedIn = false;
          that.setData({ isLoggedIn: false });
          wx.showToast({ title: '已解除绑定', icon: 'none' });
        });
      }
    });
  }
});
