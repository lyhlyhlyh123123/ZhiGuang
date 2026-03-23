// pages/edit-plant/edit-plant.js
const db = wx.cloud.database();

Page({
  data: {
    plantId: '', // 保存当前正在编辑的植物 ID
    nickname: '',
    species: '',
    location: '', // ✨ 新增：摆放位置
    adoptDate: '',
    waterInterval: 7, // ✨ 新增：浇水周期
    remindEnabled: true, // ✨ 新增：提醒开关
    tempImagePath: '', 
    originalFileID: '', // 记住原本的云端图片ID
  },

  onLoad(options) {
    const id = options.id;
    this.setData({ plantId: id });
    this.fetchOldData(id); // 一进页面，立刻拉取老数据回显
  },

  // 1. 拉取老数据填入表单
  fetchOldData(id) {
    wx.showLoading({ title: '加载资料...' });
    db.collection('plants').doc(id).get().then(res => {
      wx.hideLoading();
      const data = res.data;
      this.setData({
        nickname: data.nickname,
        species: data.species,
        location: data.location || '', // ✨ 新增：回显摆放位置
        adoptDate: data.adoptDate,
        waterInterval: data.waterInterval || 7, // ✨ 回显：浇水周期
        remindEnabled: data.remindEnabled !== undefined ? data.remindEnabled : true, // ✨ 回显：提醒开关
        tempImagePath: data.photoFileID, // 把云端的图片路径赋值给预览图
        originalFileID: data.photoFileID
      });
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

  // ✨ 新增：切换提醒开关
  onRemindChange(e) {
    this.setData({ remindEnabled: e.detail.value });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
    }).then(res => {
      this.setData({ tempImagePath: res.tempFiles[0].tempFilePath });
    });
  },

  // 2. 提交更新的核心逻辑
  async submitPlant() {
    const { nickname, species, location, adoptDate, waterInterval, remindEnabled, tempImagePath, originalFileID, plantId } = this.data;

    if (!nickname || !species || !location || !adoptDate || !tempImagePath) {
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
          nickname: nickname,
          species: species,
          location: location, // ✨ 新增：更新摆放位置
          adoptDate: adoptDate,
          waterInterval: waterInterval, // ✨ 新增：更新浇水周期
          remindEnabled: remindEnabled, // ✨ 新增：更新提醒开关
          photoFileID: finalFileID,
          updateTime: db.serverDate()
        }
      });

      wx.hideLoading();
      wx.showToast({ title: '修改成功！', icon: 'success' });
      
      // 更新成功后退回详情页，注意详情页的 onShow 会自动刷新数据展示最新状态
      setTimeout(() => { wx.navigateBack({ delta: 1 }); }, 1500);

    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '更新失败', icon: 'error' });
      console.error(err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});