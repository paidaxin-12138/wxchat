const config = require('../config.js');
const util = require('./util.js');
const rankUtil = require('./rank.js');

const STORAGE_USER = 'cloudUser';
const DB_USERS = 'users';
const DB_RECORDS = 'records';
const DB_WEEKLY_RANKINGS = 'weekly_rankings';
const leaderboardUtil = require('./leaderboard.js');
const fishData = require('./fishData.js');
const fishValidator = require('./fishTimeValidator.js');
const avatarUtil = require('./avatar.js');

function normalizeAvatarField(avatarUrl) {
  if (!avatarUrl || avatarUtil.isSignedCloudTempUrl(avatarUrl)) return '';
  return avatarUrl;
}

function isCloudEnabled() {
  return !!wx.cloud;
}

function callCloud(name, data) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud) {
      reject(new Error('cloud unavailable'));
      return;
    }
    wx.cloud
      .callFunction({ name: name, data: data || {} })
      .then(function (res) {
        resolve((res && res.result) || {});
      })
      .catch(reject);
  });
}

function isCloudFunctionNotFound(err) {
  const msg = String((err && (err.message || err.errMsg)) || err || '');
  return msg.indexOf('FUNCTION_NOT_FOUND') >= 0 || msg.indexOf('-501000') >= 0;
}

function db() {
  return wx.cloud.database();
}

function getLocalUser() {
  const u = wx.getStorageSync(STORAGE_USER);
  const defaults = Object.assign({}, util.getDefaultUser(), fishData.getDefaultFishFarmFields());
  if (u && typeof u === 'object') return Object.assign({}, defaults, u);
  return defaults;
}

function getAvailableRMB(user) {
  const u = user || getLocalUser();
  const exchanged = parseFloat(u.totalExchangedRMB) || 0;
  const records = util.getRecords();
  let earned = 0;
  records.forEach(function (r) {
    earned += parseFloat(r.moneyEarned) || 0;
  });
  const fromRecords = Math.round((earned - exchanged) * 100) / 100;
  const fromField = Math.round((parseFloat(u.totalMoneyAllTime) || 0) * 100) / 100;
  if (earned > 0) return Math.max(0, fromRecords);
  return Math.max(0, fromField);
}

function saveLocalUser(user) {
  wx.setStorageSync(STORAGE_USER, user);
  util.saveConfig(user);
}

function normalizeRecord(r) {
  const type = rankUtil.normalizeType(r.type);
  const ts = r.timestamp;
  const d = new Date(ts);
  return Object.assign({}, r, {
    type: type,
    timestamp: ts,
    dateStr: r.dateStr || d.getFullYear() + '-' + util.pad(d.getMonth() + 1) + '-' + util.pad(d.getDate()),
    timeStr:
      r.timeStr && r.timeStr.length <= 5
        ? r.timeStr
        : util.pad(d.getHours()) + ':' + util.pad(d.getMinutes()),
    moneyEarned: util.roundMoney(r.moneyEarned || 0)
  });
}

function ensureUser() {
  return new Promise(function (resolve) {
    const local = getLocalUser();
    if (!isCloudEnabled()) {
      saveLocalUser(local);
      resolve(local);
      return;
    }
  db()
      .collection(DB_USERS)
      .get()
      .then(function (res) {
        if (res.data && res.data.length > 0) {
          const user = Object.assign({}, util.getDefaultUser(), res.data[0], {
            nickName: res.data[0].nickName || wx.getStorageSync('userNickName') || '摸鱼达人',
            avatarUrl: normalizeAvatarField(
              res.data[0].avatarUrl || wx.getStorageSync('userAvatar') || ''
            )
          });
          saveLocalUser(user);
          resolve(user);
        } else {
          const user = Object.assign({}, util.getDefaultUser(), {
            nickName: wx.getStorageSync('userNickName') || '摸鱼达人',
            avatarUrl: wx.getStorageSync('userAvatar') || ''
          });
          return db()
            .collection(DB_USERS)
            .add({ data: user })
            .then(function () {
              saveLocalUser(user);
              resolve(user);
            });
        }
      })
      .catch(function () {
        saveLocalUser(local);
        resolve(local);
      });
  });
}

function recordKey(r) {
  return (r && (r._id || r.id)) || '';
}

