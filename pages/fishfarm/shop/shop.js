const cloud = require('../../../utils/cloud.js');
const fishFarmUtil = require('../../../utils/fishFarm.js');
const fishData = require('../../../utils/fishData.js');

function readEggCount(user) {
  const u = user || cloud.getLocalUser();
  return ((u.inventory && u.inventory.fishEggs) || []).length;
}

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
    fishCoins: 0,
    eggCount: 0,
    mysteryEgg: fishData.MYSTERY_EGG,
    hatchOdds: fishData.getHatchOddsDisplay(),
    feedPack: fishData.FEED_PACK
  },

  syncShopState(extra) {
    const user = cloud.getLocalUser();
    const patch = Object.assign(
      {
        fishCoins: user.fishCoins || 0,
        eggCount: readEggCount(user)
      },
      extra || {}
    );
    this.setData(patch);
  },

  onShow() {
    this.syncShopState();
    if (!cloud.isCloudEnabled()) return;
    const that = this;
    fishFarmUtil.callFish('getState').then(function (res) {
      if (!res || !res.ok) return;
      const user = cloud.getLocalUser();
      that.setData({
        fishCoins: res.fishCoins != null ? res.fishCoins : user.fishCoins || 0,
        eggCount:
          res.eggCount != null
            ? res.eggCount
            : ((res.inventory && res.inventory.fishEggs) || []).length || readEggCount(user)
      });
    });
  },

  buyEgg() {
    const price = fishData.MYSTERY_EGG.price;
    const that = this;
    if (this.data.fishCoins < price) {
      return wx.showToast({ title: '摸鱼币不足', icon: 'none' });
    }
    if (!cloud.isCloudEnabled()) {
      return wx.showToast({ title: '请开通云开发', icon: 'none' });
    }
    wx.showLoading({ title: '购买中', mask: true });
    fishFarmUtil
      .callFish('buyEgg', {})
      .then(function (res) {
        if (!res || !res.ok) {
          afterLoading(function () {
            wx.showToast({ title: (res && res.message) || '购买失败', icon: 'none' });
          });
          return;
        }
        const eggCount =
          res.eggCount != null ? res.eggCount : readEggCount(cloud.getLocalUser());
        afterLoading(function () {
          that.syncShopState({
            fishCoins: res.fishCoins,
            eggCount: eggCount
          });
          wx.showToast({
            title: '获得神秘鱼卵，共持有 ' + eggCount + ' 枚',
            icon: 'success',
            duration: 2200
          });
        });
      })
      .catch(function () {
        afterLoading(function () {
          wx.showToast({ title: '购买失败', icon: 'none' });
        });
      });
  },

  buyFeed() {
    const that = this;
    const price = fishData.FEED_PACK.price;
    if (this.data.fishCoins < price) {
      return wx.showToast({ title: '摸鱼币不足', icon: 'none' });
    }
    if (!cloud.isCloudEnabled()) {
      return wx.showToast({ title: '请开通云开发', icon: 'none' });
    }
    wx.showLoading({ title: '购买中', mask: true });
    fishFarmUtil
      .callFish('buyFeed', {})
      .then(function (res) {
        if (!res || !res.ok) {
          afterLoading(function () {
            wx.showToast({ title: (res && res.message) || '购买失败', icon: 'none' });
          });
          return;
        }
        afterLoading(function () {
          that.syncShopState({ fishCoins: res.fishCoins });
          wx.showToast({ title: res.message, icon: 'success' });
        });
      })
      .catch(function () {
        afterLoading(function () {
          wx.showToast({ title: '购买失败', icon: 'none' });
        });
      });
  }
});
