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
    note = ''
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const hasWater = selectedActions.some(a => a.label === '浇水')

    const journalAddTasks = selectedIds.map(plantId => {
      const plant = plantMap[plantId]
      return db.collection('journals').add({
        data: {
          plantId,
          plantName: plant ? plant.nickname : '',
          selectedActions,
          note: note || '',
          photoList: [],
          createTime: today,
          updateTime: db.serverDate(),
          _openid: openid
        }
      })
    })

    await Promise.all(journalAddTasks)

    if (hasWater) {
      const plantUpdateTasks = selectedIds.map(plantId => {
        return db.collection('plants').doc(plantId).update({
          data: {
            lastWaterDate: today,
            updateTime: db.serverDate()
          }
        })
      })
      await Promise.all(plantUpdateTasks)
    }

    return { success: true, data: { journalCount: selectedIds.length } }
  } catch (error) {
    console.error('addBatchJournal 失败:', error)
    return { success: false, message: '批量记录失败，请重试' }
  }
}