function mergeRecordList(localList, remoteList) {
  const map = {};
  (remoteList || []).forEach(function (r) {
    const key = recordKey(r);
    if (key) map[key] = normalizeRecord(r);
  });
  (localList || []).forEach(function (r) {
    const key = recordKey(r);
    if (!key) return;
    if (!map[key]) {
      map[key] = normalizeRecord(r);
      return;
    }
    const localTs = r.timestamp || 0;
    const remoteTs = map[key].timestamp || 0;
    if (localTs >= remoteTs) map[key] = normalizeRecord(r);
  });
  return Object.keys(map)
    .map(function (k) {
      return map[k];
    })
    .sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });
}

function syncRecordsFromCloud() {
  return new Promise(function (resolve) {
    const local = util.getRecords();
    if (!isCloudEnabled()) {
      resolve(local);
      return;
    }
    db()
      .collection(DB_RECORDS)
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get()
      .then(function (res) {
        const remote = (res.data || []).map(normalizeRecord);
        const merged = mergeRecordList(local, remote);
        util.saveRecords(merged);
        resolve(merged);
      })
      .catch(function () {
        resolve(local);
      });
  });
}

function syncUserProfile(fields) {
  const user = Object.assign({}, getLocalUser(), fields);
  saveLocalUser(user);
  if (!isCloudEnabled()) return Promise.resolve(user);
  return db()
    .collection(DB_USERS)
    .get()
    .then(function (res) {
      if (res.data && res.data[0] && res.data[0]._id) {
        return db().collection(DB_USERS).doc(res.data[0]._id).update({ data: fields });
      }
      return db()
        .collection(DB_USERS)
        .add({ data: Object.assign({}, util.getDefaultUser(), user) });
    })
    .then(function () {
      return user;
    })
    .catch(function () {
      return user;
    });
}

function fetchLatestWeeklyRanking() {
  return new Promise(function (resolve) {
    if (!isCloudEnabled()) {
      resolve(null);
      return;
    }
    callCloud('getLeaderboard', { type: 'weekly' })
      .then(function (result) {
        if (result && result.ok && result.doc) {
          resolve(result.doc);
          return;
        }
        resolve(null);
      })
      .catch(function (err) {
        console.error('fetchLatestWeeklyRanking', err);
        resolve(null);
      });
  });
}

function fetchAllTimeRanking(skip, limit) {
  const pageSize = limit || leaderboardUtil.TOP_LIMIT;
  const pageSkip = skip || 0;
  return new Promise(function (resolve) {
    if (!isCloudEnabled()) {
      const user = getLocalUser();
      const localList = [
        {
          openId: 'local',
          nickName: wx.getStorageSync('userNickName') || user.nickName || '摸鱼达人',
          avatarUrl: wx.getStorageSync('userAvatar') || user.avatarUrl || '',
          totalMoneyAllTime: user.totalMoneyAllTime || 0,
          rank: 1
        }
      ];
      resolve({
        list: localList.map(function (item, index) {
          return leaderboardUtil.mapRankingItem(item, index);
        }),
        hasMore: false
      });
      return;
    }
    callCloud('getLeaderboard', { type: 'allTime', skip: pageSkip, limit: pageSize })
      .then(function (result) {
        if (!result || !result.ok) {
          resolve({ list: [], hasMore: false, error: (result && result.message) || 'query failed' });
          return;
        }
        const list = (result.list || []).map(function (item, index) {
          return leaderboardUtil.mapRankingItem(item, pageSkip + index);
        });
        resolve({
          list: list,
          hasMore: !!result.hasMore
        });
      })
      .catch(function (err) {
        console.error('fetchAllTimeRanking', err);
        resolve({ list: [], hasMore: false, error: err.errMsg || 'network error' });
      });
  });
}

function fetchMyAllTimeRank() {
  return new Promise(function (resolve) {
    const user = getLocalUser();
    const myTotal = user.totalMoneyAllTime || 0;
    if (!isCloudEnabled()) {
      resolve({
        rank: 1,
        totalMoney: myTotal,
        moneyDisplay: leaderboardUtil.formatMoney(myTotal)
      });
      return;
    }
    callCloud('getLeaderboard', { type: 'myRank' })
      .then(function (result) {
        if (!result || !result.ok) {
          resolve({
            rank: 0,
            totalMoney: myTotal,
            moneyDisplay: leaderboardUtil.formatMoney(myTotal)
          });
          return;
        }
        resolve({
          rank: result.rank || 0,
          totalMoney: result.totalMoney || myTotal,
          moneyDisplay: leaderboardUtil.formatMoney(result.totalMoney || myTotal)
        });
      })
      .catch(function () {
        resolve({
          rank: 0,
          totalMoney: myTotal,
          moneyDisplay: leaderboardUtil.formatMoney(myTotal)
        });
      });
  });
}

