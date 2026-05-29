const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const SPECIES = {
  clownfish: { name: '小丑鱼', rarity: 'common', maxGrowth: 100, sellPrice: 80, eggPrice: 50 },
  goldfish: { name: '金鱼', rarity: 'common', maxGrowth: 100, sellPrice: 70, eggPrice: 40 },
  betta: { name: '斗鱼', rarity: 'rare', maxGrowth: 120, sellPrice: 150, eggPrice: 120 },
  angelfish: { name: '神仙鱼', rarity: 'rare', maxGrowth: 130, sellPrice: 180, eggPrice: 140 },
  koi: { name: '锦鲤', rarity: 'epic', maxGrowth: 150, sellPrice: 350, eggPrice: 280 },
  dragon: { name: '龙鱼', rarity: 'legendary', maxGrowth: 200, sellPrice: 800, eggPrice: 600 }
};

function pickHatchSpecies() {
  const pool = [
    { id: 'clownfish', weight: 75 },
    { id: 'goldfish', weight: 24 },
    { id: 'angelfish', weight: 1 }
  ];
  const total = pool.reduce(function (s, p) { return s + p.weight; }, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i].weight;
    if (r <= 0) return pool[i].id;
  }
  return 'clownfish';
}

const MYSTERY_EGG_PRICE = 50;

const DEVICE = {
  tank: { maxLevel: 5, baseCost: 200, costMultiplier: 1.6, baseCapacity: 3, capacityPerLevel: 1 },
  oxygenPump: { maxLevel: 5, baseCost: 150, costMultiplier: 1.5, efficiencyBase: 0.8, efficiencyPerLevel: 0.05 },
  feeder: { maxLevel: 5, baseCost: 180, costMultiplier: 1.5, autoFeedAtLevel: 3 },
  light: { maxLevel: 5, baseCost: 120, costMultiplier: 1.4, brightnessBase: 80, brightnessPerLevel: 5 }
};

const FEED_PACK = { amount: 5, price: 20 };

function upgradeCost(key, level) {
  const cfg = DEVICE[key];
  if (!cfg || level >= cfg.maxLevel) return null;
  return Math.round(cfg.baseCost * Math.pow(cfg.costMultiplier, level - 1));
}

function getCapacity(tank) {
  return DEVICE.tank.baseCapacity + ((tank.level || 1) - 1) * DEVICE.tank.capacityPerLevel;
}

function pickRandomSpecies() {
  return pickHatchSpecies();
}

function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

const _ = db.command;

/** pendingHatch 曾为 null 时，点路径更新子字段会失败，需先 remove 再整体写入 */
async function updateUserData(docId, data) {
  if (data.pendingHatch && typeof data.pendingHatch === 'object') {
    await db
      .collection('users')
      .doc(docId)
      .update({ data: { pendingHatch: _.remove() } })
      .catch(function () {});
  }
  await db.collection('users').doc(docId).update({ data: data });
}

async function getUser(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get();
  return res.data && res.data[0];
}

async function getOrCreateUser(openid) {
  let user = await getUser(openid);
  if (user) return user;
  const data = {
    nickName: '摸鱼达人',
    avatarUrl: '',
    totalMoneyAllTime: 0,
    totalExchangedRMB: 0,
    fishCoins: 0,
    rankId: 1,
    badges: [],
    fishTank: {
      level: 1,
      capacity: 3,
      oxygenPump: { level: 1, efficiency: 0.8 },
      feeder: { level: 1, autoFeed: false },
      light: { level: 1, brightness: 80 }
    },
    fishes: [],
    inventory: { fishEggs: [], feed: 10 },
    cheatMarker: { suspiciousCount: 0, lastViolationTime: null, freezeEndTime: null, recentRecords: [] }
  };
  const addRes = await db.collection('users').add({ data: data });
  const doc = await db.collection('users').doc(addRes._id).get();
  return doc.data;
}

async function getAvailableRMB(openid, user) {
  const exchanged = parseFloat(user.totalExchangedRMB) || 0;
  try {
    const recordsRes = await db.collection('records').where({ _openid: openid }).get();
    let earned = 0;
    (recordsRes.data || []).forEach(function (r) {
      earned += parseFloat(r.moneyEarned) || 0;
    });
    if (earned > 0) {
      return Math.max(0, Math.round((earned - exchanged) * 100) / 100);
    }
  } catch (e) {
    console.warn('getAvailableRMB records', e);
  }
  return Math.max(0, Math.round((parseFloat(user.totalMoneyAllTime) || 0) * 100) / 100);
}

const EXCHANGE_RATE = 100;

