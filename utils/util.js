const fishData = require('./fishData.js');

const STORAGE_KEYS = {
  CONFIG: 'userConfig',
  RECORDS: 'records',
  INITIALIZED: 'appInitialized'
};

const DEFAULT_CONFIG = {
  monthlySalary: 8000,
  workDaysPerMonth: 22,
  workHoursPerDay: 8,
  waterPricePerLiter: 0.5,
  electricityPricePerKwh: 0.6,
  chargerPower: 20
};

const DEFAULT_USER = Object.assign({}, DEFAULT_CONFIG, fishData.getDefaultFishFarmFields(), {
  subscribeWeekly: false,
  rankId: 1,
  badges: [],
  totalMoneyAllTime: 0,
  weeklyBadge: null,
  lastWeekRank: 0,
  nickName: '摸鱼达人',
  avatarUrl: '',
  totalExchangedRMB: 0,
  lastFishFarmVisit: Date.now()
});

const TYPE_LABELS = {
  toilet: '上厕所',
  water: '喝水',
  charge: '充电',
  chat: '聊天八卦',
  gossip: '聊天八卦'
};

const icons = require('./icons.js');

function getTypeIconClass(type) {
  return icons.getIconClass(type);
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatDateTime(timestamp) {
  const d = new Date(timestamp);
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}

function formatShortTime(timestamp) {
  const d = new Date(timestamp);
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatMonthLabel(yearMonth) {
  const parts = yearMonth.split('-');
  return parts[0] + '年' + parseInt(parts[1], 10) + '月';
}

function getCurrentYearMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

function getYearMonthFromTimestamp(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

function shiftYearMonth(yearMonth, delta) {
  const parts = yearMonth.split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) - 1;
  m += delta;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  return y + '-' + pad(m + 1);
}

function generateId() {
  return Date.now() + '_' + Math.floor(Math.random() * 10000);
}

function getDefaultUser() {
  return Object.assign({}, DEFAULT_USER);
}

function getConfig() {
  const stored = wx.getStorageSync(STORAGE_KEYS.CONFIG);
  if (stored && typeof stored === 'object') {
    return Object.assign({}, DEFAULT_CONFIG, stored);
  }
  return Object.assign({}, DEFAULT_CONFIG);
}

function saveConfig(config) {
  wx.setStorageSync(STORAGE_KEYS.CONFIG, config);
}

function getRecords() {
  const records = wx.getStorageSync(STORAGE_KEYS.RECORDS);
  return Array.isArray(records) ? records : [];
}

function saveRecords(records) {
  wx.setStorageSync(STORAGE_KEYS.RECORDS, records);
}

function getHourlySalary(config) {
  const c = config || getConfig();
  const totalHours = c.workDaysPerMonth * c.workHoursPerDay;
  if (totalHours <= 0) return 0;
  return c.monthlySalary / totalHours;
}

function getPerMinuteSalary(config) {
  return getHourlySalary(config) / 60;
}

function calculateTimeEarned(minutes, config) {
  return roundMoney(minutes * getPerMinuteSalary(config));
}

function calculateToiletEarned(minutes, config) {
  return calculateTimeEarned(minutes, config);
}

function calculateChatEarned(minutes, config) {
  return calculateTimeEarned(minutes, config);
}

function calculateGossipEarned(minutes, config) {
  return calculateChatEarned(minutes, config);
}

function calculateWaterEarned(waterMl, config) {
  const c = config || getConfig();
  return roundMoney((waterMl / 1000) * c.waterPricePerLiter);
}

function calculateChargeEarned(durationMin, powerW, config) {
  const c = config || getConfig();
  const power = powerW != null ? powerW : c.chargerPower;
  const kwh = (power / 1000) * (durationMin / 60);
  return roundMoney(kwh * c.electricityPricePerKwh);
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function buildToiletDesc(durationMin) {
  return '上厕所 ' + durationMin + '分钟';
}

function buildWaterDesc(waterMl) {
  return '喝水 ' + waterMl + 'ml';
}

function buildChargeDesc(durationMin, powerW) {
  const hours = durationMin >= 60 ? (durationMin / 60).toFixed(1) + '小时' : durationMin + '分钟';
  return '充电 ' + hours + ' ' + powerW + 'W';
}

function buildChatDesc(durationMin) {
  return '聊天八卦 ' + durationMin + '分钟';
}

function buildGossipDesc(durationMin) {
  return buildChatDesc(durationMin);
}

function getRecordsForMonth(records, yearMonth) {
  return records.filter(function (r) {
    const ym = r.dateStr ? r.dateStr.substring(0, 7) : getYearMonthFromTimestamp(r.timestamp);
    return ym === yearMonth;
  });
}

function getTotalForMonth(records, yearMonth) {
  let sum = 0;
  getRecordsForMonth(records, yearMonth).forEach(function (r) {
    sum += r.moneyEarned || 0;
  });
  return roundMoney(sum);
}

function buildRecord(type, fields, config) {
  const ts = fields.timestamp || Date.now();
  const d = new Date(ts);
  const dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const timeStr = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const base = {
    id: fields.id || generateId(),
    type: type === 'gossip' ? 'chat' : type,
    timestamp: ts,
    dateStr: dateStr,
    timeStr: timeStr,
    moneyEarned: fields.moneyEarned,
    detailDesc: fields.detailDesc
  };
  if (type === 'water') base.waterMl = fields.waterMl;
  else base.durationMin = fields.durationMin;
  if (type === 'charge') base.chargePowerW = fields.chargePowerW;
  return base;
}

function validatePositiveNumber(val) {
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) {
    return { valid: false, message: '请输入有效数值' };
  }
  return { valid: true, value: num };
}

function exportDataJson() {
  return JSON.stringify(
    {
      user: wx.getStorageSync('cloudUser') || getConfig(),
      records: getRecords(),
      exportTime: formatDateTime(Date.now())
    },
    null,
    2
  );
}

function animateNumber(context, from, to, duration, callback) {
  const start = Date.now();
  const diff = to - from;
  if (Math.abs(diff) < 0.01) {
    callback(to);
    return;
  }
  function step() {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    callback(roundMoney(from + diff * eased));
    if (progress < 1) setTimeout(step, 16);
  }
  step();
}

function createSampleRecords(config) {
  const c = config || getConfig();
  const now = Date.now();
  const yesterday = now - 86400000;
  return [
    buildRecord(
      'toilet',
      {
        timestamp: yesterday - 7200000,
        durationMin: 8,
        moneyEarned: calculateToiletEarned(8, c),
        detailDesc: buildToiletDesc(8)
      },
      c
    ),
    buildRecord(
      'water',
      {
        timestamp: yesterday,
        waterMl: 600,
        moneyEarned: calculateWaterEarned(600, c),
        detailDesc: buildWaterDesc(600)
      },
      c
    ),
    buildRecord(
      'chat',
      {
        timestamp: yesterday - 1800000,
        durationMin: 15,
        moneyEarned: calculateChatEarned(15, c),
        detailDesc: buildChatDesc(15)
      },
      c
    )
  ];
}

function initLocalData() {
  if (wx.getStorageSync(STORAGE_KEYS.INITIALIZED)) return;
  saveConfig(Object.assign({}, DEFAULT_CONFIG));
  saveRecords(createSampleRecords());
  wx.setStorageSync('cloudUser', getDefaultUser());
  wx.setStorageSync(STORAGE_KEYS.INITIALIZED, true);
}

module.exports = {
  STORAGE_KEYS,
  DEFAULT_CONFIG,
  DEFAULT_USER,
  TYPE_LABELS,
  getTypeIconClass,
  pad,
  formatDateTime,
  formatShortTime,
  formatMonthLabel,
  getCurrentYearMonth,
  getYearMonthFromTimestamp,
  shiftYearMonth,
  generateId,
  getDefaultUser,
  getConfig,
  saveConfig,
  getRecords,
  saveRecords,
  getHourlySalary,
  getPerMinuteSalary,
  calculateTimeEarned,
  calculateToiletEarned,
  calculateChatEarned,
  calculateGossipEarned,
  calculateWaterEarned,
  calculateChargeEarned,
  roundMoney,
  buildToiletDesc,
  buildWaterDesc,
  buildChargeDesc,
  buildChatDesc,
  buildGossipDesc,
  buildRecord,
  getRecordsForMonth,
  getTotalForMonth,
  validatePositiveNumber,
  exportDataJson,
  animateNumber,
  createSampleRecords,
  initLocalData
};
