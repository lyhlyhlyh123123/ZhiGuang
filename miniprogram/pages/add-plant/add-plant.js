// pages/add-plant/add-plant.js
const db = wx.cloud.database();

Page({
  data: {
    nickname: '',
    species: '',
    location: '',
    adoptDate: '',
    tempImagePath: '',
    waterInterval: 7, // 默认浇水天数
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
      this.setData({ tempImagePath: res.tempFiles[0].tempFilePath });
    }).catch(err => {
      console.error('选择照片失败', err);
    });
  },

  async submitPlant() {
    if (this._submitting) return;
    this._submitting = true;

    const { nickname, species, location, adoptDate, tempImagePath, waterInterval } = this.data;

    if (!nickname || !species || !location || !adoptDate || !tempImagePath) {
      this._submitting = false;
      wx.showToast({ title: '请填写完整信息，包括上传一张照片哦', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      const cloudPath = `plant-photos/${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempImagePath });
      const fileID = uploadRes.fileID;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await db.collection('plants').add({
        data: {
          nickname,
          species,
          location,
          adoptDate,
          photoFileID: fileID,
          waterInterval,
          lastWaterDate: today, // 以今天为起始浇水日期
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      wx.hideLoading();
      wx.showToast({ title: '添加成功！', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1500);

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
