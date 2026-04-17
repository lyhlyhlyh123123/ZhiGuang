// pages/edit-plant/edit-plant.js
const { uploadImages, getPlantPhotos } = require('../../utils/imageHelper.js');
const { smartCompress } = require('../../utils/imageCompressor.js');
const { invalidateCache } = require('../../utils/imageCache.js');

Page({
  data: {
    plantId: '',
    nickname: '',
    species: '',
    location: '',
    source: '',
    remark: '',
    adoptDate: '',
    waterInterval: 7,
    imageList: [], // 混合数组：云端图片和本地新增图片
    originalPhotoList: [], // 原始的云端图片数组
    maxImageCount: 9,
    selectedIndex: -1, // 选中的图片索引（用于交换）
    speciesCategories: [], // 品种类目
    locationCategories: [], // 位置类目
  },

  onLoad(options) {
    const id = options.id;
    this.setData({ plantId: id });
    
    // 加载类目数据
    const app = getApp();
    this.setData({
      speciesCategories: app.globalData.speciesCategories || [],
      locationCategories: app.globalData.locationCategories || []
    });
    
    // 等 silentLogin 完成后再拉数据
    app.silentLogin().then(() => {
      this.fetchOldData(id);
    }).catch(() => {
      this.fetchOldData(id);
    });
  },

  // 拉取植物数据
  async fetchOldData(id) {
    wx.showLoading({ title: '加载资料...' });

    try {
      const result = await wx.cloud.callFunction({
        name: 'getMyPlantForEdit',
        data: { plantId: id }
      });

      if (!result.result.success) {
        throw new Error(result.result.message);
      }

      const data = result.result.data;

      // 获取图片列表（兼容新旧数据）
      const photos = getPlantPhotos(data);
      const imageList = photos.map(url => ({ url, isCloud: true }));

      this.setData({
        nickname: data.nickname,
        species: data.species,
        location: data.location || '',
        source: data.source || '',
        remark: data.remark || '',
        adoptDate: data.adoptDate,
        waterInterval: data.waterInterval || 7,
        imageList: imageList,
        originalPhotoList: photos
      });

      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      console.error('【植光】加载植物资料失败:', err);
      wx.showToast({ title: '加载失败，请返回重试', icon: 'none' });
    }
  },

  onDateChange(e) {
    this.setData({ adoptDate: e.detail.value });
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onSpeciesInput(e) {
    this.setData({ species: e.detail.value });
  },

  // ✨ 新增：摆放位置输入处理
  onLocationInput(e) {
    this.setData({ location: e.detail.value });
  },

  // 选择品种
  selectSpecies(e) {
    this.setData({ species: e.currentTarget.dataset.val });
  },

  // 选择位置
  selectLocation(e) {
    this.setData({ location: e.currentTarget.dataset.val });
  },

  // ✨ 新增：快捷设置位置
  quickSetLocation(e) {
    this.setData({ location: e.currentTarget.dataset.val });
  },

  // 显示添加品种对话框
  showAddSpeciesDialog() {
    wx.showModal({
      title: '添加品种类目',
      editable: true,
      placeholderText: '请输入植物品种名称',
      success: (res) => {
        if (res.confirm && res.content) {
          const app = getApp();
          const success = app.addSpeciesCategory(res.content);
          if (success) {
            this.setData({
              speciesCategories: app.globalData.speciesCategories
            });
            wx.showToast({ title: '添加成功', icon: 'success' });
          } else {
            wx.showToast({ title: '该类目已存在', icon: 'none' });
          }
        }
      }
    });
  },

  // 显示添加位置对话框
  showAddLocationDialog() {
    wx.showModal({
      title: '添加位置类目',
      editable: true,
      placeholderText: '请输入摆放位置名称',
      success: (res) => {
        if (res.confirm && res.content) {
          const app = getApp();
          const success = app.addLocationCategory(res.content);
          if (success) {
            this.setData({
              locationCategories: app.globalData.locationCategories
            });
            wx.showToast({ title: '添加成功', icon: 'success' });
          } else {
            wx.showToast({ title: '该类目已存在', icon: 'none' });
          }
        }
      }
    });
  },

  // 删除品种类目
  deleteSpeciesCategory(e) {
    const name = e.currentTarget.dataset.val;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${name}"这个品种类目吗？`,
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.removeSpeciesCategory(name);
          this.setData({
            speciesCategories: app.globalData.speciesCategories
          });
          // 如果当前选中的是被删除的类目，清空选择
          if (this.data.species === name) {
            this.setData({ species: '' });
          }
          wx.showToast({ title: '删除成功', icon: 'success' });
        }
      }
    });
  },

  // 删除位置类目
  deleteLocationCategory(e) {
    const name = e.currentTarget.dataset.val;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${name}"这个位置类目吗？`,
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.removeLocationCategory(name);
          this.setData({
            locationCategories: app.globalData.locationCategories
          });
          // 如果当前选中的是被删除的类目，清空选择
          if (this.data.location === name) {
            this.setData({ location: '' });
          }
          wx.showToast({ title: '删除成功', icon: 'success' });
        }
      }
    });
  },

  // ✨ 新增：来源输入处理
  onSourceInput(e) {
    this.setData({ source: e.detail.value });
  },

  // ✨ 新增：备注输入处理
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // ✨ 新增：步进器：减少天数
  minusInterval() {
    if (this.data.waterInterval > 1) {
      this.setData({ waterInterval: this.data.waterInterval - 1 });
    }
  },

  // ✨ 新增：步进器：增加天数
  addInterval() {
    if (this.data.waterInterval < 30) {
      this.setData({ waterInterval: this.data.waterInterval + 1 });
    }
  },

  // 添加图片
  async chooseImages() {
    const remaining = this.data.maxImageCount - this.data.imageList.length;
    
    if (remaining <= 0) {
      wx.showToast({ title: `最多只能上传${this.data.maxImageCount}张图片`, icon: 'none' });
      return;
    }

    try {
      const res = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['original'], // ✅ 先选择原图，然后智能压缩
      });

      // ✅ 显示压缩进度
      if (res.tempFiles.length > 0) {
        wx.showLoading({ title: '图片处理中...', mask: true });
      }

      // ✅ 智能压缩所有图片
      const compressTasks = res.tempFiles.map(file =>
        smartCompress(file.tempFilePath)
      );
      
      const compressedPaths = await Promise.all(compressTasks);
      wx.hideLoading();

      const newImages = compressedPaths.map(path => ({
        url: path,
        isCloud: false
      }));
      
      this.setData({
        imageList: [...this.data.imageList, ...newImages]
      });

      wx.showToast({
        title: `已添加${newImages.length}张图片`,
        icon: 'success',
        duration: 1500
      });
    } catch (err) {
      wx.hideLoading();
      console.error('【植光】选择照片失败:', err);
    }
  },

  // 删除图片
  deleteImage(e) {
    const { index } = e.currentTarget.dataset;
    const list = [...this.data.imageList];
    list.splice(index, 1);
    this.setData({ imageList: list });
  },

  // 点击图片进行交换
  onImageTap(e) {
    const { index } = e.currentTarget.dataset;
    
    // 如果没有选中图片，选中当前图片
    if (this.data.selectedIndex === -1) {
      this.setData({ selectedIndex: index });
      wx.vibrateShort({ type: 'light' });
      return;
    }
    
    // 如果点击同一张图片，取消选中
    if (this.data.selectedIndex === index) {
      this.setData({ selectedIndex: -1 });
      return;
    }
    
    // 交换两张图片
    const list = [...this.data.imageList];
    const temp = list[this.data.selectedIndex];
    list[this.data.selectedIndex] = list[index];
    list[index] = temp;
    
    this.setData({
      imageList: list,
      selectedIndex: -1 // 交换后取消选中
    });
    
    wx.vibrateShort({ type: 'heavy' });
  },

  // 预览图片（长按）
  previewImage(e) {
    const { url } = e.currentTarget.dataset;
    const urls = this.data.imageList.map(img => img.url);
    wx.previewImage({ current: url, urls });
  },

  async submitPlant() {
    if (this._submitting) return;
    this._submitting = true;

    const { nickname, species, location, source, remark, adoptDate, waterInterval, imageList, plantId, originalPhotoList } = this.data;

    if (!nickname || !species || !location) {
      this._submitting = false;
      wx.showToast({ title: '请填写昵称、品种和位置', icon: 'none' });
      return;
    }

    if (imageList.length === 0) {
      this._submitting = false;
      wx.showToast({ title: '请至少上传一张照片', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '更新中...' });
    let uploadedFileIDs = [];

    try {
      const localPhotos = imageList.filter(img => !img.isCloud).map(img => img.url);

      // 新增本地图片先在前端上传，避免把手机本地路径传到云函数
      if (localPhotos.length > 0) {
        // 图片已在选图时经过 smartCompress，此处直接上传不重复压缩
        const uploadResult = await uploadImages(localPhotos, 'plant-photos', false);
        uploadedFileIDs = uploadResult.success || [];

        if (uploadResult.failed > 0 || uploadedFileIDs.length !== localPhotos.length) {
          if (uploadedFileIDs.length > 0) {
            await wx.cloud.deleteFile({ fileList: uploadedFileIDs }).catch(() => {});
            uploadedFileIDs = [];
          }
          throw new Error('图片上传失败，请重试');
        }
      }

      // 构建最终图片列表：云端旧图 + 新上传fileID（保持原顺序）
      let localIndex = 0;
      const completePhotoList = imageList
        .map(img => (img.isCloud ? img.url : (uploadedFileIDs[localIndex++] || '')))
        .filter(Boolean);

      // 调用云函数更新植物
      const updateResult = await wx.cloud.callFunction({
        name: 'updatePlant',
        data: {
          plantId,
          nickname,
          species,
          location,
          source: source || '',
          remark: remark || '',
          adoptDate,
          waterInterval,
          finalPhotoList: completePhotoList,
          originalPhotoList: originalPhotoList || []
        }
      });

      if (!updateResult.result.success) {
        if (uploadedFileIDs.length > 0) {
          await wx.cloud.deleteFile({ fileList: uploadedFileIDs }).catch(() => {});
          uploadedFileIDs = [];
        }
        throw new Error(updateResult.result.message);
      }

      // ✅ 优化：保存成功后立即设置首页刷新标志
      const app = getApp();
      app.globalData.needRefreshIndex = true;

      // 只失效被删除的图片缓存，保留未变动图片的缓存
      const deletedPhotos = (originalPhotoList || []).filter(
        id => !completePhotoList.includes(id) && id && id.startsWith('cloud://')
      );
      if (deletedPhotos.length > 0) {
        invalidateCache(deletedPhotos);
      }

      wx.hideLoading();
      this._submitting = false;
      wx.showToast({ title: '修改成功！', icon: 'success', duration: 1000 });

      // ✅ 优化：缩短延迟时间，提升响应速度
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 1000);

    } catch (err) {
      if (uploadedFileIDs.length > 0) {
        await wx.cloud.deleteFile({ fileList: uploadedFileIDs }).catch(() => {});
      }
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
      console.error('【植光】更新失败:', err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // ✅ 修复：添加页面卸载时清理
  onUnload() {
    this._submitting = false;
  }
});
