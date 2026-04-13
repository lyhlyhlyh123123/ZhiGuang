// pages/edit-plant/edit-plant.js
const db = wx.cloud.database();
const { uploadImages, getPlantPhotos } = require('../../utils/imageHelper.js');
const { smartCompress } = require('../../utils/imageCompressor.js');

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
  fetchOldData(id) {
    wx.showLoading({ title: '加载资料...' });
    db.collection('plants').doc(id).get().then(res => {
      wx.hideLoading();
      const data = res.data;
      
      // 校验权限
      const app = getApp();
      const openid = app.globalData.openid;
      if (openid && data._openid && data._openid !== openid) {
        wx.showToast({ title: '无权编辑此植物', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      
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
    }).catch(err => {
      wx.hideLoading();
      console.error('【植光】加载植物资料失败:', err);
      wx.showToast({ title: '加载失败，请返回重试', icon: 'none' });
    });
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

    try {
      // 分离云端图片和本地新增图片
      const cloudPhotos = imageList.filter(img => img.isCloud).map(img => img.url);
      const localPhotos = imageList.filter(img => !img.isCloud).map(img => img.url);
      
      // 上传新增的本地图片
      let newFileIDs = [];
      if (localPhotos.length > 0) {
        const uploadResult = await uploadImages(localPhotos, 'plant-photos', true);
        newFileIDs = uploadResult.success;

        // ✅ 修复：如果有图片上传失败，提示用户
        if (uploadResult.failed > 0) {
          wx.showToast({
            title: `${uploadResult.failed}张新图片上传失败`,
            icon: 'none',
            duration: 2000
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // 重建完整的 photoList（按当前顺序）
      let photoIndex = 0;
      const finalPhotoList = imageList.map(img => {
        if (img.isCloud) {
          return img.url;
        } else {
          // 如果对应的新图片上传失败，跳过
          return newFileIDs[photoIndex++];
        }
      }).filter(Boolean); // 过滤掉 undefined
      
      // ✅ 修复：找出被删除的图片并清理云存储
      const deletedPhotos = (originalPhotoList || []).filter(
        oldPhoto => !finalPhotoList.includes(oldPhoto) && oldPhoto.startsWith('cloud://')
      );
      
      // 更新数据库
      await db.collection('plants').doc(plantId).update({
        data: {
          nickname,
          species,
          location,
          source,
          remark,
          adoptDate,
          waterInterval,
          photoList: finalPhotoList,
          photoFileID: finalPhotoList[0] || '', // 兼容
          updateTime: db.serverDate()
        }
      });

      // ✅ 修复：数据库更新成功后再清理被删除的图片
      if (deletedPhotos.length > 0) {
        wx.cloud.deleteFile({
          fileList: deletedPhotos
        }).catch(err => {
          console.warn('【植光】清理图片失败（不影响主流程）:', err);
        });
      }

      // ✅ 优化：保存成功后立即设置首页刷新标志
      const app = getApp();
      app.globalData.needRefreshIndex = true;

      wx.hideLoading();
      this._submitting = false;
      wx.showToast({ title: '修改成功！', icon: 'success', duration: 1000 });
      
      // ✅ 优化：缩短延迟时间，提升响应速度
      setTimeout(() => {
        wx.navigateBack({ delta: 1 });
      }, 1000);

    } catch (err) {
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'error' });
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