const util = require('../../utils/util.js');
const cloud = require('../../utils/cloud.js');
const posterUtil = require('../../utils/poster.js');
const weeklyReportUtil = require('../../utils/weeklyReport.js');
const reportAction = require('../../utils/reportAction.js');

Page({
  data: {
    currentMonth: '',
    monthLabel: '',
    pickerValue: '',
    records: [],
    monthTotal: '0.00',
    swipeOffsets: {}
  },

  onLoad() {
    const currentMonth = util.getCurrentYearMonth();
    this.setData({
      currentMonth: currentMonth,
      monthLabel: util.formatMonthLabel(currentMonth),
      pickerValue: currentMonth + '-01'
    });
  },

  onShow() {
    cloud.syncRecordsFromCloud().then(() => this.loadRecords());
  },

  loadRecords() {
    const all = util.getRecords();
    const filtered = util.getRecordsForMonth(all, this.data.currentMonth);
    filtered.sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });
    const list = filtered.map(function (r) {
      const type = r.type === 'gossip' ? 'chat' : r.type;
      return Object.assign({}, r, {
        iconClass: util.getTypeIconClass(type),
        shortTime: (r.dateStr ? r.dateStr.substring(5) : '') + ' ' + (r.timeStr || ''),
        moneyStr: (r.moneyEarned || 0).toFixed(2),
        recordId: r._id || r.id
      });
    });
    this.setData({
      records: list,
      monthTotal: util.getTotalForMonth(all, this.data.currentMonth).toFixed(2)
    });
  },

  onMonthChange(e) {
    const val = e.detail.value;
    const parts = val.split('-');
    const yearMonth = parts[0] + '-' + parts[1];
    this.setData({
      currentMonth: yearMonth,
      monthLabel: util.formatMonthLabel(yearMonth),
      pickerValue: val
    });
    this.loadRecords();
  },

  onSwipeChange(e) {
    const source = e.detail.source;
    if (source !== 'friction' && source !== 'touch-out-of-bounds') return;
    const id = e.currentTarget.dataset.id;
    const open = e.detail.x < -60;
    const offsets = Object.assign({}, this.data.swipeOffsets);
    Object.keys(offsets).forEach(function (k) {
      if (k !== id) offsets[k] = 0;
    });
    offsets[id] = open ? -120 : 0;
    this.setData({ swipeOffsets: offsets });
  },

  onDeleteTap(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定删除这条摸鱼记录吗？',
      confirmColor: '#C62828',
      success(res) {
        if (res.confirm) {
          cloud.deleteRecord(id).then(function () {
            wx.vibrateShort({ type: 'light' });
            const offsets = Object.assign({}, that.data.swipeOffsets);
            delete offsets[id];
            that.setData({ swipeOffsets: offsets });
            that.loadRecords();
            wx.showToast({ title: '已删除', icon: 'success' });
          });
        }
      }
    });
  },

  generatePoster() {
    const that = this;
    const query = wx.createSelectorQuery();
    query
      .select('#posterCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          return wx.showToast({ title: '海报生成失败', icon: 'none' });
        }
        const user = cloud.getLocalUser();
        const data = posterUtil.buildPosterData(
          util.getRecords(),
          that.data.currentMonth,
          user
        );
        posterUtil.generatePoster(res[0].node, data).then(function (path) {
          wx.previewImage({ urls: [path] });
        });
      });
  },

  generateWeeklyReport() {
    const user = cloud.getLocalUser();
    const data = weeklyReportUtil.buildWeeklyReportData(util.getRecords(), user);
    reportAction.runWeeklyReportFlow(this, '#weeklyReportCanvas', data);
  },

  onShareAppMessage() {
    return {
      title: '我的摸鱼明细 - ¥' + this.data.monthTotal,
      path: '/pages/details/details'
    };
  }
});
