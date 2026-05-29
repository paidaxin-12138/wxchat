const cloud = require('../../utils/cloud.js');
const fishFarmUtil = require('../../utils/fishFarm.js');
const fishData = require('../../utils/fishData.js');

function afterLoading(done) {
  wx.hideLoading({
    complete: function () {
      if (done) done();
    },
    fail: function () {
      if (done) done();
    }
  });
}

Page({
  data: {
    loading: true,
    totalMoney: '0.00',
    fishCoins: 0,
    fishCount: 0,
    capacity: 3,
    feed: 0,
    eggCount: 0,
    fishes: [],
    devices: [],
    cheatFrozen: false,
    showExchange: false,
    exchangeAmount: '',
    exchangePreview: '0',
    showFishDetail: false,
    selectedFish: null,
    showDevice: false,
    selectedDevice: null,
    exchangeRate: fishData.EXCHANGE_RATE,
    showHatchReveal: false,
    hatchRevealFish: null,
    hatchTankFull: false,
    hasPendingHatch: false
  },

  onLoad() {
    this.setData({ exchangeRate: fishData.EXCHANGE_RATE });
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const that = this;
    this.setData({ loading: true });
    const local = fishFarmUtil.mapUserFishFarm(cloud.getLocalUser());

    const tasks = [];
    if (cloud.isCloudEnabled()) {
      tasks.push(
        fishFarmUtil.calcOfflineProgress().catch(function () {
          return { ok: false };
        })
      );
      tasks.push(
        fishFarmUtil.callFish('getState').catch(function () {
          return { ok: false };
        })
      );
    }

    Promise.all(tasks).then(function (results) {
      let user = cloud.getLocalUser();
      const offline = results[0];
      const state = results[1];
      if (offline && offline.ok) {
        user = Object.assign({}, user, {
          fishes: offline.fishes || user.fishes,
          inventory: Object.assign({}, user.inventory, { feed: offline.feed })
        });
        cloud.updateUser({
          fishes: user.fishes,
          inventory: user.inventory,
          lastFishFarmVisit: Date.now()
        });
        if (offline.events && offline.events.length) {
          that.setData({ offlineEvents: offline.events });
        }
      }
      if (state && state.ok) {
        user = fishFarmUtil.mergeRemoteFarmIntoLocal(user, state);
        cloud.updateUser({
          fishCoins: user.fishCoins,
          fishTank: user.fishTank,
          fishes: user.fishes,
          inventory: user.inventory,
          pendingHatch: user.pendingHatch || null,
          totalMoneyAllTime: user.totalMoneyAllTime
        });
      }
      that.applyFarmData(fishFarmUtil.mapUserFishFarm(user));
    }).catch(function () {
      that.applyFarmData(local);
    });
  },

  applyFarmData(data) {
    this.setData({
      loading: false,
      totalMoney: (data.availableRMB != null ? data.availableRMB : data.totalMoneyAllTime || 0).toFixed(2),
      fishCoins: data.fishCoins || 0,
      fishCount: data.fishCount || 0,
      capacity: data.capacity || 3,
      feed: data.feed || 0,
      eggCount: (data.fishEggs && data.fishEggs.length) || 0,
      fishes: data.fishes || [],
      devices: data.devices || [],
      cheatFrozen: data.cheatFrozen,
      hasPendingHatch: data.hasPendingHatch || false
    });
  },

  showHatchRevealModal(res) {
    const reveal = res.reveal || fishFarmUtil.formatPendingHatch(res.pendingHatch);
    if (!reveal) {
      wx.showToast({ title: '孵化数据异常，请重试', icon: 'none' });
      return;
    }
    this.setData({
      showHatchReveal: true,
      hatchRevealFish: reveal,
      hatchTankFull: !!res.tankFull
    });
  },

  closeHatchReveal() {
    this.setData({ showHatchReveal: false });
  },

  openExchange() {
    this.setData({ showExchange: true, exchangeAmount: '', exchangePreview: '0' });
  },

  closeExchange() {
    this.setData({ showExchange: false });
  },

  onExchangeInput(e) {
    const val = e.detail.value;
    const coins = Math.floor((parseFloat(val) || 0) * fishData.EXCHANGE_RATE);
    this.setData({ exchangeAmount: val, exchangePreview: String(coins) });
  },

  confirmExchange(amountOverride) {
    let amount;
    if (typeof amountOverride === 'number') {
      amount = amountOverride;
    } else if (typeof amountOverride === 'string' && amountOverride !== '') {
      amount = parseFloat(amountOverride);
    } else {
      amount = parseFloat(this.data.exchangeAmount);
    }
    if (isNaN(amount) || amount <= 0) {
      return wx.showToast({ title: '请输入有效金额', icon: 'none' });
    }
    const that = this;
    const user = cloud.getLocalUser();
    const balance = cloud.getAvailableRMB(user);
    if (amount > balance + 0.001) {
      return wx.showToast({
        title: '余额不足，最多可兑换 ¥' + balance.toFixed(2),
        icon: 'none'
      });
    }

    const applySuccess = function (res, gained) {
      const coins = gained != null ? gained : (res && res.fishCoinsGained);
      const newMoney = res && res.totalMoneyAllTime != null ? res.totalMoneyAllTime : Math.round((balance - amount) * 100) / 100;
      const newCoins = res && res.fishCoins != null ? res.fishCoins : (user.fishCoins || 0) + Math.floor(amount * fishData.EXCHANGE_RATE);
      cloud.updateUser({
        totalMoneyAllTime: newMoney,
        totalExchangedRMB:
          res && res.totalExchangedRMB != null
            ? res.totalExchangedRMB
            : Math.round(((user.totalExchangedRMB || 0) + amount) * 100) / 100,
        fishCoins: newCoins
      });
      that.closeExchange();
      that.refresh();
      wx.showToast({ title: '兑换 +' + (coins || Math.floor(amount * fishData.EXCHANGE_RATE)) + ' 币', icon: 'success' });
    };

    const doLocal = function () {
      applySuccess(null, Math.floor(amount * fishData.EXCHANGE_RATE));
    };

    if (!cloud.isCloudEnabled()) {
      doLocal();
      return;
    }

    wx.showLoading({ title: '兑换中...', mask: true });
    cloud
      .ensureUser()
      .then(function () {
        return fishFarmUtil.exchangeCurrency(amount);
      })
      .then(function (res) {
        if (!res || !res.ok) {
          afterLoading(function () {
            wx.showToast({ title: (res && res.message) || '兑换失败', icon: 'none', duration: 3000 });
          });
          return;
        }
        afterLoading(function () {
          applySuccess(res);
        });
      })
      .catch(function (err) {
        const msg = (err && (err.message || err.errMsg)) || '';
        console.warn('exchange fail', err);
        afterLoading(function () {
          if (msg.indexOf('FUNCTION_NOT_FOUND') >= 0 || msg.indexOf('-501000') >= 0) {
            doLocal();
            return;
          }
          wx.showToast({ title: msg || '兑换失败，请部署 fishFarm 云函数', icon: 'none', duration: 3000 });
        });
      });
  },

  exchangeAll() {
    const balance = parseFloat(this.data.totalMoney) || 0;
    if (balance <= 0) {
      return wx.showToast({ title: '暂无可兑换余额', icon: 'none' });
    }
    this.confirmExchange(balance);
  },

  goShop() {
    wx.navigateTo({ url: '/pages/fishfarm/shop/shop' });
  },

  onHatch() {
    const that = this;
    if (this.data.cheatFrozen) {
      return wx.showToast({ title: '账号已冻结', icon: 'none' });
    }
    if (!cloud.isCloudEnabled()) {
      return wx.showToast({ title: '请开通云开发', icon: 'none' });
    }
    if (this.data.hasPendingHatch) {
      const user = cloud.getLocalUser();
      const pending = user.pendingHatch;
      const cap = fishFarmUtil.getCapacity(user.fishTank);
      const fishCount = (user.fishes || []).length;
      that.showHatchRevealModal({
        pendingHatch: pending,
        reveal: fishFarmUtil.formatPendingHatch(pending),
        tankFull: fishCount >= cap
      });
      return;
    }
    if (this.data.eggCount === 0) {
      return wx.showToast({ title: '没有鱼卵', icon: 'none' });
    }
    wx.showLoading({ title: '孵化中...', mask: true });
    fishFarmUtil
      .callFish('hatchReveal', {})
      .then(function (res) {
        afterLoading(function () {
          if (!res || !res.ok) {
            wx.showToast({ title: (res && res.message) || '孵化失败', icon: 'none', duration: 2500 });
            return;
          }
          const mapped = fishFarmUtil.mapUserFishFarm(cloud.getLocalUser());
          that.setData({
            eggCount: (mapped.fishEggs && mapped.fishEggs.length) || 0,
            hasPendingHatch: mapped.hasPendingHatch
          });
          that.showHatchRevealModal(res);
        });
      })
      .catch(function (err) {
        const msg = (err && (err.message || err.errMsg)) || '';
        afterLoading(function () {
          wx.showToast({ title: msg || '孵化失败，请检查网络', icon: 'none', duration: 2500 });
        });
      });
  },

  onHatchKeep() {
    const that = this;
    if (this.data.hatchTankFull) {
      return wx.showToast({ title: '鱼缸已满，请先卖出或升级', icon: 'none' });
    }
    wx.showLoading({ title: '放入鱼缸...', mask: true });
    fishFarmUtil
      .callFish('hatchKeep', {})
      .then(function (res) {
        afterLoading(function () {
          if (!res || !res.ok) {
            wx.showToast({ title: (res && res.message) || '培养失败', icon: 'none' });
            return;
          }
          that.closeHatchReveal();
          that.setData({ hasPendingHatch: false });
          wx.showToast({ title: res.message || '开始培养', icon: 'success' });
          that.refresh();
        });
      })
      .catch(function () {
        afterLoading(function () {
          wx.showToast({ title: '培养失败', icon: 'none' });
        });
      });
  },

  onHatchDiscard() {
    const that = this;
    wx.showModal({
      title: '确认丢弃',
      content: '确定不要这条' + (that.data.hatchRevealFish && that.data.hatchRevealFish.name) + '了吗？',
      success: function (modalRes) {
        if (!modalRes.confirm) return;
        fishFarmUtil
          .callFish('hatchDiscard', {})
          .then(function (res) {
            if (!res || !res.ok) {
              wx.showToast({ title: (res && res.message) || '操作失败', icon: 'none' });
              return;
            }
            that.closeHatchReveal();
            that.setData({ hasPendingHatch: false });
            wx.showToast({ title: '丢弃成功', icon: 'success' });
            that.refresh();
          })
          .catch(function () {
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
      }
    });
  },

  onFeedAll() {
    this.runAction('feedAll', {}, '喂食');
  },

  onFishTap(e) {
    const id = e.currentTarget.dataset.id;
    const fish = this.data.fishes.find(function (f) {
      return f.id === id;
    });
    if (fish) this.setData({ showFishDetail: true, selectedFish: fish });
  },

  closeFishDetail() {
    this.setData({ showFishDetail: false, selectedFish: null });
  },

  feedOneFish() {
    const fish = this.data.selectedFish;
    if (!fish) return;
    const that = this;
    this.runAction('feedFish', { fishId: fish.id }, '喂食', function () {
      that.closeFishDetail();
    });
  },

  sellFish() {
    const fish = this.data.selectedFish;
    if (!fish) return;
    if (!fish.canSell) {
      return wx.showToast({ title: '鱼还未长大', icon: 'none' });
    }
    const that = this;
    this.runAction('sellFish', { fishId: fish.id }, '卖出', function () {
      that.closeFishDetail();
    });
  },

  discardFish() {
    const fish = this.data.selectedFish;
    if (!fish) return;
    const that = this;
    const fishName = fish.name || fish.speciesName || '这条鱼';
    wx.showModal({
      title: '悄悄丢弃',
      content: '确定趁摸鱼之神没看见，把「' + fishName + '」放生吗？',
      confirmText: '丢弃',
      confirmColor: '#C62828',
      success: function (res) {
        if (!res.confirm) return;
        that.closeFishDetail();
        fishFarmUtil
          .callFish('discardFish', { fishId: fish.id })
          .then(function (result) {
            if (!result || !result.ok) {
              wx.showToast({ title: (result && result.message) || '放生失败', icon: 'none' });
              that.refresh();
              return;
            }
            wx.showToast({ title: '放生成功', icon: 'success' });
            that.refresh();
          })
          .catch(function () {
            wx.showToast({ title: '放生失败', icon: 'none' });
            that.refresh();
          });
      }
    });
  },

  onDeviceTap(e) {
    const key = e.currentTarget.dataset.key;
    const device = this.data.devices.find(function (d) {
      return d.key === key;
    });
    if (device) this.setData({ showDevice: true, selectedDevice: device });
  },

  closeDevice() {
    this.setData({ showDevice: false, selectedDevice: null });
  },

  upgradeDevice() {
    const device = this.data.selectedDevice;
    if (!device || !device.upgradeCost) {
      return wx.showToast({ title: '已满级', icon: 'none' });
    }
    const that = this;
    this.runAction('upgradeDevice', { deviceKey: device.key }, '升级', function () {
      that.closeDevice();
    });
  },

  runAction(action, data, label, cb) {
    const that = this;
    if (this.data.cheatFrozen) {
      return wx.showToast({ title: '账号已冻结', icon: 'none' });
    }
    if (!cloud.isCloudEnabled()) {
      wx.showToast({ title: '请开通云开发', icon: 'none' });
      return;
    }
    wx.showLoading({ title: label + '中...' });
    fishFarmUtil
      .callFish(action, data)
      .then(function (res) {
        afterLoading(function () {
          if (!res || !res.ok) {
            wx.showToast({ title: (res && res.message) || '操作失败', icon: 'none' });
            return;
          }
          wx.showToast({ title: res.message || '成功', icon: 'success' });
          if (cb) cb();
          that.refresh();
        });
      })
      .catch(function () {
        afterLoading(function () {
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      });
  },

  preventClose() {}
});
