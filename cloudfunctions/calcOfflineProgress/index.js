const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const SPECIES = {
  clownfish: { name: '小丑鱼', maxGrowth: 100, sellPrice: 80, growthRate: 1.2, hungerRate: 1.0 },
  goldfish: { name: '金鱼', maxGrowth: 100, sellPrice: 70, growthRate: 1.0, hungerRate: 0.9 },
  betta: { name: '斗鱼', maxGrowth: 120, sellPrice: 150, growthRate: 0.8, hungerRate: 1.1 },
  angelfish: { name: '神仙鱼', maxGrowth: 130, sellPrice: 180, growthRate: 0.75, hungerRate: 1.0 },
  koi: { name: '锦鲤', maxGrowth: 150, sellPrice: 350, growthRate: 0.6, hungerRate: 0.85 },
  dragon: { name: '龙鱼', maxGrowth: 200, sellPrice: 800, growthRate: 0.5, hungerRate: 1.2 }
};

function applyOfflineProgress(user, now) {
  const lastVisit = user.lastFishFarmVisit || now;
  const elapsedHours = Math.min((now - lastVisit) / 3600000, 72);
  if (elapsedHours < 0.1) {
    return { fishes: user.fishes || [], events: [] };
  }

  const tank = user.fishTank || {};
  const oxygenEff = (tank.oxygenPump && tank.oxygenPump.efficiency) || 0.8;
  const lightLevel = (tank.light && tank.light.level) || 1;
  const growthBonus = 1 + (lightLevel - 1) * 0.05;
  const autoFeed = tank.feeder && tank.feeder.autoFeed;
  let feedLeft = (user.inventory && user.inventory.feed) || 0;
  const events = [];

  const fishes = (user.fishes || []).map(function (fish) {
    const sp = SPECIES[fish.species] || SPECIES.clownfish;
    let hunger = fish.hunger != null ? fish.hunger : 100;
    let health = fish.health != null ? fish.health : 100;
    let growth = fish.growth || 0;

    const hungerDrop = elapsedHours * 8 * (sp.hungerRate || 1);
    hunger = Math.max(0, hunger - hungerDrop);

    if (autoFeed && feedLeft > 0 && hunger < 50) {
      hunger = Math.min(100, hunger + 30);
      growth = Math.min(sp.maxGrowth, growth + 2 * growthBonus);
      feedLeft -= 1;
      events.push({ type: 'autoFeed', fishId: fish.id });
    }

    if (hunger < 20) {
      health = Math.max(0, health - elapsedHours * 10);
    } else if (oxygenEff < 0.6) {
      health = Math.max(0, health - elapsedHours * 5);
    } else if (hunger > 60 && health < 100) {
      health = Math.min(100, health + elapsedHours * 2);
    }

    if (hunger > 50 && health > 30 && growth < sp.maxGrowth) {
      growth = Math.min(sp.maxGrowth, growth + elapsedHours * sp.growthRate * growthBonus);
    }

    if (health <= 0) {
      events.push({ type: 'death', fishId: fish.id, name: sp.name });
      return null;
    }

    return Object.assign({}, fish, {
      hunger: Math.round(hunger),
      health: Math.round(health),
      growth: Math.round(growth * 10) / 10,
      lastUpdateTime: now
    });
  }).filter(Boolean);

  return { fishes: fishes, feedLeft: feedLeft, events: events };
}

exports.main = async function () {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const now = Date.now();

  const usersRes = await db.collection('users').where({ _openid: openid }).get();
  if (!usersRes.data || !usersRes.data.length) {
    return { ok: false, message: '用户不存在' };
  }

  const user = usersRes.data[0];
  const result = applyOfflineProgress(user, now);

  const updateData = {
    fishes: result.fishes,
    lastFishFarmVisit: now,
    'inventory.feed': result.feedLeft
  };

  await db.collection('users').doc(user._id).update({ data: updateData });

  return {
    ok: true,
    fishes: result.fishes,
    feed: result.feedLeft,
    events: result.events,
    fishCoins: user.fishCoins || 0
  };
};
