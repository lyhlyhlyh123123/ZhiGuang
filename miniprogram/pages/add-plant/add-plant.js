// pages/add-plant/add-plant.js
const db = wx.cloud.database();
const { uploadImages } = require('../../utils/imageHelper.js');

Page({
  data: {
    nickname: '',
    species: '',
    location: '',
    source: '', // 来源（选填）
    remark: '', // 备注（选填）
    adoptDate: '',
    tempImagePaths: [], // 改为数组，支持多图
    waterInterval: 7,
    maxImageCount: 9, // 最多9张图片
    selectedIndex: -1, // 选中的图片索引（用于交换）
  },

  onLoad() {
    // 移除裁剪相关的初始化
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

  onLocationInput(e) {
    this.setData({ location: e.detail.value });
  },

  quickSetLocation(e) {
    this.setData({ location: e.currentTarget.dataset.val });
  },

  onSourceInput(e) {
    this.setData({ source: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 选择图片（支持多选）
  chooseImages() {
    const remaining = this.data.maxImageCount - this.data.tempImagePaths.length;
    
    if (remaining <= 0) {
      wx.showToast({ title: `最多只能上传${this.data.maxImageCount}张图片`, icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'], // 使用压缩图，减少上传时间
    }).then(res => {
      const newPaths = res.tempFiles.map(file => file.tempFilePath);
      const allPaths = [...this.data.tempImagePaths, ...newPaths];
      this.setData({ tempImagePaths: allPaths });
    }).catch(err => {
      console.error('【植光】选择照片失败:', err);
    });
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
    const paths = [...this.data.tempImagePaths];
    const temp = paths[this.data.selectedIndex];
    paths[this.data.selectedIndex] = paths[index];
    paths[index] = temp;
    
    this.setData({
      tempImagePaths: paths,
      selectedIndex: -1 // 交换后取消选中
    });
    
    wx.vibrateShort({ type: 'heavy' });
  },

  // 删除某张图片
  deleteImage(e) {
    const { index } = e.currentTarget.dataset;
    const paths = [...this.data.tempImagePaths];
    paths.splice(index, 1);
    this.setData({
      tempImagePaths: paths,
      selectedIndex: -1 // 删除后取消选中
    });
  },

  // 预览图片（长按）
  previewImage(e) {
    const { url } = e.currentTarget.dataset;
    wx.previewImage({
      current: url,
      urls: this.data.tempImagePaths
    });
  },

  async submitPlant() {
    if (this._submitting) return;
    this._submitting = true;

    const { nickname, species, location, source, remark, adoptDate, tempImagePaths, waterInterval } = this.data;

    // 验证必填字段
    if (!nickname || !species || !location) {
      this._submitting = false;
      wx.showToast({ title: '请填写昵称、品种和位置', icon: 'none' });
      return;
    }

    if (tempImagePaths.length === 0) {
      this._submitting = false;
      wx.showToast({ title: '请至少上传一张照片', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '上传中...' });

    try {
      // 批量上传图片到云存储
      const uploadResult = await uploadImages(tempImagePaths, 'plant-photos', true);
      const photoList = uploadResult.success;

      // ✅ 修复：如果有图片上传失败，提示用户
      if (uploadResult.failed > 0) {
        wx.showToast({
          title: `${uploadResult.failed}张图片上传失败`,
          icon: 'none',
          duration: 2000
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

      // 保存到数据库
      await db.collection('plants').add({
        data: {
          nickname,
          species,
          location,
          source: source || '',
          remark: remark || '',
          adoptDate: adoptDate || todayStr,
          photoList: photoList,           // 新增：图片数组
          photoFileID: photoList[0] || '', // 兼容：第一张作为封面
          waterInterval,
          lastWaterDate: today,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      wx.hideLoading();
      this._submitting = false;
      wx.showToast({ title: '添加成功！', icon: 'success', duration: 1200 });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200);

    } catch (err) {
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'error' });
      console.error('【植光】保存失败:', err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  minusInterval() {
    if (this.data.waterInterval > 1) {
      this.setData({ waterInterval: this.data.waterInterval - 1 });
    }
  },

  addInterval() {
    if (this.data.waterInterval < 30) {
      this.setData({ waterInterval: this.data.waterInterval + 1 });
    }
  },

  // ✅ 修复：添加页面卸载时清理
  onUnload() {
    this._submitting = false;
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  minusInterval() {
    if (this.data.waterInterval > 1) {
      this.setData({ waterInterval: this.data.waterInterval - 1 });
    }
  },

  addInterval() {
    if (this.data.waterInterval < 30) {
      this.setData({ waterInterval: this.data.waterInterval + 1 });
    }
  }
});
