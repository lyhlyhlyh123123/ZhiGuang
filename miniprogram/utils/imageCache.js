/**
 * 图片缓存管理器 - 减少CDN流量和云函数调用
 * 
 * 核心策略：
 * 1. 缓存临时链接（有效期2小时）
 * 2. 本地存储缓存持久化
 * 3. 自动清理过期缓存
 */

// 内存缓存（当前会话）
const memoryCache = new Map();

// 临时链接有效期：110分钟（留10分钟缓冲）
const TEMP_URL_EXPIRE = 110 * 60 * 1000;

// 本地存储key前缀
const STORAGE_PREFIX = 'img_cache_';

// 最大缓存数量（避免占用过多存储）
const MAX_CACHE_SIZE = 100;

/**
 * 获取缓存的临时链接
 * @param {String} fileID - 云存储文件ID
 * @returns {String|null} 临时链接（有效）或 null
 */
function getCachedTempURL(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) {
    return null;
  }

  // 1. 优先从内存缓存读取
  const memoryCached = memoryCache.get(fileID);
  if (memoryCached) {
    const now = Date.now();
    if (now - memoryCached.time < TEMP_URL_EXPIRE) {
      return memoryCached.url;
    } else {
      // 过期，删除
      memoryCache.delete(fileID);
    }
  }

  // 2. 从本地存储读取
  try {
    const storageKey = STORAGE_PREFIX + fileID;
    const cached = wx.getStorageSync(storageKey);
    if (cached && cached.url && cached.time) {
      const now = Date.now();
      if (now - cached.time < TEMP_URL_EXPIRE) {
        // 同步到内存缓存
        memoryCache.set(fileID, cached);
        return cached.url;
      } else {
        // 过期，删除
        wx.removeStorageSync(storageKey);
      }
    }
  } catch (err) {
    console.warn('⚠️ 读取图片缓存失败:', err);
  }

  return null;
}

/**
 * 设置临时链接缓存
 * @param {String} fileID - 云存储文件ID
 * @param {String} tempURL - 临时链接
 */
function setCachedTempURL(fileID, tempURL) {
  if (!fileID || !tempURL) return;

  const cacheData = {
    url: tempURL,
    time: Date.now()
  };

  // 1. 写入内存缓存
  memoryCache.set(fileID, cacheData);

  // 2. 写入本地存储（异步，失败不影响）
  try {
    const storageKey = STORAGE_PREFIX + fileID;
    wx.setStorageSync(storageKey, cacheData);
    
    // 维护缓存数量，超过限制时清理最旧的
    cleanupOldCache();
  } catch (err) {
    console.warn('⚠️ 写入缓存失败:', err);
  }
}

/**
 * 批量获取临时链接（带缓存优化）
 * @param {Array<String>} fileIDs - 云存储文件ID数组
 * @returns {Promise<Array>} [{fileID, tempFileURL}]
 */
function getTempFileURLs(fileIDs) {
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) {
    return Promise.resolve([]);
  }

  const result = [];
  const uncachedIDs = [];

  // 分离已缓存和未缓存的
  fileIDs.forEach(fileID => {
    const cachedURL = getCachedTempURL(fileID);
    if (cachedURL) {
      result.push({ fileID, tempFileURL: cachedURL, fromCache: true });
    } else {
      uncachedIDs.push(fileID);
    }
  });

  // 全部命中缓存
  if (uncachedIDs.length === 0) {
    return Promise.resolve(result);
  }

  // 只在需要请求较多时才输出日志
  if (uncachedIDs.length > 10) {
    console.log(`📡 需要请求 ${uncachedIDs.length} 张图片的临时链接`);
  }

  // 请求未缓存的临时链接
  return wx.cloud.getTempFileURL({
    fileList: uncachedIDs
  }).then(res => {
    if (res.fileList && Array.isArray(res.fileList)) {
      res.fileList.forEach(item => {
        if (item.tempFileURL && item.status === 0) {
          // 缓存新获取的临时链接
          setCachedTempURL(item.fileID, item.tempFileURL);
          result.push(item);
        } else {
          console.error('❌ 获取临时链接失败:', item);
        }
      });
    }
    return result;
  }).catch(err => {
    console.error('❌ 批量获取临时链接失败:', err);
    // 返回已缓存的部分
    return result;
  });
}

