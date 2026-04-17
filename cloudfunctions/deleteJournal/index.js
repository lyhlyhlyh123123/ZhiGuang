const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '用户未登录' }
  }

  const { journalId } = event
  if (!journalId) {
    return { success: false, message: '缺少日记ID' }
  }

  const db = cloud.database()

  try {
    const journalRes = await db.collection('journals').doc(journalId).get()
    const journal = journalRes.data

    if (!journal) {
      return { success: false, message: '日记不存在' }
    }

    if (journal._openid !== openid) {
      return { success: false, message: '无权限删除该日记' }
    }

    const photoIDs = [...new Set([
      ...(journal.photoList || []),
      journal.photoFileID
    ].filter(fileID => fileID && fileID.startsWith('cloud://')))]

    await db.collection('journals').doc(journalId).remove()

    if (photoIDs.length > 0) {
      await cloud.deleteFile({ fileList: photoIDs }).catch(err => {
        console.warn('deleteJournal 删除图片失败:', err)
      })
    }

    return { success: true, deletedPhotos: photoIDs }
  } catch (error) {
    console.error('deleteJournal 失败:', error)
    return { success: false, message: '删除日记失败，请重试' }
  }
}