async function exchangeCurrency(event, openid, user) {
  const amountRMB = parseFloat(event.amountRMB);
  if (isNaN(amountRMB) || amountRMB <= 0) {
    return { ok: false, message: '请输入有效金额' };
  }
  const balance = await getAvailableRMB(openid, user);
  if (amountRMB > balance + 0.001) {
    return { ok: false, message: '人民币余额不足（可兑换 ¥' + balance.toFixed(2) + '）' };
  }
  const fishCoinsGained = Math.floor(amountRMB * EXCHANGE_RATE);
  const newBalance = Math.round((balance - amountRMB) * 100) / 100;
  const newCoins = (user.fishCoins || 0) + fishCoinsGained;
  const newExchanged = Math.round(((parseFloat(user.totalExchangedRMB) || 0) + amountRMB) * 100) / 100;
  await db.collection('users').doc(user._id).update({
    data: {
      totalMoneyAllTime: newBalance,
      totalExchangedRMB: newExchanged,
      fishCoins: newCoins
    }
  });
  return {
    ok: true,
    amountRMB: amountRMB,
    fishCoinsGained: fishCoinsGained,
    totalMoneyAllTime: newBalance,
    fishCoins: newCoins,
    totalExchangedRMB: newExchanged,
    exchangeRate: EXCHANGE_RATE
  };
}

async function buyEgg(event, user) {
  const price = MYSTERY_EGG_PRICE;
  if ((user.fishCoins || 0) < price) return { ok: false, message: '摸鱼币不足' };
  const eggs = (user.inventory && user.inventory.fishEggs) || [];
  eggs.push({
    eggId: genId('egg'),
    purchasedTime: Date.now()
  });
  await db.collection('users').doc(user._id).update({
    data: {
      fishCoins: (user.fishCoins || 0) - price,
      'inventory.fishEggs': eggs
    }
  });
  return { ok: true, message: '获得神秘鱼卵 x1', fishCoins: (user.fishCoins || 0) - price, eggCount: eggs.length };
}

async function buyFeed(user) {
  const price = FEED_PACK.price;
  if ((user.fishCoins || 0) < price) return { ok: false, message: '摸鱼币不足' };
  const feed = ((user.inventory && user.inventory.feed) || 0) + FEED_PACK.amount;
  await db.collection('users').doc(user._id).update({
    data: {
      fishCoins: (user.fishCoins || 0) - price,
      'inventory.feed': feed
    }
  });
  return { ok: true, message: '购买饲料 x' + FEED_PACK.amount, feed: feed };
}

async function hatchReveal(user) {
  if (user.pendingHatch && user.pendingHatch.species) {
    return buildHatchRevealResult(user.pendingHatch, user);
  }
  const eggs = (user.inventory && user.inventory.fishEggs) || [];
  if (!eggs.length) return { ok: false, message: '没有鱼卵' };
  eggs.shift();
  const speciesId = pickHatchSpecies();
  const sp = SPECIES[speciesId] || SPECIES.clownfish;
  const pendingHatch = {
    id: genId('fish'),
    species: speciesId,
    name: sp.name,
    rarity: sp.rarity,
    growth: 0,
    health: 100,
    hunger: 100,
    hatchTime: Date.now(),
    lastFeedTime: Date.now(),
    sellPrice: sp.sellPrice,
    revealedAt: Date.now()
  };
  await updateUserData(user._id, {
    'inventory.fishEggs': eggs,
    pendingHatch: pendingHatch
  });
  return buildHatchRevealResult(pendingHatch, user);
}

function buildHatchRevealResult(pendingHatch, user) {
  const tank = user.fishTank || { level: 1 };
  const cap = getCapacity(tank);
  const fishCount = (user.fishes || []).length;
  return {
    ok: true,
    pendingHatch: pendingHatch,
    species: pendingHatch.species,
    tankFull: fishCount >= cap,
    fishCount: fishCount,
    capacity: cap
  };
}

async function hatchKeep(user) {
  const pending = user.pendingHatch;
  if (!pending || !pending.species) {
    return { ok: false, message: '没有待处理的孵化结果' };
  }
  const tank = user.fishTank || { level: 1 };
  const cap = getCapacity(tank);
  const fishes = user.fishes || [];
  if (fishes.length >= cap) {
    return { ok: false, message: '鱼缸已满，请先卖出或升级后再培养' };
  }
  fishes.push(pending);
  await db.collection('users').doc(user._id).update({
    data: {
      fishes: fishes,
      pendingHatch: null
    }
  });
  const sp = SPECIES[pending.species] || SPECIES.clownfish;
  return { ok: true, message: '开始培养 ' + sp.name, fish: pending };
}

async function hatchDiscard(user) {
  if (!user.pendingHatch || !user.pendingHatch.species) {
    return { ok: false, message: '没有待处理的孵化结果' };
  }
  await db.collection('users').doc(user._id).update({
    data: { pendingHatch: null }
  });
  return { ok: true, message: '已丢弃' };
}

async function feedFish(event, user) {
  const fishId = event.fishId;
  let feed = (user.inventory && user.inventory.feed) || 0;
  if (feed <= 0) return { ok: false, message: '饲料不足' };
  const fishes = (user.fishes || []).map(function (f) {
    if (fishId && f.id !== fishId) return f;
    if (!fishId && f.hunger >= 80) return f;
    if (!fishId && feed <= 0) return f;
    const sp = SPECIES[f.species] || SPECIES.clownfish;
    feed -= 1;
    return Object.assign({}, f, {
      hunger: Math.min(100, (f.hunger || 0) + 30),
      growth: Math.min(sp.maxGrowth, (f.growth || 0) + 2),
      health: Math.min(100, (f.health || 0) + 5),
      lastFeedTime: Date.now()
    });
  });
  if (feed === (user.inventory && user.inventory.feed)) {
    return { ok: false, message: '没有需要喂食的鱼' };
  }
  await db.collection('users').doc(user._id).update({
    data: { fishes: fishes, 'inventory.feed': feed }
  });
  return { ok: true, message: '喂食成功', feed: feed };
}

