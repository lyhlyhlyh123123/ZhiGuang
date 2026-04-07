// pages/edit-plant/edit-plant.js
const db = wx.cloud.database();

Page({
  data: {
    plantId: '',
    nickname: '',
    species: '',
    location: '',
    adoptDate: '',
    waterInterval: 7,
    tempImagePath: '', 
    originalFileID: '',
  },

  onLoad(options) {
    const id = options.id;
    this.setData({ plantId: id });
    // 等 silentLogin 完成后再拉数据，确保 openid 可用
    const app = getApp();
    app.silentLogin().then(() => {
      this.fetchOldData(id);
    }).catch(() => {
      this.fetchOldData(id); // 登录失败也尝试加载，权限校验会在 fetchOldData 里处理
    });
  },

  // 1. 拉取老数据填入表单
  fetchOldData(id) {
    wx.showLoading({ title: '加载资料...' });
    db.collection('plants').doc(id).get().then(res => {
      wx.hideLoading();
      const data = res.data;
      // 校验是否是本人的植物
      const app = getApp();
      const openid = app.globalData.openid;
      if (openid && data._openid && data._openid !== openid) {
        wx.showToast({ title: '无权编辑此植物', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      this.setData({
        nickname: data.nickname,
        species: data.species,
        location: data.location || '',
        adoptDate: data.adoptDate,
        waterInterval: data.waterInterval || 7,
        tempImagePath: data.photoFileID,
        originalFileID: data.photoFileID
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

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
    }).then(res => {
      this.setData({ tempImagePath: res.tempFiles[0].tempFilePath });
    }).catch(err => {
      console.error('【植光】选择照片失败:', err);
    });
  },

  // 2. 提交更新的核心逻辑
  async submitPlant() {
    if (this._submitting) return;
    this._submitting = true;

    const { nickname, species, location, adoptDate, waterInterval, tempImagePath, originalFileID, plantId } = this.data;

    if (!nickname || !species || !location || !adoptDate || !tempImagePath) {
      this._submitting = false;
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '更新中...' });

    try {
      let finalFileID = originalFileID; // 默认使用旧的图片 ID

      // 【核心难点】：判断用户有没有换新图片
      // 如果 tempImagePath 变成了 http 开头的本地路径，说明换了新图，需要上传
      if (!tempImagePath.startsWith('cloud://')) {
        const cloudPath = `plant-photos/${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempImagePath,
        });
        finalFileID = uploadRes.fileID; // 拿到新上传的云ID
      }

      // 用 update() 更新数据库中的这条记录
      await db.collection('plants').doc(plantId).update({
        data: {
          nickname,
          species,
          location,
          adoptDate,
          waterInterval,
          photoFileID: finalFileID,
          updateTime: db.serverDate()
        }
      });

      wx.hideLoading();
      wx.showToast({ title: '修改成功！', icon: 'success' });
      
      // 更新成功后退回详情页，注意详情页的 onShow 会自动刷新数据展示最新状态
      setTimeout(() => { wx.navigateBack({ delta: 1 }); }, 1500);

    } catch (err) {
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'error' });
      console.error(err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});