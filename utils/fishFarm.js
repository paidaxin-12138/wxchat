const fishData = require('./fishData.js');
const cloud = require('./cloud.js');

function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

function persistUser(user) {
  return cloud.updateUser({
    fishCoins: user.fishCoins,
    fishes: user.fishes,
    fishTank: user.fishTank,
    inventory: user.inventory,
    pendingHatch: user.pendingHatch || null,
    totalExchangedRMB: user.totalExchangedRMB,
    totalMoneyAllTime: user.totalMoneyAllTime,
    lastFishFarmVisit: user.lastFishFarmVisit
  });
}

function mergePendingHatch(localPending, remotePending) {
  if (!localPending && !remotePending) return null;
  if (localPending && !remotePending) return localPending;
  if (!localPending && remotePending) return remotePending;
  return (localPending.revealedAt || 0) >= (remotePending.revealedAt || 0)
    ? localPending
    : remotePending;
}

function formatPendingHatch(pending) {
  if (!pending || !pending.species) return null;
  const sp = fishData.getSpecies(pending.species);
  return {
    species: pending.species,
    name: sp.name,
    emoji: sp.emoji,
    rarity: sp.rarity,
    rarityLabel: fishData.RARITY[sp.rarity].label,
    rarityColor: fishData.RARITY[sp.rarity].color,
    isAngelfish: pending.species === 'angelfish'
  };
}

function mergeEggList(localList, remoteList) {
  const byId = {};
  (remoteList || []).forEach(function (e, i) {
    const key = (e && e.eggId) || 'remote_' + i + '_' + (e && e.purchasedTime);
    byId[key] = e;
  });
  (localList || []).forEach(function (e, i) {
    const key = (e && e.eggId) || 'local_' + i + '_' + (e && e.purchasedTime);
    byId[key] = e;
  });
  return Object.keys(byId).map(function (k) {
    return byId[k];
  });
}

function mergeFishList(localList, remoteList) {
  localList = localList || [];
  remoteList = remoteList || [];
  if (!localList.length) return remoteList;
  if (!remoteList.length) return localList;

  const localIds = {};
  localList.forEach(function (f) {
    if (f && f.id) localIds[f.id] = true;
  });
  const remoteSubsetOfLocal =
    remoteList.length < localList.length &&
    remoteList.every(function (f) {
      return f && f.id && localIds[f.id];
    });
  if (remoteSubsetOfLocal) {
    return remoteList;
  }

  const byId = {};
  remoteList.forEach(function (f) {
    if (f && f.id) byId[f.id] = f;
  });
  localList.forEach(function (f) {
    if (f && f.id) byId[f.id] = f;
  });
  return Object.keys(byId).map(function (k) {
    return byId[k];
  });
}

function mergeInventory(localInv, remoteInv, remotePending) {
  localInv = localInv || {};
  remoteInv = remoteInv || {};
  const localEggs = localInv.fishEggs || [];
  const remoteEggs = remoteInv.fishEggs || [];
  let fishEggs;
  if (remotePending && remotePending.species) {
    // 云端已孵化待处理：以云端鱼卵为准，避免合并把已消耗的鱼卵又加回来
    fishEggs = remoteEggs;
  } else if (localEggs.length > remoteEggs.length && remoteEggs.length === 0) {
    // 本地刚买、云端尚未同步
    fishEggs = localEggs;
  } else if (remoteEggs.length > 0 && remoteEggs.length <= localEggs.length) {
    const localIds = {};
    localEggs.forEach(function (e) {
      if (e && e.eggId) localIds[e.eggId] = true;
    });
    const remoteSubsetOfLocal =
      remoteEggs.length < localEggs.length &&
      remoteEggs.every(function (e) {
        return e && e.eggId && localIds[e.eggId];
      });
    fishEggs = remoteSubsetOfLocal ? remoteEggs : mergeEggList(localEggs, remoteEggs);
  } else {
    fishEggs = mergeEggList(localEggs, remoteEggs);
  }
  return {
    fishEggs: fishEggs,
    feed: Math.max(localInv.feed || 0, remoteInv.feed || 0)
  };
}

function isClearedFarmState(remote) {
  const inv = remote.inventory || {};
  return (
    (remote.fishCoins || 0) === 0 &&
    ((remote.fishes || []).length === 0) &&
    ((inv.fishEggs || []).length === 0) &&
    (inv.feed || 0) === 0 &&
    !remote.pendingHatch
  );
}

