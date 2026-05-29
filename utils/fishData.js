/** 摸鱼养鱼场 · 游戏配置（客户端与文档参考，云函数内有一份同步副本） */

const EXCHANGE_RATE = 100; // 1 元人民币 = 100 摸鱼币

const RARITY = {
  common: { label: '普通', color: '#689F38', weight: 50 },
  rare: { label: '稀有', color: '#1976D2', weight: 30 },
  epic: { label: '史诗', color: '#7B1FA2', weight: 15 },
  legendary: { label: '传说', color: '#F57C00', weight: 5 }
};

const SPECIES = {
  clownfish: {
    id: 'clownfish',
    name: '小丑鱼',
    emoji: '🐠',
    rarity: 'common',
    maxGrowth: 100,
    sellPrice: 80,
    eggPrice: 50,
    growthRate: 1.2,
    hungerRate: 1.0
  },
  goldfish: {
    id: 'goldfish',
    name: '金鱼',
    emoji: '🐟',
    rarity: 'common',
    maxGrowth: 100,
    sellPrice: 70,
    eggPrice: 40,
    growthRate: 1.0,
    hungerRate: 0.9
  },
  betta: {
    id: 'betta',
    name: '斗鱼',
    emoji: '🐡',
    rarity: 'rare',
    maxGrowth: 120,
    sellPrice: 150,
    eggPrice: 120,
    growthRate: 0.8,
    hungerRate: 1.1
  },
  angelfish: {
    id: 'angelfish',
    name: '神仙鱼',
    emoji: '🦈',
    rarity: 'rare',
    maxGrowth: 130,
    sellPrice: 180,
    eggPrice: 140,
    growthRate: 0.75,
    hungerRate: 1.0
  },
  koi: {
    id: 'koi',
    name: '锦鲤',
    emoji: '🎏',
    rarity: 'epic',
    maxGrowth: 150,
    sellPrice: 350,
    eggPrice: 280,
    growthRate: 0.6,
    hungerRate: 0.85
  },
  dragon: {
    id: 'dragon',
    name: '龙鱼',
    emoji: '🐉',
    rarity: 'legendary',
    maxGrowth: 200,
    sellPrice: 800,
    eggPrice: 600,
    growthRate: 0.5,
    hungerRate: 1.2
  }
};

const MYSTERY_EGG = {
  name: '神秘鱼卵',
  emoji: '🥚',
  price: 50
};

/** 孵化概率：小丑鱼 75%、金鱼 24%、神仙鱼 1% */
const HATCH_POOL = [
  { id: 'clownfish', weight: 75 },
  { id: 'goldfish', weight: 24 },
  { id: 'angelfish', weight: 1 }
];

const DEVICE_CONFIG = {
  tank: {
    name: '鱼缸',
    emoji: '🫧',
    maxLevel: 5,
    baseCost: 200,
    costMultiplier: 1.6,
    capacityPerLevel: 1,
    baseCapacity: 3
  },
  oxygenPump: {
    name: '氧气泵',
    emoji: '💨',
    maxLevel: 5,
    baseCost: 150,
    costMultiplier: 1.5,
    efficiencyBase: 0.8,
    efficiencyPerLevel: 0.05
  },
  feeder: {
    name: '喂食器',
    emoji: '🍽️',
    maxLevel: 5,
    baseCost: 180,
    costMultiplier: 1.5,
    autoFeedAtLevel: 3
  },
  light: {
    name: '水草灯',
    emoji: '💡',
    maxLevel: 5,
    baseCost: 120,
    costMultiplier: 1.4,
    brightnessBase: 80,
    brightnessPerLevel: 5,
    growthBonusPerLevel: 0.05
  }
};

const FEED_PACK = {
  amount: 5,
  price: 20,
  hungerRestore: 30,
  growthBonus: 2
};

const DEFAULT_FISH_TANK = {
  level: 1,
  capacity: 3,
  oxygenPump: { level: 1, efficiency: 0.8 },
  feeder: { level: 1, autoFeed: false },
  light: { level: 1, brightness: 80 }
};

const DEFAULT_INVENTORY = {
  fishEggs: [],
  feed: 10
};

const DEFAULT_CHEAT_MARKER = {
  suspiciousCount: 0,
  lastViolationTime: null,
  freezeEndTime: null,
  recentRecords: []
};

function getDefaultFishFarmFields() {
  return {
    fishCoins: 0,
    totalExchangedRMB: 0,
    fishTank: JSON.parse(JSON.stringify(DEFAULT_FISH_TANK)),
    fishes: [],
    inventory: JSON.parse(JSON.stringify(DEFAULT_INVENTORY)),
    cheatMarker: JSON.parse(JSON.stringify(DEFAULT_CHEAT_MARKER)),
    pendingHatch: null
  };
}

/** 清空数据用：饲料、鱼卵、设备等全部归零 */
function getEmptyFishFarmFields() {
  return {
    fishCoins: 0,
    totalExchangedRMB: 0,
    fishTank: JSON.parse(JSON.stringify(DEFAULT_FISH_TANK)),
    fishes: [],
    inventory: { fishEggs: [], feed: 0 },
    cheatMarker: JSON.parse(JSON.stringify(DEFAULT_CHEAT_MARKER)),
    pendingHatch: null
  };
}

function getSpecies(id) {
  return SPECIES[id] || SPECIES.clownfish;
}

function getUpgradeCost(deviceKey, currentLevel) {
  const cfg = DEVICE_CONFIG[deviceKey];
  if (!cfg || currentLevel >= cfg.maxLevel) return null;
  return Math.round(cfg.baseCost * Math.pow(cfg.costMultiplier, currentLevel - 1));
}

function pickHatchSpecies() {
  const total = HATCH_POOL.reduce(function (sum, p) {
    return sum + p.weight;
  }, 0);
  let r = Math.random() * total;
  for (let i = 0; i < HATCH_POOL.length; i++) {
    r -= HATCH_POOL[i].weight;
    if (r <= 0) return HATCH_POOL[i].id;
  }
  return HATCH_POOL[0].id;
}

function getHatchOddsDisplay() {
  return HATCH_POOL.map(function (p) {
    const sp = SPECIES[p.id];
    return {
      id: p.id,
      name: sp.name,
      emoji: sp.emoji,
      percent: p.weight + '%'
    };
  });
}

module.exports = {
  EXCHANGE_RATE,
  RARITY,
  SPECIES,
  MYSTERY_EGG,
  HATCH_POOL,
  DEVICE_CONFIG,
  FEED_PACK,
  DEFAULT_FISH_TANK,
  DEFAULT_INVENTORY,
  DEFAULT_CHEAT_MARKER,
  getDefaultFishFarmFields,
  getEmptyFishFarmFields,
  getSpecies,
  getUpgradeCost,
  pickHatchSpecies,
  getHatchOddsDisplay
};
