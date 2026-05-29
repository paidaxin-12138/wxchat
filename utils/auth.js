const cloud = require('./cloud.js');
const avatarUtil = require('./avatar.js');

const STORAGE_LOGIN = 'wxLoggedIn';
const STORAGE_NICK = 'userNickName';
const STORAGE_AVATAR = 'userAvatar';

function getAppSafe() {
  try {
    return getApp();
  } catch (e) {
    return null;
  }
}

function markLoggedIn(loggedIn) {
  if (loggedIn) {
    wx.setStorageSync(STORAGE_LOGIN, true);
  } else {
    wx.removeStorageSync(STORAGE_LOGIN);
  }
  const app = getAppSafe();
  if (app && app.globalData) {
    app.globalData.loggedIn = !!loggedIn;
  }
}

function loginWeChat() {
  return new Promise(function (resolve, reject) {
    if (!cloud.isCloudEnabled()) {
      markLoggedIn(true);
      const nickName = wx.getStorageSync(STORAGE_NICK) || '摸鱼达人';
      const avatarUrl = wx.getStorageSync(STORAGE_AVATAR) || '';
      resolve({ loggedIn: true, nickName: nickName, avatarUrl: avatarUrl });
      return;
    }
    wx.login({
      success: function (res) {
        if (!res.code) {
          reject(new Error('wx.login 无 code'));
          return;
        }
        markLoggedIn(true);
        cloud
          .ensureUser()
          .then(function (user) {
            const nickName =
              wx.getStorageSync(STORAGE_NICK) || user.nickName || '摸鱼达人';
            let avatarRaw = wx.getStorageSync(STORAGE_AVATAR) || user.avatarUrl || '';
            if (avatarUtil.isSignedCloudTempUrl(avatarRaw)) {
              avatarRaw = '';
              wx.removeStorageSync(STORAGE_AVATAR);
            }
            const avatarUrl = avatarUtil.resolveAvatarDisplay(avatarRaw);
            if (nickName) wx.setStorageSync(STORAGE_NICK, nickName);
            if (avatarRaw) wx.setStorageSync(STORAGE_AVATAR, avatarRaw);
            return cloud.syncUserProfile({ nickName: nickName, avatarUrl: avatarRaw || '' });
          })
          .then(function (user) {
            const raw = user.avatarUrl || wx.getStorageSync(STORAGE_AVATAR) || '';
            resolve({
              loggedIn: true,
              nickName: user.nickName || wx.getStorageSync(STORAGE_NICK) || '摸鱼达人',
              avatarUrl: avatarUtil.resolveAvatarDisplay(raw)
            });
          })
          .catch(reject);
      },
      fail: reject
    });
  });
}

function logoutWeChat() {
  markLoggedIn(false);
  return Promise.resolve({ loggedIn: false });
}

function isLoggedIn() {
  return !!wx.getStorageSync(STORAGE_LOGIN);
}

function uploadAvatar(tempPath) {
  return new Promise(function (resolve, reject) {
    if (!tempPath) {
      reject(new Error('empty avatar'));
      return;
    }
    if (!cloud.isCloudEnabled() || !wx.cloud) {
      resolve(tempPath);
      return;
    }
    const ext = tempPath.indexOf('.') > -1 ? tempPath.replace(/^.*\./, '') : 'png';
    const cloudPath = 'avatars/' + Date.now() + '.' + ext;
    wx.cloud
      .uploadFile({
        cloudPath: cloudPath,
        filePath: tempPath
      })
      .then(function (res) {
        if (res && res.fileID) {
          resolve(res.fileID);
          return;
        }
        resolve(tempPath);
      })
      .catch(function () {
        resolve(tempPath);
      });
  });
}

function bindWeChatAvatar(tempPath) {
  return uploadAvatar(tempPath).then(function (fileIdOrPath) {
    const display = avatarUtil.resolveAvatarDisplay(fileIdOrPath);
    wx.setStorageSync(STORAGE_AVATAR, fileIdOrPath);
    markLoggedIn(true);
    return cloud.syncUserProfile({ avatarUrl: fileIdOrPath }).then(function () {
      return display || fileIdOrPath;
    });
  });
}

function bindWeChatNickname(nickName) {
  const name = (nickName || '').trim() || '摸鱼达人';
  wx.setStorageSync(STORAGE_NICK, name);
  markLoggedIn(true);
  return cloud.syncUserProfile({ nickName: name }).then(function () {
    return name;
  });
}

module.exports = {
  loginWeChat,
  logoutWeChat,
  isLoggedIn,
  bindWeChatAvatar,
  bindWeChatNickname,
  resolveAvatarDisplay: avatarUtil.resolveAvatarDisplay
};
