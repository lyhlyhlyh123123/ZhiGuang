const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const IN_CHUNK_SIZE = 100

function chunkArray(list, size) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }
  return chunks
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '用户未登录' }
  }

  const {
    selectedIds = [],
    selectedActions = [],
    note = '',
    createTime = ''
  } = event

  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return { success: false, message: '请选择植物' }
  }

  if (!Array.isArray(selectedActions) || selectedActions.length === 0) {
    return { success: false, message: '请选择操作' }
  }

  const db = cloud.database()
  const _ = db.command

  try {
    // _.in 有数量上限，按分片查询并合并
    const uniqueIds = [...new Set(selectedIds)]
    const idChunks = chunkArray(uniqueIds, IN_CHUNK_SIZE)
    let plants = []

    for (const ids of idChunks) {
      const plantRes = await db.collection('plants')
        .where({ _openid: openid, _id: _.in(ids) })
        .get()
      plants = plants.concat(plantRes.data || [])
    }

    const plantMap = plants.reduce((map, plant) => {
      map[plant._id] = plant
      return map
    }, {})

    const hasInvalidPlant = selectedIds.some(id => !plantMap[id])
    if (hasInvalidPlant) {
      return { success: false, message: '请选择有效的植物' }
    }

    // 直接用客户端传来的时间戳，保留真实的北京时间
    const now = createTime ? new Date(createTime) : new Date()
    // 用北京时间偏移计算今天的日期字符串（UTC+8）
    const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const todayStr = cst.toISOString().split('T')[0]

    const CARE_TASK_VALUES = ['water', 'fertilize', 'repot', 'prune', 'pesticide', 'fungicide']
    const actionValues = selectedActions
      .map(a => a.value)
      .filter(v => CARE_TASK_VALUES.includes(v))
    const hasWater = actionValues.includes('water')

    const journalAddTasks = selectedIds.map(plantId => {
      const plant = plantMap[plantId]
      return db.collection('journals').add({
        data: {
          plantId,
          plantName: plant ? plant.nickname : '',
          selectedActions,
          note: note || '',
          photoList: [],
          createTime: now,
          updateTime: db.serverDate(),
          _openid: openid
        }
      })
    })

    await Promise.all(journalAddTasks)

    if (actionValues.length > 0) {
      const plantUpdateTasks = selectedIds.map(plantId => {
        const plant = plantMap[plantId]
        const updateData = { updateTime: db.serverDate() }

        // 兼容旧数据
        if (hasWater) updateData.lastWaterDate = now

        // 更新 careTasks 数组
        if (plant && plant.careTasks && plant.careTasks.length > 0) {
          updateData.careTasks = plant.careTasks.map(task => {
            if (actionValues.includes(task.taskId)) {
              return { ...task, lastDate: todayStr }
            }
            return task
          })
        }

        return db.collection('plants').doc(plantId).update({ data: updateData })
      })
      await Promise.all(plantUpdateTasks)
    }

    return { success: true, data: { journalCount: selectedIds.length } }
  } catch (error) {
    console.error('addBatchJournal 失败:', error)
    return { success: false, message: '批量记录失败，请重试' }
  }
}
