const { getTempFileURLs } = require('./imageCache.js');
const { smartCompress } = require('./imageCompressor.js');

// ==========================================
// 1. 完全保留的老代码（一字不改，保证首页和旧逻辑绝对不出错）
// ==========================================
function getPlantPhotos(plant) {
  if (!plant) return [];
  if (plant.photoList && Array.isArray(plant.photoList) && plant.photoList.length > 0) {
    return plant.photoList;
  }
  if (plant.photoFileID) {
    return [plant.photoFileID];
  }
  return [];
}

function getCoverPhoto(plant) {
  const photos = getPlantPhotos(plant);
  return photos[0] || '/images/avatar.png';
}

// ==========================================
// 2. 专为详情页轮播图新增的缓存方法（新代码用这个）
// ==========================================
async function getPlantPhotosWithCache(plant) {
  const rawPhotos = getPlantPhotos(plant);
  if (rawPhotos.length === 0) return [];

  const cloudIDs = rawPhotos.filter(id => typeof id === 'string' && id.startsWith('cloud://'));

  if (cloudIDs.length > 0) {
    try {
      const urlArray = await getTempFileURLs(cloudIDs);
      const urlMap = urlArray.reduce((acc, curr) => {
        acc[curr.fileID] = curr.tempFileURL;
        return acc;
      }, {});
      return rawPhotos.map(id => urlMap[id] || id);
    } catch (err) {
      console.warn('【植光】轮播图缓存转换失败，降级原图', err);
      return rawPhotos;
    }
  }
  return rawPhotos;
}

/**
 * 压缩图片（固定质量，供外部直接调用）
 * @param {String} filePath - 图片路径
 * @param {Number} quality - 压缩质量 0-100
 * @returns {Promise<String>} 压缩后的图片路径
 */
function compressImage(filePath, quality = 80) {
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality,
      success: res => resolve(res.tempFilePath),
      fail: () => {
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
 * @param {Boolean} compress - 是否在上传前压缩（选图时已压缩的传 false）
 * @returns {Promise<Object>} { success: Array<fileID>, failed: Number }
 */
async function uploadImages(imagePaths, folder = 'plant-photos', compress = true) {
  if (!imagePaths || imagePaths.length === 0) {
    return { success: [], failed: 0 };
  }

  const uploadTasks = imagePaths.map(async (path, index) => {
    try {
      // 压缩图片（可选）—— 使用 smartCompress 动态分档
      const finalPath = compress ? await smartCompress(path) : path;

      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const cloudPath = `${folder}/${timestamp}-${index}-${random}.jpg`;

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

  const results = await Promise.allSettled(uploadTasks);
  const successFiles = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const failedCount = results.filter(r => r.status === 'rejected').length;

  if (failedCount > 0) {
    console.warn(`【植光】${failedCount}/${imagePaths.length} 张图片上传失败`);
  }

  if (successFiles.length === 0 && imagePaths.length > 0) {
    throw new Error('所有图片上传失败');
  }

  return { success: successFiles, failed: failedCount };
}

function canAddMoreImages(currentCount, maxCount = 9) {
  return currentCount < maxCount;
}

function getRemainingCount(currentCount, maxCount = 9) {
  return Math.max(0, maxCount - currentCount);
}

function moveArrayItem(arr, fromIndex, toIndex) {
  const newArr = [...arr];
  const item = newArr.splice(fromIndex, 1)[0];
  newArr.splice(toIndex, 0, item);
  return newArr;
}

function removeArrayItem(arr, index) {
  const newArr = [...arr];
  newArr.splice(index, 1);
  return newArr;
}

/**
 * 获取带缓存的单张封面图（适用于分享卡片、外围单图场景）
 * @param {Object} plant - 植物对象
 * @returns {Promise<String>} 转换后的临时 URL 或原图 ID
 */
async function getCoverPhotoWithCache(plant) {
  const rawCover = getCoverPhoto(plant);

  if (!rawCover || typeof rawCover !== 'string' || !rawCover.startsWith('cloud://')) {
    return rawCover;
  }

  try {
    const urlArray = await getTempFileURLs([rawCover]);
    const urlMap = urlArray.reduce((acc, curr) => {
      acc[curr.fileID] = curr.tempFileURL;
      return acc;
    }, {});
    return urlMap[rawCover] || rawCover;
  } catch (err) {
    console.warn('【植光】封面图缓存转换失败，降级原图', err);
    return rawCover;
  }
}

module.exports = {
  getPlantPhotos,
  getCoverPhoto,
  getPlantPhotosWithCache,
  getCoverPhotoWithCache,
  compressImage,
  uploadImages,
  canAddMoreImages,
  getRemainingCount,
  moveArrayItem,
  removeArrayItem
};
