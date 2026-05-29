function isWeeklySubscribeReady() {
  return !!(module.exports.cloudEnvId && module.exports.weeklyReportTemplateId);
}

module.exports = {
  // 云开发环境 ID（可选）。留空则使用开发者工具绑定的默认云环境。
  // 部署云函数前：右键 cloudfunctions 文件夹 →「当前环境」/「切换环境」→ 选择云环境
  cloudEnvId: 'cloud1-d7g29u4ivcfa4b668',

  // 周报订阅消息模板 ID，在公众平台「订阅消息」申请后填入
  weeklyReportTemplateId: '',

  appVersion: '2.0.0',

  isWeeklySubscribeReady: isWeeklySubscribeReady
};
