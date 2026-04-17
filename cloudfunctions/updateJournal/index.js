const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '用户未登录' }
  }

  const {
    journalId,
    selectedActions = [],
    note = '',
    photoList = [],
    createTime,
    deletedPhotos = [],
    newFileIDs = []
  } = event

  if (!journalId) {
    return { success: false, message: '缺少日记ID' }
  }

  if (!selectedActions.length && !note.trim() && photoList.length === 0) {
    return { success: false, message: '请至少填写一项内容' }
  }

  const db = cloud.database()

  try {
    const journalRes = await db.collection('journals').doc(journalId).get()
    const journal = journalRes.data

    if (!journal) {
      return { success: false, message: '日记不存在' }
    }

    if (journal._openid !== openid) {
      return { success: false, message: '无权限修改该日记' }
    }

    const updateData = {
      selectedActions,
      note: note || '',
      photoList,
      createTime: createTime ? new Date(createTime) : db.serverDate(),
      updateTime: db.serverDate()
    }

    await db.collection('journals').doc(journalId).update({ data: updateData })

    if (deletedPhotos.length > 0) {
      await cloud.deleteFile({ fileList: deletedPhotos }).catch(() => {})
    }

    return { success: true }
  } catch (error) {
    console.error('updateJournal 失败:', error)
    if (newFileIDs.length > 0) {
      await cloud.deleteFile({ fileList: newFileIDs }).catch(() => {})
    }
    return { success: false, message: '更新日记失败，请重试' }
  }
}
