const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const EXCHANGE_RATE = 100;

async function getUser(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get();
  return res.data && res.data[0];
}

async function getOrCreateUser(openid) {
  let user = await getUser(openid);
  if (user) return user;
  const data = {
    nickName: '摸鱼达人',
    avatarUrl: '',
    totalMoneyAllTime: 0,
    totalExchangedRMB: 0,
    fishCoins: 0,
    rankId: 1,
    badges: []
  };
  const addRes = await db.collection('users').add({ data: data });
  const doc = await db.collection('users').doc(addRes._id).get();
  return doc.data;
}

async function getAvailableRMB(openid, user) {
  const exchanged = parseFloat(user.totalExchangedRMB) || 0;
  try {
    const recordsRes = await db.collection('records').where({ _openid: openid }).get();
    let earned = 0;
    (recordsRes.data || []).forEach(function (r) {
      earned += parseFloat(r.moneyEarned) || 0;
    });
    if (earned > 0) {
      return Math.max(0, Math.round((earned - exchanged) * 100) / 100);
    }
  } catch (e) {
    console.warn('getAvailableRMB', e);
  }
  return Math.max(0, Math.round((parseFloat(user.totalMoneyAllTime) || 0) * 100) / 100);
}

exports.main = async function (event) {
  const amountRMB = parseFloat(event.amountRMB);
  if (isNaN(amountRMB) || amountRMB <= 0) {
    return { ok: false, message: '请输入有效金额' };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const user = await getOrCreateUser(openid);
  const balance = await getAvailableRMB(openid, user);

  if (amountRMB > balance + 0.001) {
    return { ok: false, message: '人民币余额不足（可兑换 ¥' + balance.toFixed(2) + '）' };
  }

  const fishCoinsGained = Math.floor(amountRMB * EXCHANGE_RATE);
  const newBalance = Math.round((balance - amountRMB) * 100) / 100;
  const newCoins = (user.fishCoins || 0) + fishCoinsGained;
  const newExchanged = Math.round(((parseFloat(user.totalExchangedRMB) || 0) + amountRMB) * 100) / 100;

  await db.collection('users').doc(user._id).update({
    data: {
      totalMoneyAllTime: newBalance,
      totalExchangedRMB: newExchanged,
      fishCoins: newCoins
    }
  });

  return {
    ok: true,
    amountRMB: amountRMB,
    fishCoinsGained: fishCoinsGained,
    totalMoneyAllTime: newBalance,
    fishCoins: newCoins,
    totalExchangedRMB: newExchanged,
    exchangeRate: EXCHANGE_RATE
  };
};
