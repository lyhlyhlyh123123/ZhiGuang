const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const MAX_LIMIT = 100

async function fetchAll(buildQuery) {
  let all = []
  let skip = 0

  while (true) {
    const res = await buildQuery()
      .skip(skip)
      .limit(MAX_LIMIT)
      .get()

    const list = res.data || []
    all = all.concat(list)

    if (list.length < MAX_LIMIT) break
    skip += MAX_LIMIT
  }

  return all
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '用户未登录' }
  }

  const { year, month } = event
  if (!year || !month) {
    return { success: false, message: '缺少年月参数' }
  }

  const db = cloud.database()
  const _ = db.command

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  try {
    const plantList = await fetchAll(() =>
      db.collection('plants')
        .where({ _openid: openid })
        .field({ _id: true })
    )
    const plantIds = (plantList || []).map(p => p._id)

    const daySet = new Set()

    const addDayKeys = (records = []) => {
      records.forEach(record => {
        const d = new Date(record.createTime)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        daySet.add(key)
      })
    }

    // 1. 当前用户 openid 的日志（只取 createTime，用于日历打点）
    let skip = 0
    while (true) {
      const res = await db.collection('journals')
        .where({
          _openid: openid,
          createTime: _.gte(start).and(_.lt(end))
        })
        .field({ createTime: true })
        .skip(skip)
        .limit(MAX_LIMIT)
        .get()

      addDayKeys(res.data)
      if (res.data.length < MAX_LIMIT) break
      skip += MAX_LIMIT
    }

    // 2. 补充当前用户植物相关日志（兼容缺少 _openid 的旧记录）
    if (plantIds.length > 0) {
      // _.in 有数量上限，这里分块处理
      const CHUNK_SIZE = 100
      for (let i = 0; i < plantIds.length; i += CHUNK_SIZE) {
        const chunk = plantIds.slice(i, i + CHUNK_SIZE)
        skip = 0
        while (true) {
          const res = await db.collection('journals')
            .where({
              plantId: _.in(chunk),
              createTime: _.gte(start).and(_.lt(end))
            })
            .field({ createTime: true })
            .skip(skip)
            .limit(MAX_LIMIT)
            .get()

          addDayKeys(res.data)
          if (res.data.length < MAX_LIMIT) break
          skip += MAX_LIMIT
        }
      }
    }

    return { success: true, daysWithRecord: Array.from(daySet) }
  } catch (error) {
    console.error('getCalendarMonthStats 失败:', error)
    return { success: false, message: '加载日历统计失败' }
  }
}
