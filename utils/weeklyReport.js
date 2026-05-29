const rankUtil = require('./rank.js');
const statsUtil = require('./stats.js');
const util = require('./util.js');
const posterUtil = require('./poster.js');
const leaderboardUtil = require('./leaderboard.js');
const icons = require('./icons.js');

const W = 750;
const H = 1200;
const FONT = '"PingFang SC", sans-serif';
const PAD = 40;
const GAP = 24;
const COL_W = (W - PAD * 2 - GAP) / 2;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCard(ctx, x, y, w, h) {
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, x, y, w, h, 24);
  ctx.fill();
}

function formatDotDate(ts) {
  const d = new Date(ts);
  const p = util.pad;
  return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
}

function buildEquivalent(fishMoney) {
  const money = parseFloat(fishMoney) || 0;
  const cups = Math.max(1, Math.round(money / 35));
  return cups + ' 杯星巴克';
}

function getNewAchievementThisWeek(allRecords, weekStart) {
  const before = allRecords.filter(function (r) {
    return r.timestamp < weekStart;
  });
  const statsBefore = rankUtil.aggregateStats(before);
  const statsAll = rankUtil.aggregateStats(allRecords);
  for (let i = 0; i < rankUtil.BADGES.length; i++) {
    const b = rankUtil.BADGES[i];
    if (b.check(statsAll) && !b.check(statsBefore)) {
      return b.name;
    }
  }
  return '无';
}

function buildWeeklyReportData(records, user) {
  const range = statsUtil.getWeekRange();
  const weekRecords = statsUtil.filterByRange(records, range.start, range.end);
  const weekStats = rankUtil.aggregateStats(weekRecords);
  const totalMoney = user.totalMoneyAllTime || rankUtil.aggregateStats(records).totalMoney;
  const rank = rankUtil.getRankByMoney(totalMoney);
  const next = rankUtil.getNextRank(rank.id);
  const needMoney = next ? Math.max(0, next.threshold - totalMoney) : 0;
  const progress = rankUtil.getRankProgress(totalMoney, rank.id);

  let toiletTimes = 0;
  let drinkWaterLiter = 0;
  let chargeHour = 0;
  let chatTimes = 0;
  weekRecords.forEach(function (r) {
    const type = rankUtil.normalizeType(r.type);
    if (type === 'toilet') toiletTimes++;
    if (type === 'water') drinkWaterLiter += (r.waterMl || 0) / 1000;
    if (type === 'charge') chargeHour += (r.durationMin || 0) / 60;
    if (type === 'chat') chatTimes++;
  });

  const fishMoney = weekStats.totalMoney.toFixed(2);
  const beat = posterUtil.calcBeatPercent(weekStats.totalMoney, weekRecords.length);

  return {
    dateRange: formatDotDate(range.start) + ' - ' + formatDotDate(range.end),
    fishMoney: fishMoney,
    equivalent: buildEquivalent(fishMoney),
    currentRank: rank.title,
    needMoneyForNextRank: needMoney.toFixed(1),
    rankProgress: progress,
    toiletTimes: toiletTimes,
    drinkWaterLiter: drinkWaterLiter.toFixed(1),
    chargeHour: chargeHour.toFixed(1),
    chatTimes: chatTimes,
    newAchievement: getNewAchievementThisWeek(records, range.start),
    beatPercent: beat + '%',
    weekMasterText: leaderboardUtil.buildWeekMasterText(user)
  };
}

function drawMetricCard(ctx, x, y, w, h, iconType, label, value) {
  drawCard(ctx, x, y, w, h);
  const cx = x + w / 2;
  icons.drawCanvasIcon(ctx, cx, y + 38, iconType, 28, '#2D2F36');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '22px ' + FONT;
  ctx.fillStyle = '#7F8C8D';
  ctx.fillText(label, cx, y + 78);
  ctx.font = 'bold 24px ' + FONT;
  ctx.fillStyle = '#2E7D32';
  let valStr = String(value);
  const maxW = w - 24;
  while (ctx.measureText(valStr).width > maxW && ctx.font !== 'bold 18px ' + FONT) {
    ctx.font = 'bold 20px ' + FONT;
    if (ctx.measureText(valStr).width > maxW) ctx.font = 'bold 18px ' + FONT;
    else break;
  }
  ctx.fillText(valStr, cx, y + h - 22);
}

function drawStamp(ctx, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-12 * Math.PI / 180);
  ctx.strokeStyle = '#C62828';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(198, 40, 40, 0.08)';
  ctx.beginPath();
  ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#C62828';
  ctx.font = 'bold 22px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('摸鱼', 0, -12);
  ctx.fillText('认证', 0, 14);
  ctx.restore();
}

function drawQrPlaceholder(ctx, x, y, size) {
  ctx.fillStyle = '#BDC3C7';
  roundRect(ctx, x, y, size, size, 12);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '20px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('码', x + size / 2, y + size / 2);
}