/** 合并云端养鱼场状态到本地，避免云端空数据覆盖本地刚买的鱼卵 */
function mergeRemoteFarmIntoLocal(localUser, remote) {
  if (!remote || !remote.ok) return ensureFishFarmFields(localUser);
  const local = ensureFishFarmFields(localUser);
  if (isClearedFarmState(remote)) {
    return Object.assign({}, local, {
      fishCoins: 0,
      totalExchangedRMB: remote.totalExchangedRMB != null ? remote.totalExchangedRMB : local.totalExchangedRMB,
      fishTank: remote.fishTank || fishData.DEFAULT_FISH_TANK,
      fishes: [],
      inventory: { fishEggs: [], feed: 0 },
      pendingHatch: null
    });
  }
  const localEggCount = (local.inventory.fishEggs || []).length;
  const remoteEggCount = ((remote.inventory && remote.inventory.fishEggs) || []).length;
  const inventory = mergeInventory(local.inventory, remote.inventory, remote.pendingHatch);
  let fishCoins = remote.fishCoins != null ? remote.fishCoins : local.fishCoins;
  if (localEggCount > remoteEggCount) {
    fishCoins = local.fishCoins;
  }
  return Object.assign({}, local, {
    fishCoins: fishCoins,
    totalMoneyAllTime:
      remote.totalMoneyAllTime != null ? remote.totalMoneyAllTime : local.totalMoneyAllTime,
    fishTank: remote.fishTank || local.fishTank,
    fishes: mergeFishList(local.fishes, remote.fishes),
    inventory: inventory,
    pendingHatch: mergePendingHatch(local.pendingHatch, remote.pendingHatch)
  });
}

function pullFarmStateToLocal() {
  // 云端养鱼场写操作后拉回并合并到本地（失败不阻断主流程）
  return cloud
    .callCloud('fishFarm', { action: 'getState' })
    .then(function (state) {
      if (!state || !state.ok) return;
      const merged = mergeRemoteFarmIntoLocal(cloud.getLocalUser(), state);
      return cloud.updateUser({
        fishCoins: merged.fishCoins,
        fishTank: merged.fishTank,
        fishes: merged.fishes,
        inventory: merged.inventory,
        pendingHatch: merged.pendingHatch || null,
        totalMoneyAllTime: merged.totalMoneyAllTime
      });
    })
    .catch(function (err) {
      if (cloud.isCloudFunctionNotFound(err)) return;
      console.warn('[fishFarm] pullFarmState failed', err);
    });
}

function shouldTryLocalFallback(action, cloudRes, localUser, data) {
  if (!cloudRes || cloudRes.ok) return false;
  const msg = cloudRes.message || '';
  data = data || {};
  if (msg === '未知操作') return true;
  const eggs = ((localUser.inventory && localUser.inventory.fishEggs) || []).length;
  const pending = localUser.pendingHatch;
  if (action === 'hatchReveal' || action === 'hatchEgg') {
    if (msg === '没有鱼卵' && eggs > 0) return true;
    if (pending && pending.species) return true;
  }
  if (action === 'hatchKeep' || action === 'hatchDiscard') {
    if (msg.indexOf('没有待处理') >= 0 && pending && pending.species) return true;
  }
  if (action === 'buyEgg' && msg === '摸鱼币不足') {
    return (localUser.fishCoins || 0) >= fishData.MYSTERY_EGG.price;
  }
  if (action === 'discardFish' || action === 'sellFish') {
    if (msg === '鱼不存在' && data && data.fishId) {
      return (localUser.fishes || []).some(function (f) {
        return f.id === data.fishId;
      });
    }
  }
  return false;
}

function filterFishById(fishes, fishId) {
  if (!fishId) return fishes || [];
  return (fishes || []).filter(function (f) {
    return f.id !== fishId;
  });
}

