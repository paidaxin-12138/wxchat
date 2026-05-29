const config = require('../../config.js');
const util = require('../../utils/util.js');
const statsUtil = require('../../utils/stats.js');

Page({
  data: {
    filterType: 'month',
    currentMonth: '',
    monthLabel: '',
    pickerValue: '',
    metrics: { totalMoney: '0.00', totalCount: 0, avgDaily: '0.00', maxDaily: '0.00' },
    lineOption: null,
    pieOption: null,
    barOption: null,
    hasData: false
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
    this.refresh();
  },

  refresh() {
    const records = util.getRecords();
    let filtered = [];
    if (this.data.filterType === 'week') {
      const range = statsUtil.getWeekRange();
      filtered = statsUtil.filterByRange(records, range.start, range.end);
    } else if (this.data.filterType === 'month') {
      filtered = util.getRecordsForMonth(records, this.data.currentMonth);
    } else {
      const range = statsUtil.getMonthRange(this.data.currentMonth);
      filtered = statsUtil.filterByRange(records, range.start, range.end);
    }

    const metrics = statsUtil.buildMetrics(filtered);
    this.setData({
      metrics: {
        totalMoney: metrics.totalMoney.toFixed(2),
        totalCount: metrics.totalCount,
        avgDaily: metrics.avgDaily.toFixed(2),
        maxDaily: metrics.maxDaily.toFixed(2)
      },
      lineOption: statsUtil.buildLineChart(filtered, 7),
      pieOption: statsUtil.buildPieChart(filtered),
      barOption: statsUtil.buildBarChart(records),
      hasData: filtered.length > 0
    });
  },

  setFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterType: type });
    this.refresh();
  },

  onMonthChange(e) {
    const val = e.detail.value;
    const parts = val.split('-');
    const yearMonth = parts[0] + '-' + parts[1];
    this.setData({
      currentMonth: yearMonth,
      monthLabel: util.formatMonthLabel(yearMonth),
      pickerValue: val,
      filterType: 'custom'
    });
    this.refresh();
  }
});
