const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 查询当前用户的所有植物（无数量限制）
 * 云函数以管理员身份运行，通过 openid 过滤
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { success: false, error: '未获取到用户身份' };

  try {
    const MAX_LIMIT = 100; // 云函数单次最多查 100 条
    let plants = [];
    let skip = 0;

    // 先查总数
    const countRes = await db.collection('plants')
      .where({ _openid: openid })
      .count();
    const total = countRes.total;

    // 分批拉取所有数据
    const batchCount = Math.ceil(total / MAX_LIMIT);
    const tasks = [];
    for (let i = 0; i < batchCount; i++) {
      tasks.push(
        db.collection('plants')
          .where({ _openid: openid })
          .orderBy('createTime', 'desc')
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .get()
      );
    }

    const results = await Promise.all(tasks);
    results.forEach(r => { plants = plants.concat(r.data); });

    return { success: true, plants, total };
  } catch (err) {
    console.error('【植光】getMyPlants 失败:', err);
    return { success: false, error: String(err) };
  }
};
