/**
 * 图片压缩工具 - 减少CDN流量消耗
 * 
 * 核心策略：
 * 1. 上传前压缩图片（质量80%，宽度限制1200px）
 * 2. 根据使用场景选择不同压缩等级
 * 3. 避免重复压缩已压缩的图片
 */

/**
 * 压缩单张图片
 * @param {String} tempFilePath - 临时文件路径
 * @param {Object} options - 压缩配置
 * @returns {Promise<String>} 压缩后的临时文件路径
 */
function compressImage(tempFilePath, options = {}) {
  const {
    quality = 80,        // 压缩质量 0-100
    maxWidth = 1200,     // 最大宽度（px）
    maxHeight = 1600,    // 最大高度（px）
    compressedWidth = null  // 指定压缩宽度（覆盖maxWidth）
  } = options;

  return new Promise((resolve, reject) => {
    // 先获取图片信息，判断是否需要压缩
    wx.getImageInfo({
      src: tempFilePath,
      success: (info) => {
        const { width, height, size } = info;
        
        // 小图片（< 100KB）且尺寸合适，直接返回不压缩
        if (size < 100 * 1024 && width <= maxWidth && height <= maxHeight) {
          resolve(tempFilePath);
          return;
        }

        // 计算压缩后的尺寸（保持宽高比）
        let targetWidth = width;
        let targetHeight = height;
        
        if (compressedWidth) {
          // 指定宽度模式
          targetWidth = compressedWidth;
          targetHeight = Math.round(height * (compressedWidth / width));
        } else {
          // 自适应模式
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            targetWidth = Math.round(width * ratio);
            targetHeight = Math.round(height * ratio);
          }
        }

        // 只在压缩大图时输出日志
        if (size > 1024 * 1024) {
          console.log(`📸 压缩图片: ${(size / 1024).toFixed(1)}KB → 目标尺寸${targetWidth}x${targetHeight}`);
        }

        // 使用 Canvas 压缩图片
        wx.compressImage({
          src: tempFilePath,
          quality,
          compressedWidth: targetWidth,
          compressedHeight: targetHeight,
          success: (res) => {
            // 获取压缩后的文件大小
            // 只在压缩大图时输出结果
            if (size > 1024 * 1024) {
              wx.getFileInfo({
                filePath: res.tempFilePath,
                success: (fileInfo) => {
                  const savedPercent = ((1 - fileInfo.size / size) * 100).toFixed(0);
                  resolve(res.tempFilePath);
                },
                fail: () => {
                  resolve(res.tempFilePath);
                }
              });
            } else {
              resolve(res.tempFilePath);
            }
          },
          fail: (err) => {
            console.warn('⚠️ 图片压缩失败，使用原图:', err);
            // 压缩失败时返回原图
            resolve(tempFilePath);
          }
        });
      },
      fail: (err) => {
        console.error('❌ 获取图片信息失败:', err);
        reject(err);
      }
    });
  });
}

/**
 * 批量压缩图片
 * @param {Array<String>} tempFilePaths - 临时文件路径数组
 * @param {Object} options - 压缩配置
 * @returns {Promise<Array<String>>} 压缩后的临时文件路径数组
 */
function compressImages(tempFilePaths, options = {}) {
  if (!Array.isArray(tempFilePaths) || tempFilePaths.length === 0) {
    return Promise.resolve([]);
  }

  const tasks = tempFilePaths.map(path => compressImage(path, options));
  return Promise.all(tasks);
}

/**
 * 预设压缩方案
 */
const COMPRESS_PRESETS = {
  // 列表缩略图（高压缩）
  thumbnail: {
    quality: 60,
    maxWidth: 600,
    maxHeight: 600
  },
  
  // 详情页展示（中等压缩）
  display: {
    quality: 80,
    maxWidth: 1200,
    maxHeight: 1600
  },
  
  // 高清保存（低压缩）
  highQuality: {
    quality: 90,
    maxWidth: 1920,
    maxHeight: 2560
  },
  
  // 头像（固定尺寸）
  avatar: {
    quality: 75,
    compressedWidth: 400
  }
};

/**
 * 使用预设方案压缩图片
 * @param {String|Array<String>} filePaths - 文件路径
 * @param {String} preset - 预设方案名称
 * @returns {Promise}
 */
function compressWithPreset(filePaths, preset = 'display') {
  const options = COMPRESS_PRESETS[preset] || COMPRESS_PRESETS.display;
  
  if (Array.isArray(filePaths)) {
    return compressImages(filePaths, options);
  } else {
    return compressImage(filePaths, options);
  }
}

/**
 * 智能压缩（根据图片大小自动选择策略）
 * @param {String} tempFilePath - 临时文件路径
 * @returns {Promise<String>}
 */
function smartCompress(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath: tempFilePath,
      success: (info) => {
        const sizeMB = info.size / (1024 * 1024);
        
        let options;
        if (sizeMB > 5) {
          // 超大图片（>5MB）- 高压缩
          options = { quality: 60, maxWidth: 1000, maxHeight: 1400 };
        } else if (sizeMB > 2) {
          // 大图片（2-5MB）- 中等压缩
          options = { quality: 75, maxWidth: 1200, maxHeight: 1600 };
        } else if (sizeMB > 0.5) {
          // 中等图片（0.5-2MB）- 轻度压缩
          options = { quality: 85, maxWidth: 1400, maxHeight: 1800 };
        } else {
          // 小图片（<0.5MB）- 几乎不压缩
          options = { quality: 90, maxWidth: 1600, maxHeight: 2000 };
        }
        
        compressImage(tempFilePath, options).then(resolve).catch(reject);
      },
      fail: (err) => {
        console.warn('⚠️ 无法获取文件信息，使用默认压缩');
        compressImage(tempFilePath).then(resolve).catch(reject);
      }
    });
  });
}

module.exports = {
  compressImage,
  compressImages,
  compressWithPreset,
  smartCompress,
  COMPRESS_PRESETS
};
