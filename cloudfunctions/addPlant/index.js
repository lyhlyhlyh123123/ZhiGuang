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
    waterInterval = 7
  } = event

  // 数据验证
  if (!nickname || !species || !location) {
    return { success: false, message: '请填写昵称、品种和位置' }
  }

  if (photoList.length === 0) {
    return { success: false, message: '请至少上传一张照片' }
  }

  if (waterInterval < 1 || waterInterval > 30) {
    return { success: false, message: '浇水间隔应在1-30天之间' }
  }

  const db = cloud.database()
  const _ = db.command

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 如果没有提供领养日期，使用今天
    const finalAdoptDate = adoptDate || `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

    const result = await db.collection('plants').add({
      data: {
        nickname,
        species,
        location,
        source,
        remark,
        adoptDate: finalAdoptDate,
        photoList,
        photoFileID: photoList[0] || '', // 第一张作为封面
        waterInterval,
        lastWaterDate: today,
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