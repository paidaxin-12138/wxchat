const util = require('./utils/util.js');

App({
  onLaunch() {
    util.initAppData();
  },

  globalData: {
    version: '1.0.0'
  }
});
