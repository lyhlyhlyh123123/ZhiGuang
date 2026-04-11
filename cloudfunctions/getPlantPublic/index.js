const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 公开查询植物详情 + 日记
 * 云函数以管理员身份运行，绕过数据库"仅创建者可读"权限
 * event.plantId: 植物 ID
 */
exports.main = async (event) => {
  const { plantId } = event;
  if (!plantId) return { success: false, error: '缺少 plantId' };

  try {
    const plantRes = await db.collection('plants').doc(plantId).get();
    const plant = plantRes.data;

    // ✅ 修复：使用分页查询避免数据遗漏
    const MAX_LIMIT = 100;
    let allJournals = [];
    let hasMore = true;
    let skip = 0;

    while (hasMore) {
      const journalRes = await db.collection('journals')
        .where({ plantId })
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(MAX_LIMIT)
        .get();
      
      allJournals = allJournals.concat(journalRes.data);
      hasMore = journalRes.data.length === MAX_LIMIT;
      skip += MAX_LIMIT;
      
      // 安全上限：防止无限循环
      if (skip > 1000) break;
    }

    return { success: true, plant, journals: allJournals };
  } catch (err) {
    console.error('【植光】getPlantPublic 失败:', err);
    return { success: false, error: String(err) };
  }
};
