const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '用户未登录' }
  }

  const { plantId } = event

  if (!plantId) {
    return { success: false, message: '缺少植物ID' }
  }

  const db = cloud.database()

  try {
    const plantRes = await db.collection('plants').doc(plantId).get()

    if (!plantRes.data) {
      return { success: false, message: '植物不存在' }
    }

    // 验证所有权
    if (plantRes.data._openid !== openid) {
      return { success: false, message: '无权限查看此植物' }
    }

    return { success: true, data: plantRes.data }

  } catch (error) {
    console.error('获取植物详情失败:', error)
    return { success: false, message: '获取失败，请重试' }
  }
}