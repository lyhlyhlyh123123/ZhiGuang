// pages/add-plant/add-plant.js
const db = wx.cloud.database();

Page({
  data: {
    nickname: '',
    species: '',
    location: '',
    adoptDate: '',
    tempImagePath: '',
    waterInterval: 7,
    imgX: 0,      // 图片拖动偏移 X
    imgY: 0,      // 图片拖动偏移 Y
    imgScale: 1,  // 图片缩放比例
    imgNaturalWidth: 0,
    imgNaturalHeight: 0,
    imgW: 0,
    imgH: 0,
    showCropPreview: false,
    boxW: 0,
    boxH: 0,
  },

  onLoad() {
    const info = wx.getSystemInfoSync();
    const boxW = info.windowWidth - 48; // 减去左右 padding（各24px）
    const boxH = Math.round(boxW * 3 / 4);
    this.setData({ boxW, boxH });
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

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    }).then(res => {
      const path = res.tempFiles[0].tempFilePath;
      // 获取图片原始尺寸，计算初始缩放让图片填满框
      wx.getImageInfo({
        src: path,
        success: info => {
          const { boxW, boxH } = this.data;
          const scaleW = boxW / info.width;
          const scaleH = boxH / info.height;
          const scale = Math.max(scaleW, scaleH);
          
          const imgW = Math.round(info.width * scale);
          const imgH = Math.round(info.height * scale);
          
          // 计算居中偏移：如果图片比容器大，让图片居中显示
          const imgX = imgW > boxW ? (boxW - imgW) / 2 : 0;
          const imgY = imgH > boxH ? (boxH - imgH) / 2 : 0;
          
          this.setData({
            tempImagePath: path,
            imgX,
            imgY,
            imgScale: scale,
            imgNaturalWidth: info.width,
            imgNaturalHeight: info.height,
            imgW,
            imgH,
            showCropPreview: true
          });
        },
        fail: (err) => {
          console.error('【植光】获取图片信息失败:', err);
          wx.showToast({ title: '图片加载失败，请重试', icon: 'none' });
        }
      });
    }).catch(err => {
      console.error('选择照片失败', err);
    });
  },

  onImgMove(e) {
    this.setData({ imgX: e.detail.x, imgY: e.detail.y });
  },

  onImgScale(e) {
    const newScale = this.data.imgScale * e.detail.scale;
    this.setData({
      imgScale: newScale,
      imgW: Math.round(this.data.imgNaturalWidth * newScale),
      imgH: Math.round(this.data.imgNaturalHeight * newScale)
    });
  },

  // 确认裁剪：把当前 canvas 内容导出为图片
  async confirmCrop() {
    const { tempImagePath, imgX, imgY, imgScale, imgNaturalWidth, imgNaturalHeight } = this.data;
    const boxW = 750 - 96;
    const boxH = boxW * 3 / 4;
    const dpr = wx.getSystemInfoSync().pixelRatio;

    return new Promise((resolve, reject) => {
      const ctx = wx.createCanvasContext('cropCanvas', this);
      ctx.drawImage(
        tempImagePath,
        imgX, imgY,
        imgNaturalWidth * imgScale,
        imgNaturalHeight * imgScale
      );
      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'cropCanvas',
          x: 0, y: 0,
          width: boxW, height: boxH,
          destWidth: boxW * dpr,
          destHeight: boxH * dpr,
          success: res => {
            this.setData({ tempImagePath: res.tempFilePath, showCropPreview: false });
            resolve(res.tempFilePath);
          },
          fail: reject
        }, this);
      });
    });
  },

  async submitPlant() {
    if (this._submitting) return;
    this._submitting = true;

    const { nickname, species, location, adoptDate, tempImagePath, waterInterval } = this.data;

    if (!nickname || !species || !location || !tempImagePath) {
      this._submitting = false;
      wx.showToast({ title: '请填写昵称、品种、位置并上传照片', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      // 如果还在预览拖动模式，先执行裁剪
      if (this.data.showCropPreview) {
        await this.confirmCrop();
      }
      const finalPath = this.data.tempImagePath;
      const cloudPath = `plant-photos/${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: finalPath });
      const fileID = uploadRes.fileID;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

      await db.collection('plants').add({
        data: {
          nickname,
          species,
          location,
          adoptDate: adoptDate || todayStr,
          photoFileID: fileID,
          waterInterval,
          lastWaterDate: today, // 以今天为起始浇水日期
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      wx.hideLoading();
      this._submitting = false;
      wx.showToast({ title: '添加成功！', icon: 'success', duration: 1200 });
      // 缩短延迟时间，优化用户体验
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
});
