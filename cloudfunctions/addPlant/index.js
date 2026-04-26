const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '用户未登录' }
  }

  const {
    nickname,
    species,
    location,
    source = '',
    remark = '',
    adoptDate,
    photoList = [],
    waterInterval = 7,
    carePlanEnabled = true,
    careTasks = []
  } = event

  if (!nickname || !species || !location) {
    return { success: false, message: '请填写昵称、品种和位置' }
  }

  if (photoList.length === 0) {
    return { success: false, message: '请至少上传一张照片' }
  }

  // 验证 careTasks interval 范围
  if (careTasks.some(t => t.interval < 1 || t.interval > 365)) {
    return { success: false, message: '养护周期应在1-365天之间' }
  }

  // 取水任务 interval 同步到旧字段，保证旧逻辑兼容
  const waterTask = careTasks.find(t => t.taskId === 'water')
  const finalWaterInterval = waterTask ? waterTask.interval : waterInterval

  const db = cloud.database()

  try {
    const today = new Date()
    const cstDate = new Date(today.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0]
    const finalAdoptDate = adoptDate || cstDate

    const result = await db.collection('plants').add({
      data: {
        nickname,
        species,
        location,
        source,
        remark,
        adoptDate: finalAdoptDate,
        photoList,
        photoFileID: photoList[0] || '',
        waterInterval: finalWaterInterval,
        lastWaterDate: today,
        carePlanEnabled,
        careTasks,
        _openid: openid,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    return { success: true, data: result }
  } catch (error) {
    console.error('添加植物失败:', error)
    return { success: false, message: '添加失败，请重试' }
  }
}