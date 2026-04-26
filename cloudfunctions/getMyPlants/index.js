const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 查询当前用户的所有植物（无数量限制）
 * 云函数以管理员身份运行，通过 openid 过滤
 *
 * 📌 性能优化建议：
 * 在云开发控制台为 plants 集合创建以下索引：
 * 1. 单字段索引：_openid (升序)
 * 2. 复合索引：_openid (升序) + createTime (降序)
 * 这将大幅提升查询速度，特别是在数据量大时
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { success: false, error: '未获取到用户身份' };

  // excludeDead: true 时只返回存活植物
  const excludeDead = event && event.excludeDead === true;
  const _ = db.command;
  const query = excludeDead
    ? { _openid: openid, isDead: _.neq(true) }
    : { _openid: openid };

  try {
    const MAX_LIMIT = 100; // 云函数单次最多查 100 条
    let plants = [];

    // ✅ 优化：先查总数（利用索引）
    const countRes = await db.collection('plants')
      .where(query)
      .count();
    const total = countRes.total;

    // 如果数据量不大，直接一次查询
    if (total <= MAX_LIMIT) {
      const res = await db.collection('plants')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(MAX_LIMIT)
        .get();
      return { success: true, plants: res.data, total };
    }

    // ✅ 优化：数据量大时并行查询，提升速度
    const batchCount = Math.ceil(total / MAX_LIMIT);
    const tasks = [];
    for (let i = 0; i < batchCount; i++) {
      tasks.push(
        db.collection('plants')
          .where(query)
          .orderBy('createTime', 'desc')
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .get()
      );
    }

    const results = await Promise.all(tasks);
    results.forEach(r => { plants = plants.concat(r.data); });

    console.log(`【小植书】成功获取 ${plants.length} 条植物数据`);
    return { success: true, plants, total };
  } catch (err) {
    console.error('【小植书】getMyPlants 失败:', err);
    return { success: false, error: String(err) };
  }
};
