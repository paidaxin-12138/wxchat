const icons = require('./icons.js');

const PIE_ICON_TYPE = {
  '上厕所': 'toilet',
  '喝水': 'water',
  '充电': 'charge',
  '聊天': 'chat'
};

function draw(ctx, option, width, height) {
  if (!ctx || !option) return;
  ctx.clearRect(0, 0, width, height);
  if (option.type === 'line') drawLine(ctx, option, width, height);
  else if (option.type === 'pie') drawPie(ctx, option, width, height);
  else if (option.type === 'bar') drawBar(ctx, option, width, height);
}

function drawLine(ctx, option, w, h) {
  const padL = 36;
  const padR = 12;
  const padT = 20;
  const padB = 32;
  const values = option.values || [];
  const labels = option.labels || [];
  const max = Math.max.apply(null, values.concat([1]));
  const cw = w - padL - padR;
  const ch = h - padT - padB;

  ctx.strokeStyle = '#E0E0E0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + ch);
  ctx.lineTo(padL + cw, padT + ch);
  ctx.stroke();

  if (values.length < 2) return;
  const step = cw / (values.length - 1);
  ctx.strokeStyle = '#66BB6A';
  ctx.lineWidth = 3;
  ctx.beginPath();
  values.forEach(function (v, i) {
    const x = padL + step * i;
    const y = padT + ch - (v / max) * ch;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  values.forEach(function (v, i) {
    const x = padL + step * i;
    const y = padT + ch - (v / max) * ch;
    ctx.fillStyle = '#66BB6A';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#999';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  labels.forEach(function (lb, i) {
    ctx.fillText(lb, padL + step * i, h - 8);
  });
}

function drawPie(ctx, option, w, h) {
  const items = (option.items || []).filter(function (it) {
    return it.value > 0;
  });
  const cx = w / 2;
  const cy = h / 2 - 10;
  const r = Math.min(w, h) * 0.28;
  const total = items.reduce(function (s, it) {
    return s + it.value;
  }, 0);
  if (total <= 0) {
    ctx.fillStyle = '#999';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', cx, cy);
    return;
  }
  let start = -Math.PI / 2;
  items.forEach(function (it) {
    const angle = (it.value / total) * Math.PI * 2;
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });
  ctx.font = '10px sans-serif';
  items.forEach(function (it, i) {
    const ly = 17 + i * 18;
    const iconType = PIE_ICON_TYPE[it.name];
    if (iconType) {
      icons.drawCanvasIcon(ctx, 18, ly - 2, iconType, 10, it.color);
    } else {
      ctx.fillStyle = it.color;
      ctx.fillRect(12, ly - 8, 10, 10);
    }
    ctx.fillStyle = '#666';
    ctx.textAlign = 'left';
    ctx.fillText(it.name + ' ¥' + it.value.toFixed(2), 28, ly);
  });
}

function drawBar(ctx, option, w, h) {
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 32;
  const values = option.values || [];
  const labels = option.labels || [];
  const max = Math.max.apply(null, values.concat([1]));
  const cw = w - padL - padR;
  const ch = h - padT - padB;
  const barW = cw / values.length * 0.5;

  values.forEach(function (v, i) {
    const x = padL + (cw / values.length) * i + (cw / values.length - barW) / 2;
    const bh = (v / max) * ch;
    const y = padT + ch - bh;
    const grd = ctx.createLinearGradient(x, y, x, padT + ch);
    grd.addColorStop(0, '#A5D6A7');
    grd.addColorStop(1, '#2E7D32');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, barW, bh);
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i] || '', x + barW / 2, h - 8);
  });
}

module.exports = { draw };
