function saveToPhotosAlbum(filePath) {
  wx.getSetting({
    success(setting) {
      if (setting.authSetting['scope.writePhotosAlbum'] === false) {
        wx.showModal({
          title: '需要授权',
          content: '请在设置中允许保存到相册',
          confirmText: '去设置',
          success(modal) {
            if (modal.confirm) wx.openSetting();
          }
        });
        return;
      }
      wx.saveImageToPhotosAlbum({
        filePath: filePath,
        success() {
          wx.showToast({ title: '已保存到相册', icon: 'success' });
        },
        fail() {
          wx.showModal({
            title: '保存失败',
            content: '请允许保存到相册权限后重试',
            showCancel: false
          });
        }
      });
    }
  });
}

function shareImageToFriend(filePath) {
  if (typeof wx.showShareImageMenu === 'function') {
    wx.showShareImageMenu({
      path: filePath,
      fail() {
        wx.previewImage({ urls: [filePath], showmenu: true });
      }
    });
    return;
  }
  if (typeof wx.shareFileMessage === 'function') {
    wx.shareFileMessage({
      filePath: filePath,
      fail() {
        wx.previewImage({ urls: [filePath], showmenu: true });
      }
    });
    return;
  }
  wx.previewImage({ urls: [filePath], showmenu: true });
}

function showWeeklyReportActions(filePath) {
  wx.showActionSheet({
    itemList: ['保存到相册', '发送给朋友'],
    success(res) {
      if (res.tapIndex === 0) {
        saveToPhotosAlbum(filePath);
      } else if (res.tapIndex === 1) {
        shareImageToFriend(filePath);
      }
    }
  });
}

function runWeeklyReportFlow(page, canvasSelector, data) {
  const weeklyReport = require('./weeklyReport.js');
  wx.showLoading({ title: '生成中...', mask: true });
  return weeklyReport
    .generateWeeklyReport(page, canvasSelector, data)
    .then(function (filePath) {
      wx.hideLoading();
      showWeeklyReportActions(filePath);
      return filePath;
    })
    .catch(function () {
      wx.hideLoading();
      wx.showToast({ title: '周报生成失败', icon: 'none' });
    });
}

module.exports = {
  saveToPhotosAlbum,
  shareImageToFriend,
  showWeeklyReportActions,
  runWeeklyReportFlow
};