/**
 * 获取单个临时链接（带缓存）
 * @param {String} fileID - 云存储文件ID
 * @returns {Promise<String>} 临时链接
 */
function getTempFileURL(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) {
    return Promise.resolve(fileID);
  }

  const cached = getCachedTempURL(fileID);
  if (cached) {
    return Promise.resolve(cached);
  }

  return wx.cloud.getTempFileURL({
    fileList: [fileID]
  }).then(res => {
    if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
      const tempURL = res.fileList[0].tempFileURL;
      setCachedTempURL(fileID, tempURL);
      return tempURL;
    }
    return fileID;
  }).catch(err => {
    console.error('❌ 获取临时链接失败:', err);
    return fileID;
  });
}

/**
 * 清理过期和多余的缓存
 */
function cleanupOldCache() {
  try {
    const info = wx.getStorageInfoSync();
    const keys = info.keys.filter(key => key.startsWith(STORAGE_PREFIX));
    
    // 如果缓存数量未超限，不清理
    if (keys.length <= MAX_CACHE_SIZE) {
      return;
    }

    console.log(`🧹 清理图片缓存 (${keys.length}/${MAX_CACHE_SIZE})`);

    // 读取所有缓存的时间戳
    const cacheList = [];
    keys.forEach(key => {
      try {
        const cached = wx.getStorageSync(key);
        if (cached && cached.time) {
          cacheList.push({ key, time: cached.time });
        }
      } catch (err) {}
    });

    // 按时间排序，删除最旧的
    cacheList.sort((a, b) => a.time - b.time);
    const deleteCount = keys.length - MAX_CACHE_SIZE + 10; // 多删10个，留缓冲
    
    for (let i = 0; i < deleteCount && i < cacheList.length; i++) {
      wx.removeStorageSync(cacheList[i].key);
    }

    // 清理完成，静默
  } catch (err) {
    console.warn('⚠️ 清理缓存失败:', err);
  }
}

/**
 * 清空所有图片缓存
 */
function clearAllCache() {
  // 清空内存缓存
  memoryCache.clear();
  
  // 清空本地存储缓存
  try {
    const info = wx.getStorageInfoSync();
    const keys = info.keys.filter(key => key.startsWith(STORAGE_PREFIX));
    keys.forEach(key => {
      wx.removeStorageSync(key);
    });
    console.log(`已清空所有图片缓存 (${keys.length}条)`);
  } catch (err) {
    console.error('❌ 清空缓存失败:', err);
  }
}

/**
 * 预加载图片（提前获取临时链接并缓存）
 * @param {Array<String>} fileIDs - 云存储文件ID数组
 */
function preloadImages(fileIDs) {
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) {
    return Promise.resolve();
  }

  return getTempFileURLs(fileIDs);
}

/**
 * 获取缓存统计信息
 */
function getCacheStats() {
  try {
    const info = wx.getStorageInfoSync();
    const keys = info.keys.filter(key => key.startsWith(STORAGE_PREFIX));
    
    let validCount = 0;
    let expiredCount = 0;
    const now = Date.now();
    
    keys.forEach(key => {
      try {
        const cached = wx.getStorageSync(key);
        if (cached && cached.time) {
          if (now - cached.time < TEMP_URL_EXPIRE) {
            validCount++;
          } else {
            expiredCount++;
          }
        }
      } catch (err) {}
    });

    return {
      total: keys.length,
      valid: validCount,
      expired: expiredCount,
      memory: memoryCache.size
    };
  } catch (err) {
    return { total: 0, valid: 0, expired: 0, memory: 0 };
  }
}

module.exports = {
  getCachedTempURL,
  setCachedTempURL,
  getTempFileURL,
  getTempFileURLs,
  cleanupOldCache,
  clearAllCache,
  preloadImages,
  getCacheStats
};