function runWeeklySettlement() {
  return callCloud('getLeaderboard', { type: 'settle' });
}

function syncUserToCloud() {
  if (!isCloudEnabled()) return Promise.resolve(getLocalUser());
  const user = getLocalUser();
  const nickName = wx.getStorageSync('userNickName') || user.nickName || '摸鱼达人';
  const avatarUrl = normalizeAvatarField(
    wx.getStorageSync('userAvatar') || user.avatarUrl || ''
  );
  const records = util.getRecords();
  const stats = rankUtil.aggregateStats(records);
  const fields = {
    nickName: nickName,
    avatarUrl: avatarUrl,
    totalMoneyAllTime: stats.totalMoney,
    rankId: rankUtil.getRankByMoney(stats.totalMoney).id
  };
  return updateUser(fields);
}

function updateUser(fields) {
  const user = Object.assign({}, getLocalUser(), fields);
  saveLocalUser(user);
  if (!isCloudEnabled()) return Promise.resolve(user);
  return db()
    .collection(DB_USERS)
    .get()
    .then(function (res) {
      if (res.data && res.data[0] && res.data[0]._id) {
        const doc = res.data[0];
        const docId = doc._id;
        const needClearPending =
          fields.pendingHatch &&
          typeof fields.pendingHatch === 'object' &&
          (doc.pendingHatch === null || doc.pendingHatch === undefined);
        const doUpdate = function () {
          return db().collection(DB_USERS).doc(docId).update({ data: fields });
        };
        if (needClearPending) {
          const cmd = db().command;
          return db()
            .collection(DB_USERS)
            .doc(docId)
            .update({ data: { pendingHatch: cmd.remove() } })
            .catch(function () {})
            .then(doUpdate);
        }
        return doUpdate();
      }
      return db()
        .collection(DB_USERS)
        .add({ data: Object.assign({}, util.getDefaultUser(), user) });
    })
    .then(function () {
      return user;
    })
    .catch(function () {
      return user;
    });
}

