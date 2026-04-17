/**
 * 图片缓存管理器 - 减少CDN流量和云函数调用
 *
 * 缓存策略（三层）：
 * 1. 内存缓存（会话级，最快）
 * 2. 本地存储缓存（临时链接，110分钟有效）
 * 3. 文件持久化缓存（下载到本地，永久有效，真正零CDN）
 */

// 内存缓存（当前会话）
const memoryCache = new Map();

// 临时链接有效期：110分钟（留10分钟缓冲）
const TEMP_URL_EXPIRE = 110 * 60 * 1000;

// 本地存储key前缀
const STORAGE_PREFIX = 'img_cache_';

// 文件缓存key前缀（存储 fileID -> 本地路径 的映射）
const FILE_CACHE_PREFIX = 'img_file_';

// 最大临时链接缓存数量
const MAX_CACHE_SIZE = 100;

// 最大文件缓存数量（超出时按LRU淘汰）
const MAX_FILE_CACHE_SIZE = 80;

// 文件缓存目录
const FILE_CACHE_DIR = `${wx.env.USER_DATA_PATH}/imgcache/`;

/**
 * 获取缓存的临时链接（内存 → localStorage）
 */
function getCachedTempURL(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) {
    return null;
  }

  // 1. 内存缓存
  const memoryCached = memoryCache.get(fileID);
  if (memoryCached) {
    if (Date.now() - memoryCached.time < TEMP_URL_EXPIRE) {
      return memoryCached.url;
    }
    memoryCache.delete(fileID);
  }

  // 2. localStorage
  try {
    const cached = wx.getStorageSync(STORAGE_PREFIX + fileID);
    if (cached && cached.url && cached.time) {
      if (Date.now() - cached.time < TEMP_URL_EXPIRE) {
        memoryCache.set(fileID, cached);
        return cached.url;
      }
      wx.removeStorageSync(STORAGE_PREFIX + fileID);
    }
  } catch (err) {
    // 静默处理
  }

  return null;
}

/**
 * 写入临时链接缓存（内存 + localStorage）
 */
function setCachedTempURL(fileID, tempURL) {
  if (!fileID || !tempURL) return;

  const cacheData = { url: tempURL, time: Date.now() };
  memoryCache.set(fileID, cacheData);

  try {
    wx.setStorageSync(STORAGE_PREFIX + fileID, cacheData);
    cleanupOldCache();
  } catch (err) {
    // 静默处理
  }
}

/**
 * 获取本地文件缓存路径（永久缓存，零CDN）
 * @returns {String|null} 本地文件路径，未命中返回null
 */
function getCachedFilePath(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) return null;
  try {
    const record = wx.getStorageSync(FILE_CACHE_PREFIX + fileID);
    if (!record || !record.path) return null;
    // 验证文件是否真实存在（防止文件被清理但记录还在）
    const fs = wx.getFileSystemManager();
    try {
      fs.accessSync(record.path);
      // 更新访问时间（LRU）
      wx.setStorageSync(FILE_CACHE_PREFIX + fileID, { ...record, lastAccess: Date.now() });
      return record.path;
    } catch (e) {
      // 文件不存在，删除记录
      wx.removeStorageSync(FILE_CACHE_PREFIX + fileID);
      return null;
    }
  } catch (err) {
    return null;
  }
}

/**
 * 写入本地文件缓存记录
 */
function setCachedFilePath(fileID, localPath) {
  if (!fileID || !localPath) return;
  try {
    wx.setStorageSync(FILE_CACHE_PREFIX + fileID, {
      path: localPath,
      time: Date.now(),
      lastAccess: Date.now()
    });
    cleanupFileCache();
  } catch (err) {
    // 静默处理
  }
}

/**
 * 下载图片到本地并缓存（真正的持久化零CDN方案）
 * @param {String} fileID - cloud:// 文件ID
 * @param {String} tempURL - 临时链接（已有则直接用）
 * @returns {Promise<String>} 本地文件路径
 */
