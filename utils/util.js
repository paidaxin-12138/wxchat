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

const TYPE_LABELS = {
  toilet: '上厕所',
  water: '喝水',
  charge: '充电'
};

const TYPE_ICONS = {
  toilet: '🚽',
  water: '💧',
  charge: '⚡'
};

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

function calculateToiletEarned(minutes, config) {
  const perMin = getPerMinuteSalary(config);
  return roundMoney(minutes * perMin);
}

function calculateWaterEarned(waterMl, config) {
  const c = config || getConfig();
  const liters = waterMl / 1000;
  return roundMoney(liters * c.waterPricePerLiter);
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
  return '带薪拉屎 ' + durationMin + ' 分钟';
}

function buildWaterDesc(waterMl) {
  return '喝水 ' + waterMl + 'ml';
}

function buildChargeDesc(durationMin, powerW) {
  const hours = durationMin >= 60 ? (durationMin / 60).toFixed(1) + '小时' : durationMin + '分钟';
  return '充电 ' + hours + ' ' + powerW + 'W';
}

function getRecordsForMonth(records, yearMonth) {
  return records.filter(function (r) {
    return getYearMonthFromTimestamp(r.timestamp) === yearMonth;
  });
}

function getTotalForMonth(records, yearMonth) {
  const list = getRecordsForMonth(records, yearMonth);
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    sum += list[i].moneyEarned || 0;
  }
  return roundMoney(sum);
}

function addRecord(record) {
  const records = getRecords();
  records.unshift(record);
  saveRecords(records);
  return records;
}

function deleteRecordById(id) {
  let records = getRecords();
  records = records.filter(function (r) {
    return r.id !== id;
  });
  saveRecords(records);
  return records;
}

function clearAllRecords() {
  saveRecords([]);
}

function createSampleRecords() {
  const config = getConfig();
  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;
  const yesterday2 = yesterday - 2 * 60 * 60 * 1000;

  const samples = [
    {
      id: generateId(),
      type: 'toilet',
      timestamp: yesterday2,
      timeStr: formatDateTime(yesterday2),
      durationMin: 8,
      moneyEarned: calculateToiletEarned(8, config),
      detailDesc: buildToiletDesc(8)
    },
    {
      id: generateId(),
      type: 'water',
      timestamp: yesterday,
      timeStr: formatDateTime(yesterday),
      waterMl: 600,
      moneyEarned: calculateWaterEarned(600, config),
      detailDesc: buildWaterDesc(600)
    }
  ];
  saveRecords(samples);
}

function initAppData() {
  const initialized = wx.getStorageSync(STORAGE_KEYS.INITIALIZED);
  if (!initialized) {
    saveConfig(Object.assign({}, DEFAULT_CONFIG));
    createSampleRecords();
    wx.setStorageSync(STORAGE_KEYS.INITIALIZED, true);
  }
}

function validatePositiveNumber(val, label) {
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) {
    return { valid: false, message: '请输入有效数值' };
  }
  return { valid: true, value: num };
}

function exportDataJson() {
  return JSON.stringify(
    {
      config: getConfig(),
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
    const current = roundMoney(from + diff * eased);
    callback(current);
    if (progress < 1) {
      setTimeout(step, 16);
    }
  }
  step();
}

module.exports = {
  STORAGE_KEYS,
  DEFAULT_CONFIG,
  TYPE_LABELS,
  TYPE_ICONS,
  formatDateTime,
  formatShortTime,
  formatMonthLabel,
  getCurrentYearMonth,
  getYearMonthFromTimestamp,
  shiftYearMonth,
  generateId,
  getConfig,
  saveConfig,
  getRecords,
  saveRecords,
  getHourlySalary,
  getPerMinuteSalary,
  calculateToiletEarned,
  calculateWaterEarned,
  calculateChargeEarned,
  roundMoney,
  buildToiletDesc,
  buildWaterDesc,
  buildChargeDesc,
  getRecordsForMonth,
  getTotalForMonth,
  addRecord,
  deleteRecordById,
  clearAllRecords,
  initAppData,
  validatePositiveNumber,
  exportDataJson,
  animateNumber
};