function paintWeeklyReport(ctx, data) {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#E8F5E9');
  grd.addColorStop(1, '#66BB6A');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  let y = PAD + 10;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2D2F36';
  ctx.font = 'bold 42px ' + FONT;
  ctx.fillText('📊 摸鱼周报', W / 2, y + 42);
  y += 56;
  ctx.fillStyle = '#4A4E5C';
  ctx.font = '24px ' + FONT;
  ctx.fillText(data.dateRange || '', W / 2, y + 24);
  y += 48;

  const row2H = 230;
  const leftX = PAD;
  const rightX = PAD + COL_W + GAP;

  drawCard(ctx, leftX, y, COL_W, row2H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2E7D32';
  ctx.font = 'bold 52px ' + FONT;
  ctx.fillText('¥' + (data.fishMoney || '0.00'), leftX + COL_W / 2, y + 90);
  ctx.fillStyle = '#7F8C8D';
  ctx.font = '22px ' + FONT;
  ctx.fillText('相当于 ' + (data.equivalent || ''), leftX + COL_W / 2, y + 140);

  drawCard(ctx, rightX, y, COL_W, row2H);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#2C3E50';
  ctx.font = 'bold 28px ' + FONT;
  ctx.fillText('🏆 ' + (data.currentRank || '摸鱼萌新'), rightX + 24, y + 52);

  const barX = rightX + 24;
  const barY = y + 78;
  const barW = COL_W - 48;
  const barH = 14;
  ctx.fillStyle = '#ECF0F1';
  roundRect(ctx, barX, barY, barW, barH, 7);
  ctx.fill();
  const progress = data.rankProgress != null ? data.rankProgress : 0;
  const fillW = (barW * progress) / 100;
  if (fillW > 0) {
    ctx.fillStyle = '#66BB6A';
    roundRect(ctx, barX, barY, fillW, barH, 7);
    ctx.fill();
  }
  ctx.fillStyle = '#7F8C8D';
  ctx.font = '20px ' + FONT;
  ctx.fillText('距下一段位还需 ¥' + (data.needMoneyForNextRank || '0'), barX, y + 130);

  y += row2H + GAP;

  const row3H = 400;
  const metricW = (COL_W - GAP) / 2;
  const metricH = (row3H - GAP) / 2;
  const metrics = [
    { type: 'toilet', label: '上厕所', value: (data.toiletTimes || 0) + ' 次' },
    { type: 'water', label: '喝水', value: (data.drinkWaterLiter || 0) + ' 升' },
    { type: 'charge', label: '充电', value: (data.chargeHour || 0) + ' 小时' },
    { type: 'chat', label: '聊天', value: (data.chatTimes || 0) + ' 次' }
  ];
  const metricPos = [
    [leftX, y],
    [leftX + metricW + GAP, y],
    [leftX, y + metricH + GAP],
    [leftX + metricW + GAP, y + metricH + GAP]
  ];
  metrics.forEach(function (m, i) {
    drawMetricCard(ctx, metricPos[i][0], metricPos[i][1], metricW, metricH, m.type, m.label, m.value);
  });

  drawCard(ctx, rightX, y, COL_W, row3H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2C3E50';
  ctx.font = '26px ' + FONT;
  const achText =
    data.newAchievement && data.newAchievement !== '无'
      ? '🏅 本周新成就：' + data.newAchievement
      : '🏅 本周新成就：无';
  ctx.fillText(achText, rightX + COL_W / 2, y + 100);

  ctx.font = '28px ' + FONT;
  const beatNum = parseInt(String(data.beatPercent).replace('%', ''), 10);
  if (beatNum > 0) {
    ctx.fillText('🔥 超过 ' + (data.beatPercent || '0%') + ' 的摸鱼人', rightX + COL_W / 2, y + 200);
  } else {
    ctx.fillText('本周还没摸鱼记录', rightX + COL_W / 2, y + 200);
    ctx.font = '24px ' + FONT;
    ctx.fillText('下周继续加油', rightX + COL_W / 2, y + 240);
  }

  if (data.weekMasterText) {
    ctx.font = '24px ' + FONT;
    ctx.fillStyle = '#C62828';
    ctx.fillText('🏆 ' + data.weekMasterText, rightX + COL_W / 2, y + 280);
  }

  y += row3H + GAP;

  const bottomH = 220;
  drawCard(ctx, PAD, y, W - PAD * 2, bottomH);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#C62828';
  ctx.font = 'bold 32px ' + FONT;
  ctx.fillText('摸鱼经济学，带薪就是赚！', W / 2, y + 52);

  ctx.fillStyle = '#7F8C8D';
  ctx.font = '20px ' + FONT;
  ctx.fillText('—— 官方摸鱼周报 ——', W / 2, y + 88);

  const qrSize = 100;
  const qrX = PAD + 24;
  const qrY = y + bottomH - qrSize - 20;
  drawQrPlaceholder(ctx, qrX, qrY, qrSize);

  const stampR = 54;
  const stampX = W - PAD - 24 - stampR;
  const stampY = y + bottomH - 20 - stampR;
  drawStamp(ctx, stampX, stampY, stampR);
}

function getWindowPixelRatio() {
  if (wx.getWindowInfo) {
    return wx.getWindowInfo().pixelRatio || 2;
  }
  try {
    return wx.getSystemInfoSync().pixelRatio || 2;
  } catch (e) {
    return 2;
  }
}

function drawWeeklyReport(canvas, data) {
  return new Promise(function (resolve, reject) {
    if (!canvas) {
      reject(new Error('canvas not found'));
      return;
    }
    const dpr = getWindowPixelRatio();
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    paintWeeklyReport(ctx, data);
    setTimeout(function () {
      wx.canvasToTempFilePath({
        canvas: canvas,
        width: W * dpr,
        height: H * dpr,
        destWidth: W * dpr,
        destHeight: H * dpr,
        fileType: 'png',
        success: function (res) {
          resolve(res.tempFilePath);
        },
        fail: reject
      });
    }, 100);
  });
}

function generateWeeklyReport(page, canvasSelector, data) {
  return new Promise(function (resolve, reject) {
    const query = wx.createSelectorQuery();
    if (page) query.in(page);
    query
      .select(canvasSelector)
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('canvas node not found'));
          return;
        }
        drawWeeklyReport(res[0].node, data).then(resolve).catch(reject);
      });
  });
}

module.exports = {
  roundRect,
  paintWeeklyReport,
  drawWeeklyReport,
  generateWeeklyReport,
  buildWeeklyReportData,
  buildEquivalent
};
