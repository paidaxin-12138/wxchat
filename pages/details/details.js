const util = require('../../utils/util.js');

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
    this.loadRecords();
  },

  loadRecords() {
    const all = util.getRecords();
    const filtered = util.getRecordsForMonth(all, this.data.currentMonth);
    filtered.sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });
    const list = filtered.map(function (r) {
      return Object.assign({}, r, {
        icon: util.TYPE_ICONS[r.type] || '📝',
        shortTime: util.formatShortTime(r.timestamp),
        moneyStr: (r.moneyEarned || 0).toFixed(2)
      });
    });
    const total = util.getTotalForMonth(all, this.data.currentMonth);
    this.setData({
      records: list,
      monthTotal: total.toFixed(2)
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
    if (source !== 'friction' && source !== 'touch-out-of-bounds') {
      return;
    }
    const id = e.currentTarget.dataset.id;
    const x = e.detail.x;
    const open = x < -60;
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
          util.deleteRecordById(id);
          wx.vibrateShort({ type: 'light' });
          const offsets = Object.assign({}, that.data.swipeOffsets);
          delete offsets[id];
          that.setData({ swipeOffsets: offsets });
          that.loadRecords();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  }
});
