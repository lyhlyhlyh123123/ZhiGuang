/**
 * 图片处理工具函数
 * 用于多图片上传和管理功能
 */

/**
 * 获取植物图片列表（兼容新旧数据）
 * @param {Object} plant - 植物对象
 * @returns {Array} 图片URL数组
 */
export function getPlantPhotos(plant) {
  if (!plant) return [];
  
  // 优先使用新字段 photoList
  if (plant.photoList && Array.isArray(plant.photoList) && plant.photoList.length > 0) {
    return plant.photoList;
  }
  
  // 降级使用旧字段 photoFileID
  if (plant.photoFileID) {
    return [plant.photoFileID];
  }
  
  return [];
}

/**
 * 获取植物封面图（第一张图片）
 * @param {Object} plant - 植物对象
 * @returns {String} 封面图URL
 */
export function getCoverPhoto(plant) {
  const photos = getPlantPhotos(plant);
  return photos[0] || '/images/avatar.png';
}

/**
 * 压缩图片
 * @param {String} filePath - 图片路径
 * @param {Number} quality - 压缩质量 0-100
 * @returns {Promise<String>} 压缩后的图片路径
 */
export function compressImage(filePath, quality = 80) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality,
      success: res => resolve(res.tempFilePath),
      fail: () => {
        // ✅ 修复：压缩失败时降级使用原图，而不是直接抛错
        console.warn('【植光】图片压缩失败，使用原图:', filePath);
        resolve(filePath);
      }
    });
  });
}

/**
 * 批量上传图片到云存储
 * @param {Array} imagePaths - 本地图片路径数组
 * @param {String} folder - 云存储文件夹名称
 * @param {Boolean} compress - 是否压缩
 * @returns {Promise<Object>} { success: Array<fileID>, failed: Number }
 */
export async function uploadImages(imagePaths, folder = 'plant-photos', compress = true) {
  if (!imagePaths || imagePaths.length === 0) {
    return { success: [], failed: 0 };
  }

  const uploadTasks = imagePaths.map(async (path, index) => {
    try {
      // 压缩图片（可选）
      const finalPath = compress ? await compressImage(path) : path;
      
      // 生成唯一的云存储路径
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const cloudPath = `${folder}/${timestamp}-${index}-${random}.jpg`;
      
      // 上传到云存储
      const res = await wx.cloud.uploadFile({
        cloudPath,
        filePath: finalPath
      });
      
      return res.fileID;
    } catch (err) {
      console.error('【植光】上传图片失败:', path, err);
      throw err;
    }
  });

  // ✅ 修复：使用 allSettled 处理部分失败的情况
  const results = await Promise.allSettled(uploadTasks);
  const successFiles = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  
  const failedCount = results.filter(r => r.status === 'rejected').length;
  
  if (failedCount > 0) {
    console.warn(`【植光】${failedCount}/${imagePaths.length} 张图片上传失败`);
  }
  
  // 如果全部失败，抛出错误
  if (successFiles.length === 0 && imagePaths.length > 0) {
    throw new Error('所有图片上传失败');
  }
  
  return { success: successFiles, failed: failedCount };
}

/**
 * 验证图片数量
 * @param {Number} currentCount - 当前图片数量
 * @param {Number} maxCount - 最大允许数量
 * @returns {Boolean} 是否可以继续添加
 */
export function canAddMoreImages(currentCount, maxCount = 9) {
  return currentCount < maxCount;
}

/**
 * 获取可添加的图片数量
 * @param {Number} currentCount - 当前图片数量
 * @param {Number} maxCount - 最大允许数量
 * @returns {Number} 还能添加的数量
 */
export function getRemainingCount(currentCount, maxCount = 9) {
  return Math.max(0, maxCount - currentCount);
}

/**
 * 移动数组元素位置
 * @param {Array} arr - 数组
 * @param {Number} fromIndex - 源索引
 * @param {Number} toIndex - 目标索引
 * @returns {Array} 新数组
 */
export function moveArrayItem(arr, fromIndex, toIndex) {
  const newArr = [...arr];
  const item = newArr.splice(fromIndex, 1)[0];
  newArr.splice(toIndex, 0, item);
  return newArr;
}

/**
 * 删除数组指定索引的元素
 * @param {Array} arr - 数组
 * @param {Number} index - 索引
 * @returns {Array} 新数组
 */
export function removeArrayItem(arr, index) {
  const newArr = [...arr];
  newArr.splice(index, 1);
  return newArr;
}
