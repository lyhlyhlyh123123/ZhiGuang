const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 点赞/取消点赞云函数
 * 以管理员身份运行，绕过数据库权限限制
 * event.plantId: 植物 ID
 * event.openid: 用户 openid (可选，默认使用云端获取)
 */
exports.main = async (event, context) => {
  const { plantId } = event;
  // 优先使用传入的 openid，否则使用云端 OPENID，都没有则使用匿名ID
  let userId = event.openid || context.OPENID;
  
  // 如果用户未登录，使用小程序传入的匿名标识
  if (!userId) {
    userId = event.anonymousId || `anonymous_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  if (!plantId) {
    return { success: false, error: '缺少 plantId' };
  }

  try {
    // 获取当前植物的点赞列表
    const plantRes = await db.collection('plants').doc(plantId).get();
    
    if (!plantRes.data) {
      return { success: false, error: '植物不存在' };
    }

    const plant = plantRes.data;
    const likes = plant.likes || [];
    const hasLiked = likes.includes(userId);

    // 执行点赞或取消点赞操作
    const updateData = hasLiked
      ? { likes: _.pull(userId) }  // 取消点赞：从数组中移除
      : { likes: _.addToSet(userId) };  // 点赞：添加到数组(自动去重)
    
    await db.collection('plants').doc(plantId).update({
      data: updateData
    });

    // 返回更新后的状态
    const newLikeCount = hasLiked ? likes.length - 1 : likes.length + 1;
    const newHasLiked = !hasLiked;

    return {
      success: true,
      hasLiked: newHasLiked,
      likeCount: newLikeCount,
      action: hasLiked ? 'unlike' : 'like'
    };
  } catch (err) {
    console.error('【小植书】toggleLike 失败:', err);
    return {
      success: false,
      error: err.message || String(err)
    };
  }
};