async function sellFish(event, user) {
  const fishId = event.fishId;
  const fishes = user.fishes || [];
  const idx = fishes.findIndex(function (f) { return f.id === fishId; });
  if (idx < 0) return { ok: false, message: '鱼不存在' };
  const fish = fishes[idx];
  const sp = SPECIES[fish.species] || SPECIES.clownfish;
  if ((fish.growth || 0) < sp.maxGrowth) {
    return { ok: false, message: '鱼未长大，无法卖出' };
  }
  fishes.splice(idx, 1);
  const coins = (user.fishCoins || 0) + (fish.sellPrice || sp.sellPrice);
  await db.collection('users').doc(user._id).update({
    data: { fishes: fishes, fishCoins: coins }
  });
  return { ok: true, message: '卖出 +' + (fish.sellPrice || sp.sellPrice) + ' 摸鱼币', fishCoins: coins, fishId: fishId };
}

async function discardFish(event, user) {
  const fishId = event.fishId;
  const fishes = user.fishes || [];
  const idx = fishes.findIndex(function (f) { return f.id === fishId; });
  if (idx < 0) return { ok: false, message: '鱼不存在' };
  const fish = fishes[idx];
  const sp = SPECIES[fish.species] || SPECIES.clownfish;
  fishes.splice(idx, 1);
  await db.collection('users').doc(user._id).update({
    data: { fishes: fishes }
  });
  return {
    ok: true,
    message: '趁摸鱼之神没看见，' + sp.name + '已悄悄游走',
    fishName: sp.name,
    fishId: fishId
  };
}

async function upgradeDevice(event, user) {
  const key = event.deviceKey;
  const cfg = DEVICE[key];
  if (!cfg) return { ok: false, message: '设备不存在' };
  const tank = user.fishTank || {
    level: 1,
    oxygenPump: { level: 1, efficiency: 0.8 },
    feeder: { level: 1, autoFeed: false },
    light: { level: 1, brightness: 80 }
  };
  let level;
  if (key === 'tank') level = tank.level || 1;
  else level = (tank[key] && tank[key].level) || 1;
  const cost = upgradeCost(key, level);
  if (cost == null) return { ok: false, message: '已满级' };
  if ((user.fishCoins || 0) < cost) return { ok: false, message: '摸鱼币不足' };
  const newLevel = level + 1;
  if (key === 'tank') {
    tank.level = newLevel;
  } else if (key === 'oxygenPump') {
    tank.oxygenPump = {
      level: newLevel,
      efficiency: cfg.efficiencyBase + (newLevel - 1) * cfg.efficiencyPerLevel
    };
  } else if (key === 'feeder') {
    tank.feeder = {
      level: newLevel,
      autoFeed: newLevel >= cfg.autoFeedAtLevel
    };
  } else if (key === 'light') {
    tank.light = {
      level: newLevel,
      brightness: cfg.brightnessBase + (newLevel - 1) * cfg.brightnessPerLevel
    };
  }
  await db.collection('users').doc(user._id).update({
    data: {
      fishCoins: (user.fishCoins || 0) - cost,
      fishTank: tank
    }
  });
  return { ok: true, message: '升级成功 Lv.' + newLevel, fishTank: tank };
}

exports.main = async function (event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action;

  if (action === 'exchange') {
    const user = await getOrCreateUser(openid);
    return exchangeCurrency(event, openid, user);
  }

  const user = await getOrCreateUser(openid);
  if (!user) return { ok: false, message: '用户不存在' };

  if (action === 'buyEgg') return buyEgg(event, user);
  if (action === 'buyFeed') return buyFeed(user);
  if (action === 'hatchReveal') return hatchReveal(user);
  if (action === 'hatchKeep') return hatchKeep(user);
  if (action === 'hatchDiscard') return hatchDiscard(user);
  if (action === 'hatchEgg') return hatchReveal(user);
  if (action === 'feedFish') return feedFish(event, user);
  if (action === 'feedAll') return feedFish({ fishId: null }, user);
  if (action === 'sellFish') return sellFish(event, user);
  if (action === 'discardFish') return discardFish(event, user);
  if (action === 'upgradeDevice') return upgradeDevice(event, user);
  if (action === 'getState') {
    const availableRMB = await getAvailableRMB(openid, user);
    return {
      ok: true,
      fishCoins: user.fishCoins || 0,
      totalMoneyAllTime: availableRMB,
      availableRMB: availableRMB,
      fishTank: user.fishTank,
      fishes: user.fishes || [],
      inventory: user.inventory || { fishEggs: [], feed: 0 },
      pendingHatch: user.pendingHatch || null,
      eggCount: ((user.inventory && user.inventory.fishEggs) || []).length
    };
  }
  return { ok: false, message: '未知操作' };
};
