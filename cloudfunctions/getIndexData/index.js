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

  const db = cloud.database()
  const _ = db.command

  try {
    // 北京时间今天 00:00:00 对应的 UTC 时间（与 getCalendarDayJournals 保持一致）
    const now = new Date()
    const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const todayStart = new Date(Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate()) - 8 * 60 * 60 * 1000)

    const plants = await fetchAll(() =>
      db.collection('plants')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
    )

    const todayJournals = await fetchAll(() =>
      db.collection('journals')
        .where({ _openid: openid, createTime: _.gte(todayStart) })
        .orderBy('createTime', 'desc')
    )

    return {
      success: true,
      plants,
      todayJournals
    }
  } catch (error) {
    console.error('getIndexData 失败:', error)
    return { success: false, message: '加载首页数据失败' }
  }
}
