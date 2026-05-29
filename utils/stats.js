const util = require('./util.js');
const rankUtil = require('./rank.js');

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function dateStr(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday.getTime(), end: sunday.getTime() };
}

function getMonthRange(yearMonth) {
  const ym = yearMonth || util.getCurrentYearMonth();
  const parts = ym.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const start = new Date(y, m, 1).getTime();
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999).getTime();
  return { start: start, end: end, yearMonth: ym };
}

function filterByRange(records, start, end) {
  return records.filter(function (r) {
    return r.timestamp >= start && r.timestamp <= end;
  });
}

function sumMoney(records) {
  let s = 0;
  records.forEach(function (r) {
    s += r.moneyEarned || 0;
  });
  return util.roundMoney(s);
}

function buildMetrics(records) {
  const byDay = {};
  records.forEach(function (r) {
    const d = r.dateStr || dateStr(r.timestamp);
    if (!byDay[d]) byDay[d] = 0;
    byDay[d] += r.moneyEarned || 0;
  });
  const days = Object.keys(byDay);
  let maxDay = 0;
  days.forEach(function (d) {
    if (byDay[d] > maxDay) maxDay = byDay[d];
  });
  const total = sumMoney(records);
  const dayCount = days.length || 1;
  return {
    totalMoney: total,
    totalCount: records.length,
    avgDaily: util.roundMoney(total / dayCount),
    maxDaily: util.roundMoney(maxDay)
  };
}

function buildLineChart(records, daysCount) {
  const n = daysCount || 7;
  const labels = [];
  const values = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dateStr(d.getTime());
    labels.push(pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
    let sum = 0;
    records.forEach(function (r) {
      const rd = r.dateStr || dateStr(r.timestamp);
      if (rd === key) sum += r.moneyEarned || 0;
    });
    values.push(util.roundMoney(sum));
  }
  return { type: 'line', labels: labels, values: values };
}

function buildPieChart(records) {
  const map = { toilet: 0, water: 0, charge: 0, chat: 0 };
  records.forEach(function (r) {
    const t = rankUtil.normalizeType(r.type);
    if (map[t] !== undefined) map[t] += r.moneyEarned || 0;
  });
  return {
    type: 'pie',
    items: [
      { name: '上厕所', value: util.roundMoney(map.toilet), color: '#1B5E20' },
      { name: '喝水', value: util.roundMoney(map.water), color: '#43A047' },
      { name: '充电', value: util.roundMoney(map.charge), color: '#81C784' },
      { name: '聊天', value: util.roundMoney(map.chat), color: '#A5D6A7' }
    ]
  };
}

function buildBarChart(records) {
  const weekDays = ['周一', '周二', '周三', '周四', '周五'];
  const mins = [0, 0, 0, 0, 0];
  const range = getWeekRange();
  filterByRange(records, range.start, range.end).forEach(function (r) {
    const d = new Date(r.timestamp);
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) {
      const type = rankUtil.normalizeType(r.type);
      if (type === 'toilet' || type === 'charge' || type === 'chat') {
        mins[wd - 1] += r.durationMin || 0;
      }
    }
  });
  return { type: 'bar', labels: weekDays, values: mins };
}

module.exports = {
  getWeekRange,
  getMonthRange,
  filterByRange,
  buildMetrics,
  buildLineChart,
  buildPieChart,
  buildBarChart
};
