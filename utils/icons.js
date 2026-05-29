const ICON_EMOJI = {
  toilet: '🚽',
  water: '💧',
  charge: '🔋',
  chat: '💬',
  gossip: '💬',
  default: '🐟'
};

const ICON_SRC = {
  toilet: '/images/icons/toilet.png',
  water: '/images/icons/water.png',
  charge: '/images/icons/charge.png',
  chat: '/images/icons/chat.png',
  gossip: '/images/icons/chat.png',
  default: '/images/icons/default.png'
};

const ICON_CLASS = {
  toilet: 'icon-toilet',
  water: 'icon-water',
  charge: 'icon-charge',
  chat: 'icon-chat',
  gossip: 'icon-chat',
  default: 'icon-default'
};

const ICON_UNICODE = {
  toilet: '\uf101',
  water: '\uec06',
  charge: '\ueaaa',
  chat: '\ueb51',
  gossip: '\ueb51',
  default: '\uecf1'
};

const ICON_LABEL = {
  toilet: '上厕所',
  water: '喝水',
  charge: '充电',
  chat: '聊天',
  gossip: '聊天八卦'
};

function normalizeType(type) {
  return type === 'gossip' ? 'chat' : type;
}

function getIconClass(type) {
  const t = normalizeType(type);
  return ICON_CLASS[t] || ICON_CLASS.default;
}

function getIconUnicode(type) {
  const t = normalizeType(type);
  return ICON_UNICODE[t] || ICON_UNICODE.default;
}

function getIconLabel(type) {
  const t = normalizeType(type);
  return ICON_LABEL[t] || '摸鱼';
}

function getIconSrc(type) {
  const t = normalizeType(type);
  return ICON_SRC[t] || ICON_SRC.default;
}

function isMoyuFont(type) {
  return normalizeType(type) === 'toilet';
}

function getIconFontFamily(type) {
  return isMoyuFont(type) ? 'moyuicon' : 'remixicon';
}

function getHomeActionIcons() {
  return {
    toilet: ICON_UNICODE.toilet,
    water: ICON_UNICODE.water,
    charge: ICON_UNICODE.charge,
    chat: ICON_UNICODE.chat
  };
}

function drawCanvasIcon(ctx, x, y, type, sizePx) {
  const t = normalizeType(type);
  ctx.save();
  ctx.font = Math.round((sizePx || 14) * 1.15) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ICON_EMOJI[t] || ICON_EMOJI.default, x, y);
  ctx.restore();
}

module.exports = {
  ICON_CLASS,
  ICON_SRC,
  ICON_UNICODE,
  getIconClass,
  getIconUnicode,
  getIconSrc,
  getIconLabel,
  isMoyuFont,
  getIconFontFamily,
  getHomeActionIcons,
  drawCanvasIcon
};
