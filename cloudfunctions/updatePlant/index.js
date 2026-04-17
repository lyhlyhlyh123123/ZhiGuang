const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 删除云存储中的文件
async function deleteCloudFiles(fileIDs) {
  if (!fileIDs || fileIDs.length === 0) return;

  try {
    await cloud.deleteFile({
      fileList: fileIDs
    });
    console.log(`清理了 ${fileIDs.length} 个文件`);
  } catch (error) {
    console.warn('清理文件失败:', error);
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, message: '用户未登录' }
  }

  const {
    plantId,
    nickname,
    species,
    location,
    source = '',
    remark = '',
    adoptDate,
    waterInterval,
    finalPhotoList = [], // 最终图片列表（应全部为已上传后的fileID）
    originalPhotoList = [] // 原始图片列表
  } = event

  // 数据验证
  if (!plantId || !nickname || !species || !location) {
    return { success: false, message: '缺少必要参数' }
  }

  if (finalPhotoList.length === 0) {
    return { success: false, message: '请至少保留一张照片' }
  }

  if (waterInterval < 1 || waterInterval > 30) {
    return { success: false, message: '浇水间隔应在1-30天之间' }
  }

  const db = cloud.database()

  try {
    // 1. 验证植物所有权
    const plantRes = await db.collection('plants').doc(plantId).get()
    if (!plantRes.data) {
      return { success: false, message: '植物不存在' }
    }
    if (plantRes.data._openid !== openid) {
      return { success: false, message: '无权限修改此植物' }
    }

    // 2. 防御式校验：不允许本地路径/占位符进入云函数
    const hasLocalPath = finalPhotoList.some(photo =>
      typeof photo !== 'string' ||
      !photo.trim() ||
      photo.startsWith('local://') ||
      photo.startsWith('wxfile://')
    )
    if (hasLocalPath) {
      return { success: false, message: '图片尚未上传完成，请重试' }
    }

    const completePhotoList = finalPhotoList.filter(Boolean)

    // 3. 更新数据库
    await db.collection('plants').doc(plantId).update({
      data: {
        nickname,
        species,
        location,
        source,
        remark,
        adoptDate,
        waterInterval,
        photoList: completePhotoList,
        photoFileID: completePhotoList[0] || '', // 第一张作为封面
        updateTime: db.serverDate()
      }
    })

    // 4. 清理被删除的图片
    const deletedPhotos = originalPhotoList.filter(
      oldPhoto => !completePhotoList.includes(oldPhoto) && oldPhoto.startsWith('cloud://')
    )

    if (deletedPhotos.length > 0) {
      // 异步清理，不阻塞主流程
      deleteCloudFiles(deletedPhotos).catch(err => {
        console.warn('清理删除图片失败:', err)
      })
    }

    return { success: true, data: { plantId } }

  } catch (error) {
    console.error('更新植物失败:', error)
    return { success: false, message: '更新失败，请重试' }
  }
}
