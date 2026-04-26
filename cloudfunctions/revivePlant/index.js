const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, message: '用户未登录' }

  const { plantId } = event
  if (!plantId) return { success: false, message: '缺少 plantId' }

  const db = cloud.database()
  const _ = db.command

  try {
    const plantRes = await db.collection('plants').doc(plantId).get()
    if (!plantRes.data) return { success: false, message: '植物不存在' }
    if (plantRes.data._openid !== openid) return { success: false, message: '无权限操作' }

    await db.collection('plants').doc(plantId).update({
      data: {
        isDead: false,
        deadDate: _.remove(),
        updateTime: db.serverDate()
      }
    })

    return { success: true }
  } catch (error) {
    console.error('revivePlant failed:', error)
    return { success: false, message: '操作失败，请重试' }
  }
}
