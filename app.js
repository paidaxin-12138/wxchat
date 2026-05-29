const config = require('./config.js');
const util = require('./utils/util.js');
const cloud = require('./utils/cloud.js');
const auth = require('./utils/auth.js');

App({
  onLaunch() {
    const app = this;
    util.initLocalData();
    if (wx.cloud) {
      const initOptions = { traceUser: true };
      if (config.cloudEnvId) {
        initOptions.env = config.cloudEnvId;
      }
      wx.cloud.init(initOptions);
    }
    cloud.initApp().then(function () {
      return auth.loginWeChat();
    }).then(function (res) {
      if (res && res.loggedIn) {
        app.globalData.loggedIn = true;
      }
    }).catch(function (err) {
      console.warn('init/login', err);
    });
  },

  globalData: {
    version: config.appVersion,
    loggedIn: false
  }
});