function applyWriteResultToLocal(action, res, data) {
  const user = ensureFishFarmFields(cloud.getLocalUser());
  const patch = {};
  data = data || {};

  if (action === 'hatchReveal' || action === 'hatchEgg') {
    const eggs = (user.inventory.fishEggs || []).slice();
    if (eggs.length && !(user.pendingHatch && user.pendingHatch.species)) {
      eggs.shift();
    }
    patch.inventory = Object.assign({}, user.inventory, { fishEggs: eggs });
    patch.pendingHatch = res.pendingHatch || user.pendingHatch || null;
  } else if (action === 'hatchKeep') {
    patch.pendingHatch = null;
    if (res.fish) {
      patch.fishes = (user.fishes || []).concat([res.fish]);
    }
  } else if (action === 'hatchDiscard') {
    patch.pendingHatch = null;
  } else if (action === 'discardFish' || action === 'sellFish') {
    const fishId = data.fishId || res.fishId;
    if (fishId) {
      patch.fishes = filterFishById(user.fishes, fishId);
    }
    if (action === 'sellFish' && res.fishCoins != null) {
      patch.fishCoins = res.fishCoins;
    }
  }

  if (!Object.keys(patch).length) return Promise.resolve();
  return cloud.updateUser(patch);
}

const WRITE_ACTIONS = {
  exchange: 1,
  buyEgg: 1,
  buyFeed: 1,
  hatchReveal: 1,
  hatchKeep: 1,
  hatchDiscard: 1,
  hatchEgg: 1,
  feedFish: 1,
  feedAll: 1,
  sellFish: 1,
  discardFish: 1,
  upgradeDevice: 1
};