function submitMoyuRecordLocal(payload) {
  const fishValidator = require('./fishTimeValidator.js');
  const now = Date.now();
  const user = getLocalUser();
  const type = payload.type;
  const timestamp = payload.timestamp || now;
  const durationMin = parseFloat(payload.durationMin) || 0;
  const config = user;

  const freezeState = fishValidator.resolveFreezeState(user.cheatMarker, now);
  let marker = freezeState.marker;
  let rewardPenalty = freezeState.rewardPenalty;
  let isSuspicious = false;
  let justFrozen = false;

  if (!freezeState.isFrozen) {
    isSuspicious = fishValidator.checkSuspicious(marker, timestamp, durationMin, type);
    if (isSuspicious) {
      const applied = fishValidator.applySuspicious(marker, now);
      marker = applied.marker;
      justFrozen = applied.justFrozen;
      if (justFrozen) rewardPenalty = 0.5;
    }
  }

  let moneyEarned = 0;
  let detailDesc = '';
  const t = type === 'gossip' ? 'chat' : type;
  if (t === 'water') {
    const ml = parseFloat(payload.waterMl) || 0;
    moneyEarned = util.calculateWaterEarned(ml, config);
    detailDesc = util.buildWaterDesc(ml);
    payload = Object.assign({}, payload, { waterMl: ml });
  } else if (t === 'charge') {
    const min = parseFloat(payload.durationMin) || 0;
    const power = parseFloat(payload.chargePowerW) || config.chargerPower;
    moneyEarned = util.calculateChargeEarned(min, power, config);
    detailDesc = util.buildChargeDesc(min, power);
    payload = Object.assign({}, payload, { durationMin: min, chargePowerW: power });
  } else if (t === 'toilet') {
    moneyEarned = util.calculateToiletEarned(durationMin, config);
    detailDesc = util.buildToiletDesc(durationMin);
  } else if (t === 'chat') {
    moneyEarned = util.calculateChatEarned(durationMin, config);
    detailDesc = util.buildChatDesc(durationMin);
  } else {
    moneyEarned = util.calculateTimeEarned(durationMin, config);
    detailDesc = '摸鱼 ' + durationMin + '分钟';
  }

  if (moneyEarned <= 0) {
    return Promise.reject({ message: '收益计算异常' });
  }

  const fishCoinsGained = fishValidator.calcFishCoins(moneyEarned, freezeState.rewardPenalty, {
    isSuspicious: isSuspicious,
    justFrozen: justFrozen
  });
  const record = util.buildRecord(type, {
    timestamp: timestamp,
    durationMin: payload.durationMin,
    waterMl: payload.waterMl,
    chargePowerW: payload.chargePowerW,
    moneyEarned: moneyEarned,
    detailDesc: detailDesc
  });

  marker = fishValidator.pushRecentRecord(marker, timestamp);
  const finalFreeze = fishValidator.resolveFreezeState(marker, now);

  const records = util.getRecords();
  records.unshift(record);
  util.saveRecords(records);

  const newFishCoins = (user.fishCoins || 0) + fishCoinsGained;
  const exchanged = parseFloat(user.totalExchangedRMB) || 0;
  const stats = rankUtil.aggregateStats(records);
  const totalMoney = Math.round((stats.totalMoney - exchanged) * 100) / 100;
  const result = rankUtil.checkRankAndBadges(user, records);

  saveLocalUser(
    Object.assign({}, user, {
      totalMoneyAllTime: Math.max(0, totalMoney),
      fishCoins: newFishCoins,
      rankId: result.rankId,
      badges: result.badges,
      cheatMarker: finalFreeze.marker
    })
  );

  const isFrozen = finalFreeze.isFrozen || justFrozen;
  const freezeRemainHours = justFrozen ? 24 : finalFreeze.freezeRemainHours;
  const message = fishValidator.buildResultMessage({
    fishCoinsGained: fishCoinsGained,
    isFrozen: isFrozen,
    isSuspicious: isSuspicious,
    justFrozen: justFrozen,
    freezeRemainHours: freezeRemainHours
  });

  return Promise.resolve({
    success: true,
    ok: true,
    moneyEarned: moneyEarned,
    fishCoinsGained: fishCoinsGained,
    isFrozen: isFrozen,
    isSuspicious: isSuspicious,
    justFrozen: justFrozen,
    freezeRemainHours: freezeRemainHours,
    message: message,
    record: record,
    changes: result.changes
  });
}

function submitMoyuRecord(payload) {
  if (!payload || !payload.type) {
    return Promise.reject({ message: '无效摸鱼类型' });
  }
  if (!isCloudEnabled()) {
    return submitMoyuRecordLocal(payload);
  }
  return callCloud('validateAndAddRecord', payload)
    .then(function (result) {
      if (!result || !result.success) {
        return Promise.reject({ message: (result && result.message) || '保存失败' });
      }
      const record = result.record;
      if (record) {
        const records = util.getRecords();
        records.unshift(normalizeRecord(record));
        if (result.record._id) records[0]._id = result.record._id;
        util.saveRecords(records);
      }
      if (result.user) {
        const user = Object.assign({}, getLocalUser(), result.user);
        saveLocalUser(user);
      }
      const rankResult = rankUtil.checkRankAndBadges(getLocalUser(), util.getRecords());
      const u = getLocalUser();
      if (rankResult.changes && rankResult.changes.length) {
        saveLocalUser(Object.assign({}, u, { rankId: rankResult.rankId, badges: rankResult.badges }));
      }
      return Object.assign({}, result, { changes: rankResult.changes || result.changes || [] });
    })
    .catch(function (err) {
      if (!isCloudFunctionNotFound(err)) {
        return Promise.reject({ message: (err && err.message) || '保存失败' });
      }
      console.warn('[validateAndAddRecord] 云函数未部署，使用本地模式');
      return submitMoyuRecordLocal(payload);
    });
}

function addRecord(record) {
  if (!record || !record.type) {
    return Promise.reject({ message: '无效记录' });
  }
  return submitMoyuRecord({
    type: record.type,
    durationMin: record.durationMin,
    waterMl: record.waterMl,
    chargePowerW: record.chargePowerW,
    timestamp: record.timestamp
  });
}

