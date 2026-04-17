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
    return { success: false, message: '缺少 plantId' }
  }

  const db = cloud.database()
  const MAX_LIMIT = 100

  try {
    const plantRes = await db.collection('plants').doc(plantId).get()
    const plant = plantRes.data

    if (!plant) {
      return { success: false, message: '植物不存在' }
    }

    if (plant._openid !== openid) {
      return { success: false, message: '无权限删除该植物' }
    }

    let allJournals = []
    let skip = 0
    while (true) {
      const journalRes = await db.collection('journals')
        .where({ plantId })
        .skip(skip)
        .limit(MAX_LIMIT)
        .get()

      allJournals = allJournals.concat(journalRes.data)
      if (journalRes.data.length < MAX_LIMIT) break

      skip += MAX_LIMIT
      if (skip > 1000) break
    }

    const photoIDs = [...new Set([
      ...(plant.photoList || []),
      plant.photoFileID,
      ...allJournals.flatMap(j => j.photoList || []),
      ...allJournals.map(j => j.photoFileID).filter(id => id)
    ].filter(id => id && id.startsWith('cloud://')))]

    const deleteJournalTasks = allJournals.map(journal =>
      db.collection('journals').doc(journal._id).remove()
    )
    await Promise.all(deleteJournalTasks)

    await db.collection('plants').doc(plantId).remove()

    if (photoIDs.length > 0) {
      await cloud.deleteFile({ fileList: photoIDs }).catch(err => {
        console.warn('deletePlant 删除图片失败:', err)
      })
    }

    return { success: true, deletedPhotos: photoIDs }
  } catch (error) {
    console.error('deletePlant 失败:', error)
    return { success: false, message: '删除植物失败，请重试' }
  }
}
