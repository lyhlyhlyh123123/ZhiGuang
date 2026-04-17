const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const MAX_LIMIT = 100
const IN_CHUNK_SIZE = 100

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

  const { date } = event
  if (!date) {
    return { success: false, message: '缺少日期参数' }
  }

  const [year, month, day] = date.split('-').map(v => Number(v))
  if (!year || !month || !day) {
    return { success: false, message: '日期格式错误' }
  }

  const db = cloud.database()
  const _ = db.command
  const start = new Date(year, month - 1, day, 0, 0, 0)
  const end = new Date(year, month - 1, day + 1, 0, 0, 0)

  try {
    const plantList = await fetchAll(() =>
      db.collection('plants')
        .where({ _openid: openid })
        .field({ _id: true })
    )
    const plantIds = (plantList || []).map(p => p._id)

    const journalQuery1 = {
      _openid: openid,
      createTime: _.gte(start).and(_.lt(end))
    }
    const journals1 = await fetchAll(() =>
      db.collection('journals')
        .where(journalQuery1)
        .orderBy('createTime', 'desc')
    )

    let journals = journals1 || []
    const existed = new Set(journals.map(j => j._id))

    if (plantIds.length > 0) {
      const plantIdChunks = chunkArray(plantIds, IN_CHUNK_SIZE)
      for (const ids of plantIdChunks) {
        const journals2 = await fetchAll(() =>
          db.collection('journals')
            .where({
              plantId: _.in(ids),
              createTime: _.gte(start).and(_.lt(end))
            })
            .orderBy('createTime', 'desc')
        )

        journals2.forEach(journal => {
          if (!existed.has(journal._id)) {
            existed.add(journal._id)
            journals.push(journal)
          }
        })
      }
    }

    journals.sort((a, b) => new Date(b.createTime) - new Date(a.createTime))

    const journalPlantIds = [...new Set(journals.map(j => j.plantId).filter(Boolean))]
    let plants = []

    if (journalPlantIds.length > 0) {
      const journalPlantIdChunks = chunkArray(journalPlantIds, IN_CHUNK_SIZE)
      for (const ids of journalPlantIdChunks) {
        const plantRes = await db.collection('plants')
          .where({ _openid: openid, _id: _.in(ids) })
          .field({ _id: true, species: true, location: true })
          .get()
        plants = plants.concat(plantRes.data || [])
      }
    }

    return { success: true, journals, plants }
  } catch (error) {
    console.error('getCalendarDayJournals 失败:', error)
    return { success: false, message: '加载当天日记失败' }
  }
}
