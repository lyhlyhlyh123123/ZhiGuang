// cloudfunctions/login/index.js
const cloud = require("wx-server-sdk");

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

exports.main = async (event, context) => {
  // 获取微信上下文
  const wxContext = cloud.getWXContext();

  // 直接返回 openid 等核心信息
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};