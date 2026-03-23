// pages/add-plant/add-plant.js
const db = wx.cloud.database();

Page({
  data: {
    nickname: '',
    species: '',
    location: '', // ✨ 新增：摆放位置
    adoptDate: '',
    tempImagePath: '',
    waterInterval: 7, // 默认浇水天数
    remindEnabled: true // 默认开启提醒
  },

  onDateChange(e) {
    this.setData({
      adoptDate: e.detail.value
    });
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

  // ✨ 新增：选择照片的核心方法
  chooseImage() {
    // 唤起相册/相机
    wx.chooseMedia({
      count: 1, // 只允许选一张
      mediaType: ['image'], // 只允许图片
      sourceType: ['album', 'camera'], // 允许相册和相机
    }).then(res => {
      // 拿到本地临时路径
      const tempFilePath = res.tempFiles[0].tempFilePath;
      console.log('【植光】选择照片成功:', tempFilePath);
      
      this.setData({
        tempImagePath: tempFilePath
      });
    }).catch(err => {
      console.error('选择照片失败', err);
    });
  },

  // 修改：保存植物档案的逻辑
  async submitPlant() {
    const { nickname, species, location, adoptDate, tempImagePath, waterInterval, remindEnabled } = this.data;

    // 1. 表单校验
    if (!nickname || !species || !location || !adoptDate || !tempImagePath) {
      wx.showToast({
        title: '请填写完整信息，包括上传一张照片哦',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      // 2. ✨ 最核心的一步：上传图片到“云存储”
      const cloudPath = `plant-photos/${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
      
      console.log('【植光】正在上传图片到云存储...');
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempImagePath,
      });
      
      const fileID = uploadRes.fileID; 
      console.log('【植光】图片上传成功，fileID:', fileID);

      // 3. 将 fileID 连同其他文本数据一起存入数据库
      console.log('【植光】正在写入数据库...');
      db.collection('plants').add({
        data: {
          nickname,
          species,
          location, // ✨ 新增：保存摆放位置
          adoptDate,
          photoFileID: fileID,
          waterInterval, // ✨ 补充保存：浇水周期
          remindEnabled, // ✨ 补充保存：提醒开关
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      }).then(res => {
        wx.hideLoading();
        wx.showToast({ title: '添加成功！', icon: 'success' });
        console.log('【植光】数据库插入成功，记录ID:', res._id);
        
        // 延迟返回首页
        setTimeout(() => {
          wx.navigateBack({ delta: 1 });
        }, 1500);
      });

    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'error' });
      console.error('【植光】图片上传或数据库写入失败:', err);
    }
  },

  // 返回按钮
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // 步进器：减少天数
  minusInterval() {
    if (this.data.waterInterval > 1) {
      this.setData({ waterInterval: this.data.waterInterval - 1 });
    }
  },

  // 步进器：增加天数
  addInterval() {
    if (this.data.waterInterval < 30) {
      this.setData({ waterInterval: this.data.waterInterval + 1 });
    }
  },

  // 切换提醒开关
  onRemindChange(e) {
    this.setData({ remindEnabled: e.detail.value });
  },
});