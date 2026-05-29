const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 与小程序 config.js 中 weeklyReportTemplateId 保持一致
const TEMPLATE_ID = '';

exports.main = async function () {
  if (!TEMPLATE_ID) {
    console.log('请配置 TEMPLATE_ID');
    return { sent: 0 };
  }

  const usersRes = await db.collection('users').where({ subscribeWeekly: true }).get();
  const users = usersRes.data || [];
  let sent = 0;

  const now = new Date();
  const day = now.getDay() || 7;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - day - 6);
  lastMonday.setHours(0, 0, 0, 0);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const openid = user._openid;
    if (!openid) continue;

    const recordsRes = await db
      .collection('records')
      .where({
        _openid: openid,
        timestamp: _.gte(lastMonday.getTime()).and(_.lte(lastSunday.getTime()))
      })
      .get();

    let amount = 0;
    (recordsRes.data || []).forEach(function (r) {
      amount += r.moneyEarned || 0;
    });
    amount = Math.round(amount * 100) / 100;
    const percent = 70 + Math.floor(Math.random() * 30);

    try {
      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: TEMPLATE_ID,
        page: 'pages/details/details?weekly=1',
        data: {
          amount: { value: String(amount) },
          percent: { value: String(percent) }
        }
      });
      sent++;
      await db.collection('logs').add({
        data: {
          openid: openid,
          amount: amount,
          percent: percent,
          sentAt: Date.now()
        }
      });
    } catch (e) {
      console.error('send fail', openid, e);
    }
  }

  return { sent: sent };
};
