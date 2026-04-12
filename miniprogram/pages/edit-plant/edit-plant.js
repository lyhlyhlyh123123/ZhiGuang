// pages/edit-plant/edit-plant.js
const db = wx.cloud.database();
const { uploadImages, getPlantPhotos } = require('../../utils/imageHelper.js');

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
  },

  onLoad(options) {
    const id = options.id;
    this.setData({ plantId: id });
    
    // 等 silentLogin 完成后再拉数据
    const app = getApp();
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

  // ✨ 新增：快捷设置位置
  quickSetLocation(e) {
    this.setData({ location: e.currentTarget.dataset.val });
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
  chooseImages() {
    const remaining = this.data.maxImageCount - this.data.imageList.length;
    
    if (remaining <= 0) {
      wx.showToast({ title: `最多只能上传${this.data.maxImageCount}张图片`, icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
    }).then(res => {
      const newImages = res.tempFiles.map(file => ({
        url: file.tempFilePath,
        isCloud: false
      }));
      this.setData({
        imageList: [...this.data.imageList, ...newImages]
      });
    }).catch(err => {
      console.error('【植光】选择照片失败:', err);
    });
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

    const { nickname, species, location, source, remark, adoptDate, waterInterval, imageList, plantId } = this.data;

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

      wx.hideLoading();
      this._submitting = false;
      wx.showToast({ title: '修改成功！', icon: 'success', duration: 1200 });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200);

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