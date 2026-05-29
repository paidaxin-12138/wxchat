const rankUtil = require('./rank.js');
const util = require('./util.js');
const leaderboardUtil = require('./leaderboard.js');
const icons = require('./icons.js');

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function calcBeatPercent(monthTotal, recordCount) {
  const money = parseFloat(monthTotal) || 0;
  if (money <= 0 || recordCount <= 0) return 0;
  const pct = Math.round(Math.log10(money + 1) * 22 + money * 0.12);
  return Math.min(99, Math.max(5, pct));
}

function drawCard(ctx, x, y, w, h) {
  ctx.fillStyle = '#fff';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
}

function drawPoster(ctx, canvas, data) {
  const w = 375;
  const h = 640;
  canvas.width = w * 2;
  canvas.height = h * 2;
  ctx.scale(2, 2);

  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#E8F5E9');
  grd.addColorStop(1, '#66BB6A');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  const pad = 20;
  const cardW = w - pad * 2;
  let y = 36;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1B5E20';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('摸鱼经济学 · ' + data.monthLabel, w / 2, y);
  y += 28;

  drawCard(ctx, pad, y, cardW, 100);
  ctx.fillStyle = '#2E7D32';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('¥' + data.monthTotal, w / 2, y + 58);
  ctx.fillStyle = '#689F38';
  ctx.font = '14px sans-serif';
  ctx.fillText('🏆 ' + data.rankTitle, w / 2, y + 86);
  y += 116;

  drawCard(ctx, pad, y, cardW, 200);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#666';
  ctx.font = '13px sans-serif';
  ctx.fillText('摸鱼总次数：' + data.totalCount + ' 次', pad + 20, y + 36);
  const statRows = [
    ['toilet', '上厕所：' + data.toiletCount + ' 次'],
    ['water', '喝水：' + data.waterLiters + ' 升'],
    ['charge', '充电：' + data.chargeHours + ' 小时'],
    ['chat', '聊天：' + data.chatCount + ' 次']
  ];
  statRows.forEach(function (row, i) {
    const iy = y + 68 + i * 32;
    icons.drawCanvasIcon(ctx, pad + 28, iy - 5, row[0], 14, '#2E7D32');
    ctx.fillText(row[1], pad + 44, iy);
  });
  y += 220;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#2E7D32';
  ctx.font = 'bold 13px sans-serif';
  if (data.beatPercent > 0) {
    ctx.fillText('本月摸鱼超过 ' + data.beatPercent + '% 的打工人', w / 2, y);
  } else {
    ctx.fillText('本月还没摸鱼记录，快去主页打卡吧', w / 2, y);
  }
  y += 28;

  if (data.weeklyHonor) {
    ctx.fillStyle = '#C62828';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(data.weeklyHonor, w / 2, y);
    y += 24;
  }

  y += 12;

  ctx.strokeStyle = '#ddd';
  roundRect(ctx, w / 2 - 40, y, 80, 80, 8);
  ctx.stroke();
  ctx.fillStyle = '#999';
  ctx.font = '11px sans-serif';
  ctx.fillText('小程序码', w / 2, y + 48);
  y += 100;

  ctx.fillStyle = '#1B5E20';
  ctx.font = '12px sans-serif';
  ctx.fillText('摸鱼经济学 — 算算你带薪赚了多少', w / 2, y);
}

function generatePoster(canvas, data) {
  return new Promise(function (resolve, reject) {
    const ctx = canvas.getContext('2d');
    drawPoster(ctx, canvas, data);
    wx.canvasToTempFilePath({
      canvas: canvas,
      success: function (res) {
        resolve(res.tempFilePath);
      },
      fail: reject
    });
  });
}

function buildPosterData(records, yearMonth, user) {
  const monthRecords = util.getRecordsForMonth(records, yearMonth);
  const stats = rankUtil.aggregateStats(monthRecords);
  const monthTotal = util.getTotalForMonth(records, yearMonth);
  const rank = rankUtil.getRankByMoney(user.totalMoneyAllTime || stats.totalMoney);
  const parts = yearMonth.split('-');
  return {
    monthLabel: parts[0] + '年' + parseInt(parts[1], 10) + '月',
    monthTotal: monthTotal.toFixed(2),
    rankTitle: rank.title,
    totalCount: monthRecords.length,
    toiletCount: stats.toiletCount,
    waterLiters: stats.waterLiters.toFixed(1),
    chargeHours: stats.chargeHours.toFixed(1),
    chatCount: stats.chatCount,
    beatPercent: calcBeatPercent(monthTotal, monthRecords.length),
    weeklyHonor:
      user.weeklyBadge && user.lastWeekRank > 0
        ? '本周荣誉：' + user.weeklyBadge
        : ''
  };
}

module.exports = { generatePoster, buildPosterData, calcBeatPercent };