function downloadAndCache(fileID, tempURL) {
  return new Promise((resolve, reject) => {
    // 生成唯一本地路径
    const cleanUrl = (fileID || tempURL || '').split('?')[0];
    const matchExt = cleanUrl.split('.').pop().toLowerCase();
    const validExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'];
    const ext = validExts.includes(matchExt) ? matchExt : 'jpg';

    // 生成唯一本地路径
    const hash = fileID.replace(/[^a-zA-Z0-9]/g, '').slice(-20);
    const localPath = `${FILE_CACHE_DIR}${hash}.${ext}`;

    const fs = wx.getFileSystemManager();

    // 确保缓存目录存在
    try {
      fs.accessSync(FILE_CACHE_DIR);
    } catch (e) {
      try {
        fs.mkdirSync(FILE_CACHE_DIR, true);
      } catch (mkdirErr) {
        // 目录可能已存在，忽略
      }
    }

    const doDownload = (url) => {
      wx.downloadFile({
        url,
        filePath: localPath,
        success: (res) => {
          if (res.statusCode === 200) {
            setCachedFilePath(fileID, localPath);
            resolve(localPath);
          } else {
            reject(new Error(`下载失败: ${res.statusCode}`));
          }
        },
        fail: reject
      });
    };

    if (tempURL) {
      doDownload(tempURL);
    } else {
      // 先获取临时链接再下载
      wx.cloud.getTempFileURL({ fileList: [fileID] })
        .then(res => {
          const item = res.fileList && res.fileList[0];
          if (item && item.tempFileURL && item.status === 0) {
            setCachedTempURL(fileID, item.tempFileURL);
            doDownload(item.tempFileURL);
          } else {
            reject(new Error('获取临时链接失败'));
          }
        })
        .catch(reject);
    }
  });
}

/**
 * 批量获取临时链接（带三层缓存）
 * @param {Array<String>} fileIDs
 * @returns {Promise<Array>} [{fileID, tempFileURL}]
 */