function runLocalFishAction(action, data) {
  const user = ensureFishFarmFields(cloud.getLocalUser());
  data = data || {};

  if (action === 'getState') {
    const availableRMB = cloud.getAvailableRMB(user);
    return Promise.resolve({
      ok: true,
      fishCoins: user.fishCoins || 0,
      totalMoneyAllTime: availableRMB,
      availableRMB: availableRMB,
      fishTank: user.fishTank,
      fishes: user.fishes || [],
      inventory: user.inventory || { fishEggs: [], feed: 0 },
      pendingHatch: user.pendingHatch || null,
      eggCount: ((user.inventory && user.inventory.fishEggs) || []).length
    });
  }

  if (action === 'exchange') {
    const amountRMB = parseFloat(data.amountRMB);
    if (isNaN(amountRMB) || amountRMB <= 0) {
      return Promise.resolve({ ok: false, message: '请输入有效金额' });
    }
    const balance = cloud.getAvailableRMB(user);
    if (amountRMB > balance + 0.001) {
      return Promise.resolve({
        ok: false,
        message: '人民币余额不足（可兑换 ¥' + balance.toFixed(2) + '）'
      });
    }
    const fishCoinsGained = Math.floor(amountRMB * fishData.EXCHANGE_RATE);
    user.totalMoneyAllTime = Math.round((balance - amountRMB) * 100) / 100;
    user.fishCoins = (user.fishCoins || 0) + fishCoinsGained;
    user.totalExchangedRMB =
      Math.round(((parseFloat(user.totalExchangedRMB) || 0) + amountRMB) * 100) / 100;
    return persistUser(user).then(function () {
      return {
        ok: true,
        amountRMB: amountRMB,
        fishCoinsGained: fishCoinsGained,
        totalMoneyAllTime: user.totalMoneyAllTime,
        fishCoins: user.fishCoins,
        totalExchangedRMB: user.totalExchangedRMB,
        exchangeRate: fishData.EXCHANGE_RATE
      };
    });
  }

  if (action === 'buyEgg') {
    const price = fishData.MYSTERY_EGG.price;
    if ((user.fishCoins || 0) < price) {
      return Promise.resolve({ ok: false, message: '摸鱼币不足' });
    }
    user.fishCoins -= price;
    user.inventory.fishEggs = user.inventory.fishEggs || [];
    user.inventory.fishEggs.push({
      eggId: genId('egg'),
      purchasedTime: Date.now()
    });
    return persistUser(user).then(function () {
      const eggCount = (user.inventory.fishEggs || []).length;
      return {
        ok: true,
        message: '获得神秘鱼卵 x1',
        fishCoins: user.fishCoins,
        eggCount: eggCount
      };
    });
  }

  if (action === 'buyFeed') {
    const pack = fishData.FEED_PACK;
    if ((user.fishCoins || 0) < pack.price) {
      return Promise.resolve({ ok: false, message: '摸鱼币不足' });
    }
    user.fishCoins -= pack.price;
    user.inventory.feed = (user.inventory.feed || 0) + pack.amount;
    return persistUser(user).then(function () {
      return {
        ok: true,
        message: '购买饲料 x' + pack.amount,
        feed: user.inventory.feed,
        fishCoins: user.fishCoins
      };
    });
  }

  if (action === 'hatchReveal' || action === 'hatchEgg') {
    if (user.pendingHatch && user.pendingHatch.species) {
      return Promise.resolve(buildHatchRevealResult(user.pendingHatch, user));
    }
    const eggs = user.inventory.fishEggs || [];
    if (!eggs.length) return Promise.resolve({ ok: false, message: '没有鱼卵' });
    eggs.shift();
    const speciesId = fishData.pickHatchSpecies();
    const sp = fishData.getSpecies(speciesId);
    user.pendingHatch = {
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
    user.inventory.fishEggs = eggs;
    return persistUser(user).then(function () {
      return buildHatchRevealResult(user.pendingHatch, user);
    });
  }

  if (action === 'hatchKeep') {
    const pending = user.pendingHatch;
    if (!pending || !pending.species) {
      return Promise.resolve({ ok: false, message: '没有待处理的孵化结果' });
    }
    const cap = getCapacity(user.fishTank);
    if ((user.fishes || []).length >= cap) {
      return Promise.resolve({ ok: false, message: '鱼缸已满，请先卖出或升级后再培养' });
    }
    user.fishes = user.fishes || [];
    user.fishes.push(pending);
    user.pendingHatch = null;
    const sp = fishData.getSpecies(pending.species);
    return persistUser(user).then(function () {
      return { ok: true, message: '开始培养 ' + sp.name, fish: pending };
    });
  }

  if (action === 'hatchDiscard') {
    if (!user.pendingHatch || !user.pendingHatch.species) {
      return Promise.resolve({ ok: false, message: '没有待处理的孵化结果' });
    }
    user.pendingHatch = null;
    return persistUser(user).then(function () {
      return { ok: true, message: '已丢弃' };
    });
  }

  if (action === 'feedFish' || action === 'feedAll') {
    const fishId = action === 'feedAll' ? null : data.fishId;
    let feed = user.inventory.feed || 0;
    if (feed <= 0) return Promise.resolve({ ok: false, message: '饲料不足' });
    const before = feed;
    user.fishes = (user.fishes || []).map(function (f) {
      if (fishId && f.id !== fishId) return f;
      if (!fishId && f.hunger >= 80) return f;
      if (feed <= 0) return f;
      const sp = fishData.getSpecies(f.species);
      feed -= 1;
      return Object.assign({}, f, {
        hunger: Math.min(100, (f.hunger || 0) + 30),
        growth: Math.min(sp.maxGrowth, (f.growth || 0) + 2),
        health: Math.min(100, (f.health || 0) + 5),
        lastFeedTime: Date.now()
      });
    });
    if (feed === before) {
      return Promise.resolve({ ok: false, message: '没有需要喂食的鱼' });
    }
    user.inventory.feed = feed;
    return persistUser(user).then(function () {
      return { ok: true, message: '喂食成功', feed: feed };
    });
  }

  if (action === 'sellFish') {
    const fishId = data.fishId;
    const fishes = user.fishes || [];
    const idx = fishes.findIndex(function (f) {
      return f.id === fishId;
    });
    if (idx < 0) return Promise.resolve({ ok: false, message: '鱼不存在' });
    const fish = fishes[idx];
    const sp = fishData.getSpecies(fish.species);
    if ((fish.growth || 0) < sp.maxGrowth) {
      return Promise.resolve({ ok: false, message: '鱼未长大，无法卖出' });
    }
    fishes.splice(idx, 1);
    const gained = fish.sellPrice || sp.sellPrice;
    user.fishCoins = (user.fishCoins || 0) + gained;
    user.fishes = fishes;
    return persistUser(user).then(function () {
      return {
        ok: true,
        message: '卖出 +' + gained + ' 摸鱼币',
        fishCoins: user.fishCoins,
        fishId: fishId
      };
    });
  }

  if (action === 'discardFish') {
    const fishId = data.fishId;
    const fishes = user.fishes || [];
    const idx = fishes.findIndex(function (f) {
      return f.id === fishId;
    });
    if (idx < 0) return Promise.resolve({ ok: false, message: '鱼不存在' });
    const fish = fishes[idx];
    const sp = fishData.getSpecies(fish.species);
    fishes.splice(idx, 1);
    user.fishes = fishes;
    return persistUser(user).then(function () {
      return {
        ok: true,
        message: '趁摸鱼之神没看见，' + sp.name + '已悄悄游走',
        fishName: sp.name,
        fishId: fishId
      };
    });
  }

  if (action === 'upgradeDevice') {
    const key = data.deviceKey;
    const cfg = fishData.DEVICE_CONFIG[key];
    if (!cfg) return Promise.resolve({ ok: false, message: '设备不存在' });
    const tank = JSON.parse(JSON.stringify(user.fishTank || fishData.DEFAULT_FISH_TANK));
    let level;
    if (key === 'tank') level = tank.level || 1;
    else level = (tank[key] && tank[key].level) || 1;
    const cost = fishData.getUpgradeCost(key, level);
    if (cost == null) return Promise.resolve({ ok: false, message: '已满级' });
    if ((user.fishCoins || 0) < cost) {
      return Promise.resolve({ ok: false, message: '摸鱼币不足' });
    }
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
    user.fishCoins -= cost;
    user.fishTank = tank;
    return persistUser(user).then(function () {
      return { ok: true, message: '升级成功 Lv.' + newLevel, fishTank: tank };
    });
  }

  return Promise.resolve({ ok: false, message: '未知操作' });
}

function callFish(action, data) {
  const localUser = ensureFishFarmFields(cloud.getLocalUser());
  return cloud
    .callCloud('fishFarm', Object.assign({ action: action }, data || {}))
    .then(function (res) {
      if (res && !res.ok && shouldTryLocalFallback(action, res, localUser, data)) {
        console.warn('[fishFarm] 云端失败，改用本地:', action, res.message);
        return runLocalFishAction(action, data);
      }
      if (res && res.ok && WRITE_ACTIONS[action]) {
        return applyWriteResultToLocal(action, res, data)
          .then(function () {
            return pullFarmStateToLocal();
          })
          .then(function () {
            return res;
          });
      }
      return res;
    })
    .catch(function (err) {
      if (!cloud.isCloudFunctionNotFound(err)) throw err;
      console.warn('[fishFarm] 云函数未部署，使用本地模式:', action);
      return runLocalFishAction(action, data);
    });
}

function exchangeCurrency(amountRMB) {
  return callFish('exchange', { amountRMB: amountRMB });
}

function calcOfflineProgress() {
  return cloud.callCloud('calcOfflineProgress', {}).catch(function (err) {
    if (!cloud.isCloudFunctionNotFound(err)) throw err;
    return { ok: false };
  });
}

function ensureFishFarmFields(user) {
  const defaults = fishData.getDefaultFishFarmFields();
  const u = Object.assign({}, defaults, user || {});
  if (!u.fishTank) u.fishTank = defaults.fishTank;
  if (!u.inventory) u.inventory = defaults.inventory;
  if (!u.cheatMarker) u.cheatMarker = defaults.cheatMarker;
  if (!Array.isArray(u.fishes)) u.fishes = [];
  if (!Array.isArray(u.inventory.fishEggs)) u.inventory.fishEggs = [];
  if (typeof u.inventory.feed !== 'number') u.inventory.feed = defaults.inventory.feed;
  if (typeof u.fishCoins !== 'number') u.fishCoins = 0;
  if (u.pendingHatch === undefined) u.pendingHatch = null;
  return u;
}

function getCapacity(fishTank) {
  const tank = fishTank || fishData.DEFAULT_FISH_TANK;
  const cfg = fishData.DEVICE_CONFIG.tank;
  return cfg.baseCapacity + (tank.level - 1) * cfg.capacityPerLevel;
}

function buildHatchRevealResult(pendingHatch, user) {
  const cap = getCapacity(user.fishTank);
  const fishCount = (user.fishes || []).length;
  return {
    ok: true,
    pendingHatch: pendingHatch,
    species: pendingHatch.species,
    tankFull: fishCount >= cap,
    fishCount: fishCount,
    capacity: cap,
    reveal: formatPendingHatch(pendingHatch)
  };
}

function canHatch(user) {
  const u = ensureFishFarmFields(user);
  const eggs = u.inventory.fishEggs || [];
  const cap = getCapacity(u.fishTank);
  return eggs.length > 0 && u.fishes.length < cap;
}

function formatFish(fish) {
  const sp = fishData.getSpecies(fish.species);
  const maxGrowth = sp.maxGrowth || 100;
  const growthPct = Math.min(100, Math.round(((fish.growth || 0) / maxGrowth) * 100));
  const canSell = (fish.growth || 0) >= maxGrowth;
  return Object.assign({}, fish, {
    speciesName: sp.name,
    emoji: sp.emoji,
    rarity: sp.rarity,
    rarityLabel: fishData.RARITY[sp.rarity].label,
    rarityColor: fishData.RARITY[sp.rarity].color,
    maxGrowth: maxGrowth,
    growthPct: growthPct,
    canSell: canSell,
    sellPriceDisplay: fish.sellPrice || sp.sellPrice
  });
}

function mapUserFishFarm(user) {
  const u = ensureFishFarmFields(user);
  const fishes = (u.fishes || []).map(formatFish);
  const eggs = (u.inventory.fishEggs || []).map(function (egg) {
    return Object.assign({}, egg, {
      speciesName: '神秘鱼卵',
      emoji: fishData.MYSTERY_EGG.emoji,
      isMystery: true
    });
  });
  return {
    totalMoneyAllTime: u.totalMoneyAllTime || 0,
    availableRMB: cloud.getAvailableRMB(u),
    fishCoins: u.fishCoins || 0,
    fishTank: u.fishTank,
    fishes: fishes,
    fishEggs: eggs,
    feed: u.inventory.feed || 0,
    capacity: getCapacity(u.fishTank),
    fishCount: fishes.length,
    cheatFrozen: isCheatFrozen(u.cheatMarker),
    devices: buildDeviceList(u.fishTank),
    pendingHatch: u.pendingHatch,
    pendingHatchDisplay: formatPendingHatch(u.pendingHatch),
    hasPendingHatch: !!(u.pendingHatch && u.pendingHatch.species)
  };
}

function buildDeviceList(fishTank) {
  const tank = fishTank || fishData.DEFAULT_FISH_TANK;
  return [
    {
      key: 'tank',
      name: fishData.DEVICE_CONFIG.tank.name,
      emoji: fishData.DEVICE_CONFIG.tank.emoji,
      level: tank.level || 1,
      maxLevel: fishData.DEVICE_CONFIG.tank.maxLevel,
      upgradeCost: fishData.getUpgradeCost('tank', tank.level || 1),
      desc: '容量 ' + getCapacity(tank)
    },
    {
      key: 'oxygenPump',
      name: fishData.DEVICE_CONFIG.oxygenPump.name,
      emoji: fishData.DEVICE_CONFIG.oxygenPump.emoji,
      level: (tank.oxygenPump && tank.oxygenPump.level) || 1,
      maxLevel: fishData.DEVICE_CONFIG.oxygenPump.maxLevel,
      upgradeCost: fishData.getUpgradeCost('oxygenPump', (tank.oxygenPump && tank.oxygenPump.level) || 1),
      desc: '效率 ' + Math.round(((tank.oxygenPump && tank.oxygenPump.efficiency) || 0.8) * 100) + '%'
    },
    {
      key: 'feeder',
      name: fishData.DEVICE_CONFIG.feeder.name,
      emoji: fishData.DEVICE_CONFIG.feeder.emoji,
      level: (tank.feeder && tank.feeder.level) || 1,
      maxLevel: fishData.DEVICE_CONFIG.feeder.maxLevel,
      upgradeCost: fishData.getUpgradeCost('feeder', (tank.feeder && tank.feeder.level) || 1),
      desc: (tank.feeder && tank.feeder.autoFeed) ? '自动喂食' : '手动喂食'
    },
    {
      key: 'light',
      name: fishData.DEVICE_CONFIG.light.name,
      emoji: fishData.DEVICE_CONFIG.light.emoji,
      level: (tank.light && tank.light.level) || 1,
      maxLevel: fishData.DEVICE_CONFIG.light.maxLevel,
      upgradeCost: fishData.getUpgradeCost('light', (tank.light && tank.light.level) || 1),
      desc: '亮度 ' + ((tank.light && tank.light.brightness) || 80)
    }
  ];
}

function isCheatFrozen(cheatMarker) {
  if (!cheatMarker || !cheatMarker.freezeEndTime) return false;
  return cheatMarker.freezeEndTime > Date.now();
}

module.exports = {
  callFish,
  exchangeCurrency,
  calcOfflineProgress,
  mergeRemoteFarmIntoLocal,
  pullFarmStateToLocal,
  formatPendingHatch,
  buildHatchRevealResult,
  ensureFishFarmFields,
  getCapacity,
  canHatch,
  formatFish,
  mapUserFishFarm,
  buildDeviceList,
  isCheatFrozen
};
