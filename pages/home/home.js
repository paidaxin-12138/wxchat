const util = require('../../utils/util.js');

Page({
  data: {
    currentMonth: '',
    monthLabel: '',
    displayTotal: '0.00',
    animTotal: 0,
    showToiletModal: false,
    showWaterModal: false,
    showChargeModal: false,
    toiletMinutes: '',
    waterMl: '',
    waterCup: 0,
    chargeMinutes: '',
    chargePower: '',
    chargePreview: '0.00'
  },

  onLoad() {
    const currentMonth = util.getCurrentYearMonth();
    this.setData({
      currentMonth: currentMonth,
      monthLabel: util.formatMonthLabel(currentMonth),
      chargePower: String(util.getConfig().chargerPower)
    });
  },

  onShow() {
    this.refreshTotal(true);
    const config = util.getConfig();
    this.setData({
      chargePower: String(config.chargerPower)
    });
  },

  refreshTotal(animate) {
    const records = util.getRecords();
    const total = util.getTotalForMonth(records, this.data.currentMonth);
    const prev = this.data.animTotal || 0;
    if (animate && Math.abs(total - prev) > 0.001) {
      util.animateNumber(this, prev, total, 400, (val) => {
        this.setData({
          animTotal: val,
          displayTotal: val.toFixed(2)
        });
      });
    } else {
      this.setData({
        animTotal: total,
        displayTotal: total.toFixed(2)
      });
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

  openToilet() {
    this.setData({ showToiletModal: true, toiletMinutes: '' });
  },

  openWater() {
    this.setData({ showWaterModal: true, waterMl: '', waterCup: 0 });
  },

  openCharge() {
    const config = util.getConfig();
    this.setData({
      showChargeModal: true,
      chargeMinutes: '',
      chargePower: String(config.chargerPower),
      chargePreview: '0.00'
    });
  },

  closeModal() {
    this.setData({
      showToiletModal: false,
      showWaterModal: false,
      showChargeModal: false
    });
  },

  preventClose() {},

  onToiletInput(e) {
    this.setData({ toiletMinutes: e.detail.value });
  },

  onWaterInput(e) {
    this.setData({ waterMl: e.detail.value, waterCup: 0 });
  },

  selectWaterCup(e) {
    const cup = parseInt(e.currentTarget.dataset.cup, 10);
    const ml = cup * 300;
    this.setData({ waterCup: cup, waterMl: String(ml) });
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
    const earned = util.calculateChargeEarned(minVal, powerVal);
    this.setData({ chargePreview: earned.toFixed(2) });
  },

  confirmToilet() {
    const result = util.validatePositiveNumber(this.data.toiletMinutes, '时长');
    if (!result.valid) {
      wx.showToast({ title: result.message, icon: 'none' });
      return;
    }
    const config = util.getConfig();
    const minutes = result.value;
    const moneyEarned = util.calculateToiletEarned(minutes, config);
    const ts = Date.now();
    util.addRecord({
      id: util.generateId(),
      type: 'toilet',
      timestamp: ts,
      timeStr: util.formatDateTime(ts),
      durationMin: minutes,
      moneyEarned: moneyEarned,
      detailDesc: util.buildToiletDesc(minutes)
    });
    this.afterSave(moneyEarned);
  },

  confirmWater() {
    let ml = parseFloat(this.data.waterMl);
    if (this.data.waterCup > 0) {
      ml = this.data.waterCup * 300;
    }
    const result = util.validatePositiveNumber(ml, '毫升');
    if (!result.valid) {
      wx.showToast({ title: result.message, icon: 'none' });
      return;
    }
    const config = util.getConfig();
    const waterMl = result.value;
    const moneyEarned = util.calculateWaterEarned(waterMl, config);
    const ts = Date.now();
    util.addRecord({
      id: util.generateId(),
      type: 'water',
      timestamp: ts,
      timeStr: util.formatDateTime(ts),
      waterMl: waterMl,
      moneyEarned: moneyEarned,
      detailDesc: util.buildWaterDesc(waterMl)
    });
    this.afterSave(moneyEarned);
  },

  confirmCharge() {
    const minResult = util.validatePositiveNumber(this.data.chargeMinutes, '时长');
    if (!minResult.valid) {
      wx.showToast({ title: minResult.message, icon: 'none' });
      return;
    }
    const powerResult = util.validatePositiveNumber(this.data.chargePower, '功率');
    if (!powerResult.valid) {
      wx.showToast({ title: '请输入有效功率', icon: 'none' });
      return;
    }
    const config = util.getConfig();
    const durationMin = minResult.value;
    const powerW = powerResult.value;
    const moneyEarned = util.calculateChargeEarned(durationMin, powerW, config);
    const ts = Date.now();
    util.addRecord({
      id: util.generateId(),
      type: 'charge',
      timestamp: ts,
      timeStr: util.formatDateTime(ts),
      durationMin: durationMin,
      chargePowerW: powerW,
      moneyEarned: moneyEarned,
      detailDesc: util.buildChargeDesc(durationMin, powerW)
    });
    this.afterSave(moneyEarned);
  },

  afterSave(moneyEarned) {
    wx.vibrateShort({ type: 'light' });
    this.closeModal();
    this.refreshTotal(true);
    wx.showToast({
      title: '摸鱼成功 +¥' + moneyEarned.toFixed(2),
      icon: 'none',
      duration: 1500
    });
  }
});