function getTempFileURLs(fileIDs) {
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) {
    return Promise.resolve([]);
  }

  // ✅ 新增：入口去重，防止重复进入查缓存和发请求流程
  const uniqueFileIDs = [...new Set(fileIDs)];

  const result = [];
  const uncachedIDs = [];

  // 👇 下面的循环改为遍历去重后的 uniqueFileIDs
  uniqueFileIDs.forEach(fileID => {
    // 优先用本地文件缓存（零CDN）
    const localPath = getCachedFilePath(fileID);
    if (localPath) {
      result.push({ fileID, tempFileURL: localPath, fromFileCache: true });
      return;
    }

    // 其次用临时链接缓存
    const cachedURL = getCachedTempURL(fileID);
    if (cachedURL) {
      result.push({ fileID, tempFileURL: cachedURL, fromCache: true });
    } else {
      uncachedIDs.push(fileID);
    }
  });

  if (uncachedIDs.length === 0) {
    return Promise.resolve(result);
  }

  return wx.cloud.getTempFileURL({
    fileList: uncachedIDs
  }).then(res => {
    if (res.fileList && Array.isArray(res.fileList)) {
      res.fileList.forEach(item => {
        if (item.tempFileURL && item.status === 0) {
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
    return result;
  });
}

/**
 * 获取单个临时链接（带缓存）
 */
function getTempFileURL(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) {
    return Promise.resolve(fileID);
  }

  // 本地文件缓存优先
  const localPath = getCachedFilePath(fileID);
  if (localPath) return Promise.resolve(localPath);

  const cached = getCachedTempURL(fileID);
  if (cached) return Promise.resolve(cached);

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
 * 预加载图片（获取临时链接并缓存，可选下载到本地）
 * @param {Array<String>} fileIDs
 * @param {Boolean} persistLocal - 是否下载到本地做持久化缓存（默认false，首屏用）
 */
function preloadImages(fileIDs, persistLocal = false) {
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) {
    return Promise.resolve();
  }

  return getTempFileURLs(fileIDs).then(results => {
    if (!persistLocal) return results;

    // 持久化：将未有本地缓存的图片下载到本地（后台静默，不阻塞）
    results.forEach(item => {
      if (!item.fromFileCache && item.tempFileURL) {
        downloadAndCache(item.fileID, item.tempFileURL).catch(() => {});
      }
    });

    return results;
  });
}

/**
 * 清理过期和超量的临时链接缓存（LRU）
 */
function cleanupOldCache() {
  try {
    const info = wx.getStorageInfoSync();
    const keys = info.keys.filter(key => key.startsWith(STORAGE_PREFIX));
    if (keys.length <= MAX_CACHE_SIZE) return;

    const cacheList = [];
    keys.forEach(key => {
      try {
        const cached = wx.getStorageSync(key);
        if (cached && cached.time) cacheList.push({ key, time: cached.time });
      } catch (e) {}
    });

    cacheList.sort((a, b) => a.time - b.time);
    const deleteCount = keys.length - MAX_CACHE_SIZE + 10;
    for (let i = 0; i < deleteCount && i < cacheList.length; i++) {
      wx.removeStorageSync(cacheList[i].key);
    }
  } catch (err) {
    // 静默处理
  }
}

/**
 * 清理超量的文件缓存（LRU，按最后访问时间淘汰）
 */
function cleanupFileCache() {
  try {
    const info = wx.getStorageInfoSync();
    const keys = info.keys.filter(key => key.startsWith(FILE_CACHE_PREFIX));
    if (keys.length <= MAX_FILE_CACHE_SIZE) return;

    const cacheList = [];
    keys.forEach(key => {
      try {
        const record = wx.getStorageSync(key);
        if (record) cacheList.push({ key, lastAccess: record.lastAccess || record.time || 0, path: record.path });
      } catch (e) {}
    });

    // 按最后访问时间升序，淘汰最久未访问的
    cacheList.sort((a, b) => a.lastAccess - b.lastAccess);
    const deleteCount = keys.length - MAX_FILE_CACHE_SIZE + 5;
    const fs = wx.getFileSystemManager();

    for (let i = 0; i < deleteCount && i < cacheList.length; i++) {
      wx.removeStorageSync(cacheList[i].key);
      if (cacheList[i].path) {
        try { fs.unlinkSync(cacheList[i].path); } catch (e) {}
      }
    }
  } catch (err) {
    // 静默处理
  }
}

/**
 * 清空所有图片缓存（临时链接 + 本地文件）
 */
function clearAllCache() {
  memoryCache.clear();

  try {
    const info = wx.getStorageInfoSync();
    const fs = wx.getFileSystemManager();

    info.keys
      .filter(key => key.startsWith(STORAGE_PREFIX) || key.startsWith(FILE_CACHE_PREFIX))
      .forEach(key => {
        if (key.startsWith(FILE_CACHE_PREFIX)) {
          try {
            const record = wx.getStorageSync(key);
            if (record && record.path) fs.unlinkSync(record.path);
          } catch (e) {}
        }
        wx.removeStorageSync(key);
      });
  } catch (err) {
    console.error('❌ 清空缓存失败:', err);
  }
}

/**
 * 获取缓存统计信息
 */
function getCacheStats() {
  try {
    const info = wx.getStorageInfoSync();
    const tempKeys = info.keys.filter(key => key.startsWith(STORAGE_PREFIX));
    const fileKeys = info.keys.filter(key => key.startsWith(FILE_CACHE_PREFIX));

    let validTemp = 0, expiredTemp = 0;
    const now = Date.now();
    tempKeys.forEach(key => {
      try {
        const cached = wx.getStorageSync(key);
        if (cached && cached.time) {
          now - cached.time < TEMP_URL_EXPIRE ? validTemp++ : expiredTemp++;
        }
      } catch (e) {}
    });

    return {
      memory: memoryCache.size,
      tempTotal: tempKeys.length,
      tempValid: validTemp,
      tempExpired: expiredTemp,
      fileCache: fileKeys.length
    };
  } catch (err) {
    return { memory: 0, tempTotal: 0, tempValid: 0, tempExpired: 0, fileCache: 0 };
  }
}

/**
 * 使指定 fileID 列表的缓存失效（临时链接 + 本地文件）
 * 用于数据写操作后（编辑、删除）保证缓存与云端一致
 * @param {Array<String>} fileIDs - 需要失效的 cloud:// fileID 数组
 */
function invalidateCache(fileIDs) {
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) return;

  const fs = wx.getFileSystemManager();

  fileIDs.forEach(fileID => {
    if (!fileID || !fileID.startsWith('cloud://')) return;

    // 1. 内存缓存
    memoryCache.delete(fileID);

    // 2. 临时链接 localStorage
    try {
      wx.removeStorageSync(STORAGE_PREFIX + fileID);
    } catch (e) {}

    // 3. 本地文件缓存
    try {
      const record = wx.getStorageSync(FILE_CACHE_PREFIX + fileID);
      if (record && record.path) {
        try { fs.unlinkSync(record.path); } catch (e) {}
      }
      wx.removeStorageSync(FILE_CACHE_PREFIX + fileID);
    } catch (e) {}
  });
}

module.exports = {
  getCachedTempURL,
  setCachedTempURL,
  getCachedFilePath,
  setCachedFilePath,
  downloadAndCache,
  getTempFileURL,
  getTempFileURLs,
  invalidateCache,
  cleanupOldCache,
  cleanupFileCache,
  clearAllCache,
  preloadImages,
  getCacheStats
};
