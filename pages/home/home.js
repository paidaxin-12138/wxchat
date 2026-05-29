const util = require('../../utils/util.js');
const cloud = require('../../utils/cloud.js');
const rankUtil = require('../../utils/rank.js');
const posterUtil = require('../../utils/poster.js');
const weeklyReportUtil = require('../../utils/weeklyReport.js');
const reportAction = require('../../utils/reportAction.js');

function afterLoading(done) {
  wx.hideLoading({
    complete: function () {
      if (done) done();
    },
    fail: function () {
      if (done) done();
    }
  });
}

Page({
  data: {
    currentMonth: '',
    monthLabel: '',
    displayTotal: '0.00',
    animTotal: 0,
    showToiletModal: false,
    showWaterModal: false,
    showChargeModal: false,
    showChatModal: false,
    toiletMinutes: '',
    chatMinutes: '',
    waterMl: '',
    waterCup: 0,
    chargeMinutes: '',
    chargePower: '',
    chargePreview: '0.00',
    celeShow: false,
    celeTitle: '',
    celeSubtitle: '',
    celeKind: 'rank',
    posterGenerating: false,
    weeklyGenerating: false,
    submitting: false
  },

  onLoad() {
    const currentMonth = util.getCurrentYearMonth();
    const config = cloud.getLocalUser();
    this.setData({
      currentMonth: currentMonth,
      monthLabel: util.formatMonthLabel(currentMonth),
      chargePower: String(config.chargerPower)
    });
  },

  onShow() {
    cloud.syncRecordsFromCloud().then(() => {
      this.refreshTotal(true);
    });
    const config = cloud.getLocalUser();
    this.setData({ chargePower: String(config.chargerPower) });
  },

  refreshTotal(animate) {
    const records = util.getRecords();
    const total = util.getTotalForMonth(records, this.data.currentMonth);
    const prev = this.data.animTotal || 0;
    if (animate && Math.abs(total - prev) > 0.001) {
      util.animateNumber(this, prev, total, 400, (val) => {
        this.setData({ animTotal: val, displayTotal: val.toFixed(2) });
      });
    } else {
      this.setData({ animTotal: total, displayTotal: total.toFixed(2) });
    }
  },

  prevMonth() {
    const currentMonth = util.shiftYearMonth(this.data.currentMonth, -1);
    this.setData({
      currentMonth: currentMonth,
      monthLabel: util.formatMonthLabel(currentMonth)
    });
    this.refreshTotal(false);
  },

  nextMonth() {
    const currentMonth = util.shiftYearMonth(this.data.currentMonth, 1);
    this.setData({
      currentMonth: currentMonth,
      monthLabel: util.formatMonthLabel(currentMonth)
    });
    this.refreshTotal(false);
  },

  openToilet() { this.setData({ showToiletModal: true, toiletMinutes: '' }); },
  openWater() { this.setData({ showWaterModal: true, waterMl: '', waterCup: 0 }); },
  openCharge() {
    const config = cloud.getLocalUser();
    this.setData({
      showChargeModal: true,
      chargeMinutes: '',
      chargePower: String(config.chargerPower),
      chargePreview: '0.00'
    });
  },
  openChat() { this.setData({ showChatModal: true, chatMinutes: '' }); },

  closeModal() {
    if (this.data.submitting) return;
    this.setData({
      showToiletModal: false,
      showWaterModal: false,
      showChargeModal: false,
      showChatModal: false
    });
  },

  preventClose() {},

  onToiletInput(e) { this.setData({ toiletMinutes: e.detail.value }); },
  onChatInput(e) { this.setData({ chatMinutes: e.detail.value }); },
  onWaterInput(e) { this.setData({ waterMl: e.detail.value, waterCup: 0 }); },
  selectWaterCup(e) {
    if (this.data.submitting) return;
    const cup = parseInt(e.currentTarget.dataset.cup, 10);
    this.setData({ waterCup: cup, waterMl: String(cup * 300) });
  },
  onChargeMinutesInput(e) {
    this.setData({ chargeMinutes: e.detail.value });
    this.updateChargePreview();
  },
  onChargePowerInput(e) {
    this.setData({ chargePower: e.detail.value });
    this.updateChargePreview();
  },

  updateChargePreview() {
    const minVal = parseFloat(this.data.chargeMinutes);
    const powerVal = parseFloat(this.data.chargePower);
    if (isNaN(minVal) || minVal <= 0 || isNaN(powerVal) || powerVal <= 0) {
      this.setData({ chargePreview: '0.00' });
      return;
    }
    this.setData({ chargePreview: util.calculateChargeEarned(minVal, powerVal).toFixed(2) });
  },

  submitMoyu(payload) {
    const that = this;
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '摸鱼中...', mask: true });
    cloud
      .submitMoyuRecord(payload)
      .then(function (result) {
        afterLoading(function () {
          wx.vibrateShort({ type: 'light' });
          that.setData({ submitting: false });
          that.closeModal();
          that.refreshTotal(true);
          that.showMoyuFeedback(result);
          that.showCelebrations(result.changes || []);
        });
      })
      .catch(function (err) {
        afterLoading(function () {
          that.setData({ submitting: false });
          wx.showToast({
            title: (err && err.message) || '保存失败',
            icon: 'none',
            duration: 2500
          });
        });
      });
  },

  showMoyuFeedback(result) {
    const msg = result.message || '摸鱼成功！伟大的摸鱼之神奖励你';
    if (result.justFrozen || result.isSuspicious || result.isFrozen) {
      wx.showModal({ title: '摸鱼之神', content: msg, showCancel: false });
      return;
    }
    wx.showToast({
      title: msg,
      icon: 'none',
      duration: 2800
    });
  },

  showCelebrations(changes) {
    if (!changes || !changes.length) return;
    const first = changes[0];
    if (first.type === 'rank') {
      this.setData({
        celeShow: true,
        celeKind: 'rank',
        celeTitle: '段位升级！',
        celeSubtitle: '恭喜晋升为「' + first.name + '」'
      });
      wx.vibrateShort({ type: 'heavy' });
    } else {
      this.setData({
        celeShow: true,
        celeKind: 'badge',
        celeTitle: '成就解锁！',
        celeSubtitle: '获得「' + first.name + '」'
      });
      wx.vibrateShort({ type: 'medium' });
    }
  },

  onCeleClose() {
    this.setData({ celeShow: false });
  },

  confirmToilet() {
    const result = util.validatePositiveNumber(this.data.toiletMinutes);
    if (!result.valid) return wx.showToast({ title: result.message, icon: 'none' });
    this.submitMoyu({
      type: 'toilet',
      durationMin: result.value,
      timestamp: Date.now()
    });
  },

  confirmWater() {
    let ml = parseFloat(this.data.waterMl);
    if (this.data.waterCup > 0) ml = this.data.waterCup * 300;
    const result = util.validatePositiveNumber(ml);
    if (!result.valid) return wx.showToast({ title: result.message, icon: 'none' });
    this.submitMoyu({
      type: 'water',
      waterMl: result.value,
      durationMin: 0,
      timestamp: Date.now()
    });
  },

  confirmChat() {
    const result = util.validatePositiveNumber(this.data.chatMinutes);
    if (!result.valid) return wx.showToast({ title: result.message, icon: 'none' });
    this.submitMoyu({
      type: 'chat',
      durationMin: result.value,
      timestamp: Date.now()
    });
  },

  confirmCharge() {
    const minResult = util.validatePositiveNumber(this.data.chargeMinutes);
    if (!minResult.valid) return wx.showToast({ title: minResult.message, icon: 'none' });
    const powerResult = util.validatePositiveNumber(this.data.chargePower);
    if (!powerResult.valid) return wx.showToast({ title: '请输入有效功率', icon: 'none' });
    this.submitMoyu({
      type: 'charge',
      durationMin: minResult.value,
      chargePowerW: powerResult.value,
      timestamp: Date.now()
    });
  },

  generatePoster() {
    if (this.data.posterGenerating) return;
    this.setData({ posterGenerating: true });
    const that = this;
    const query = wx.createSelectorQuery();
    query
      .select('#posterCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          that.setData({ posterGenerating: false });
          return wx.showToast({ title: '海报生成失败', icon: 'none' });
        }
        const canvas = res[0].node;
        const user = cloud.getLocalUser();
        const data = posterUtil.buildPosterData(
          util.getRecords(),
          that.data.currentMonth,
          user
        );
        posterUtil
          .generatePoster(canvas, data)
          .then(function (path) {
            that.setData({ posterGenerating: false });
            wx.showActionSheet({
              itemList: ['保存到相册', '预览图片'],
              success(sheet) {
                if (sheet.tapIndex === 0) {
                  wx.saveImageToPhotosAlbum({
                    filePath: path,
                    success() {
                      wx.showToast({ title: '已保存' });
                    },
                    fail() {
                      wx.showModal({
                        title: '需要授权',
                        content: '请在设置中允许保存到相册',
                        showCancel: false
                      });
                    }
                  });
                } else {
                  wx.previewImage({ urls: [path] });
                }
              }
            });
          })
          .catch(function () {
            that.setData({ posterGenerating: false });
            wx.showToast({ title: '海报生成失败', icon: 'none' });
          });
      });
  },

  generateWeeklyReport() {
    if (this.data.weeklyGenerating) return;
    this.setData({ weeklyGenerating: true });
    const that = this;
    const user = cloud.getLocalUser();
    const data = weeklyReportUtil.buildWeeklyReportData(util.getRecords(), user);
    reportAction.runWeeklyReportFlow(this, '#weeklyReportCanvas', data).then(function () {
      that.setData({ weeklyGenerating: false });
    }).catch(function () {
      that.setData({ weeklyGenerating: false });
    });
  },

  onShareAppMessage() {
    return {
      title: '摸鱼经济学 - 本月我赚了 ¥' + this.data.displayTotal,
      path: '/pages/home/home'
    };
  }
});
