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

    const journalRes = await db.collection('journals')
      .where({ plantId })
      .orderBy('createTime', 'desc')
      .limit(100)
      .get();

    return { success: true, plant, journals: journalRes.data };
  } catch (err) {
    console.error('【植光】getPlantPublic 失败:', err);
    return { success: false, error: String(err) };
  }
};