function deleteRecord(id) {
  let records = util.getRecords().filter(function (r) {
    return r._id !== id && r.id !== id;
  });
  util.saveRecords(records);
  if (!isCloudEnabled()) return afterRecordChange(records);
  const tasks = [];
  if (id && id.length > 10) {
    tasks.push(
      db()
        .collection(DB_RECORDS)
        .doc(id)
        .remove()
        .catch(function () {})
    );
  }
  return Promise.all(tasks).then(function () {
    return afterRecordChange(records);
  });
}

function resetUserProfile() {
  const profile = {
    nickName: '摸鱼达人',
    avatarUrl: '',
    weeklyBadge: null,
    lastWeekRank: 0
  };
  wx.removeStorageSync('userNickName');
  wx.removeStorageSync('userAvatar');
  const user = getLocalUser();
  saveLocalUser(Object.assign({}, user, profile));
  if (!isCloudEnabled()) return Promise.resolve(getLocalUser());
  return db()
    .collection(DB_USERS)
    .get()
    .then(function (res) {
      if (!res.data || !res.data[0] || !res.data[0]._id) {
        return getLocalUser();
      }
      return db()
        .collection(DB_USERS)
        .doc(res.data[0]._id)
        .update({ data: profile })
        .then(function () {
          return getLocalUser();
        });
    })
    .catch(function () {
      return getLocalUser();
    });
}

function resetFishFarmData() {
  const reset = Object.assign({}, fishData.getEmptyFishFarmFields(), {
    lastFishFarmVisit: Date.now()
  });
  const user = getLocalUser();
  saveLocalUser(Object.assign({}, user, reset));
  if (!isCloudEnabled()) return Promise.resolve(getLocalUser());

  return db()
    .collection(DB_USERS)
    .get()
    .then(function (res) {
      if (!res.data || !res.data[0] || !res.data[0]._id) {
        return getLocalUser();
      }
      const docId = res.data[0]._id;
      const cmd = db().command;
      return db()
        .collection(DB_USERS)
        .doc(docId)
        .update({
          data: {
            fishCoins: 0,
            totalExchangedRMB: 0,
            fishes: [],
            fishTank: reset.fishTank,
            'inventory.fishEggs': [],
            'inventory.feed': 0,
            cheatMarker: reset.cheatMarker,
            pendingHatch: cmd.remove(),
            lastFishFarmVisit: reset.lastFishFarmVisit
          }
        })
        .catch(function (err) {
          console.warn('resetFishFarmData cloud', err);
          return updateUser(reset);
        });
    })
    .then(function () {
      return getLocalUser();
    });
}

function clearAllRecords() {
  util.saveRecords([]);
  const finishClear = function () {
    return afterRecordChange([]).then(function (result) {
      return resetFishFarmData().then(function () {
        return resetUserProfile().then(function () {
          return result;
        });
      });
    });
  };
  if (!isCloudEnabled()) {
    return finishClear();
  }
  return db()
    .collection(DB_RECORDS)
    .get()
    .then(function (res) {
      const tasks = (res.data || []).map(function (doc) {
        return db().collection(DB_RECORDS).doc(doc._id).remove();
      });
      return Promise.all(tasks);
    })
    .catch(function () {})
    .then(finishClear);
}

function afterRecordChange(records) {
  const user = getLocalUser();
  const result = rankUtil.checkRankAndBadges(user, records);
  const stats = rankUtil.aggregateStats(records);
  const exchanged = parseFloat(user.totalExchangedRMB) || 0;
  const totalMoney = Math.round((stats.totalMoney - exchanged) * 100) / 100;
  const updates = {
    rankId: result.rankId,
    badges: result.badges,
    totalMoneyAllTime: Math.max(0, totalMoney)
  };
  saveLocalUser(Object.assign({}, user, updates));
  return updateUser(updates).then(function () {
    return { records: records, changes: result.changes, user: getLocalUser() };
  });
}

function initApp() {
  return ensureUser().then(function () {
    return syncRecordsFromCloud();
  }).then(function () {
    return syncUserToCloud();
  });
}

module.exports = {
  isCloudEnabled,
  callCloud,
  isCloudFunctionNotFound,
  getLocalUser,
  getAvailableRMB,
  ensureUser,
  syncRecordsFromCloud,
  syncUserProfile,
  syncUserToCloud,
  fetchLatestWeeklyRanking,
  fetchAllTimeRanking,
  fetchMyAllTimeRank,
  runWeeklySettlement,
  updateUser,
  addRecord,
  submitMoyuRecord,
  deleteRecord,
  clearAllRecords,
  afterRecordChange,
  initApp,
  normalizeRecord
};
