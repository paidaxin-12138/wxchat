const util = require('../../utils/util.js');
const app = getApp();

Page({
  data: {
    nickName: '摸鱼达人',
    avatarUrl: '',
    version: '1.0.0',
    config: {},
    settingKeys: [
      { key: 'monthlySalary', label: '月薪（元）', type: 'digit' },
      { key: 'workDaysPerMonth', label: '每月工作天数', type: 'number' },
      { key: 'workHoursPerDay', label: '每日工作小时', type: 'digit' },
      { key: 'waterPricePerLiter', label: '桶装水单价（元/升）', type: 'digit' },
      { key: 'electricityPricePerKwh', label: '电费单价（元/度）', type: 'digit' },
      { key: 'chargerPower', label: '默认充电器功率（瓦）', type: 'digit' }
    ],
    editingKey: '',
    editingLabel: '',
    editValue: ''
  },

  onLoad() {
    const avatarUrl = wx.getStorageSync('userAvatar') || '';
    const nickName = wx.getStorageSync('userNickName') || '摸鱼达人';
    this.setData({
      version: app.globalData.version || '1.0.0',
      avatarUrl: avatarUrl,
      nickName: nickName
    });
    this.loadConfig();
  },

  onShow() {
    this.loadConfig();
  },

  loadConfig() {
    const config = util.getConfig();
    const hourly = util.getHourlySalary(config);
    const perMin = util.getPerMinuteSalary(config);
    this.setData({
      config: config,
      hourlyStr: hourly.toFixed(2),
      perMinStr: perMin.toFixed(4)
    });
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (avatarUrl) {
      this.setData({ avatarUrl: avatarUrl });
      wx.setStorageSync('userAvatar', avatarUrl);
    }
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onNicknameBlur() {
    wx.setStorageSync('userNickName', this.data.nickName);
  },

  openEdit(e) {
    const key = e.currentTarget.dataset.key;
    const label = e.currentTarget.dataset.label;
    const val = this.data.config[key];
    this.setData({
      editingKey: key,
      editingLabel: label,
      editValue: String(val)
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
    const result = util.validatePositiveNumber(this.data.editValue, '数值');
    if (!result.valid) {
      wx.showToast({ title: result.message, icon: 'none' });
      return;
    }
    const config = util.getConfig();
    config[key] = result.value;
    util.saveConfig(config);
    this.closeEdit();
    this.loadConfig();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  clearRecords() {
    wx.showModal({
      title: '清空记录',
      content: '确定清空所有摸鱼记录吗？此操作不可恢复。',
      confirmColor: '#C62828',
      success(res) {
        if (res.confirm) {
          util.clearAllRecords();
          wx.vibrateShort({ type: 'medium' });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  exportData() {
    const json = util.exportDataJson();
    wx.setClipboardData({
      data: json,
      success() {
        wx.showModal({
          title: '导出成功',
          content: '数据已复制到剪贴板（JSON格式），可粘贴保存或分享。',
          showCancel: false
        });
      }
    });
  }
});
