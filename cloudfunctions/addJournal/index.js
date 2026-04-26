const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '用户未登录' }
  }

  const {
    plantId,
    selectedActions = [],
    note = '',
    photoList = [],
    createTime,
    newFileIDs = []
  } = event

  if (!plantId) {
    return { success: false, message: '缺少植物ID' }
  }

  if (!selectedActions.length && !note.trim() && photoList.length === 0) {
    return { success: false, message: '请至少填写一项内容' }
  }

  const db = cloud.database()

  try {
    const plantRes = await db.collection('plants').doc(plantId).get()
    const plant = plantRes.data

    if (!plant) {
      return { success: false, message: '植物不存在' }
    }

    if (plant._openid !== openid) {
      return { success: false, message: '无权限为该植物添加日记' }
    }

    const now = createTime ? new Date(createTime) : new Date()
    const journalData = {
      plantId,
      plantName: plant.nickname || '',
      selectedActions,
      note: note || '',
      photoList,
      createTime: now,
      updateTime: db.serverDate(),
      _openid: openid
    }

    const addRes = await db.collection('journals').add({ data: journalData })

    // 更新植物养护任务的 lastDate
    const CARE_TASK_VALUES = ['water', 'fertilize', 'repot', 'prune', 'pesticide', 'fungicide']
    const actionValues = selectedActions
      .map(a => a.value)
      .filter(v => CARE_TASK_VALUES.includes(v))

    const today = new Date()
    // 获取北京时间日期字符串
    const cstDate = new Date(today.getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0]
    const hasWater = actionValues.includes('water')

    const plantUpdate = { updateTime: db.serverDate() }

    if (hasWater) {
      plantUpdate.lastWaterDate = today
    }

    // 更新 careTasks 数组中对应任务的 lastDate
    if (actionValues.length > 0 && plant.careTasks && plant.careTasks.length > 0) {
      const updatedTasks = plant.careTasks.map(task => {
        if (actionValues.includes(task.taskId)) {
          return { ...task, lastDate: cstDate }
        }
        return task
      })
      plantUpdate.careTasks = updatedTasks
    }

    await db.collection('plants').doc(plantId).update({ data: plantUpdate })

    return { success: true, data: { journalId: addRes._id } }
  } catch (error) {
    console.error('addJournal 失败:', error)
    if (newFileIDs.length > 0) {
      await cloud.deleteFile({ fileList: newFileIDs }).catch(() => {})
    }
    return { success: false, message: '添加日记失败，请重试' }
  }
}
