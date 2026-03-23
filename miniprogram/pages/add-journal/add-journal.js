const db = wx.cloud.database();

Page({
  data: {
    plantId: '',
    plantName: '',
    selectedPlantIndex: 0,
    plantOptions: [],
    note: '',
    tempImagePaths: [], // 存储多张本地路径
    actions: [
      { label: '浇水', value: 'water', icon: 'icon-Water', selected: true },
      { label: '晒太阳', value: 'sun', icon: 'icon-sun', selected: false },
      { label: '施肥', value: 'fertilize', icon: 'icon-feiliao', selected: false },
      { label: '修剪', value: 'prune', icon: 'icon-Scissors', selected: false },
      { label: '换盆', value: 'repot', icon: 'icon-penzai', selected: false },
      { label: '除虫', value: 'debug', icon: 'icon-qingkong', selected: false }
    ]
  },

  onLoad(options) {
    const selectedId = options.id || '';
    const selectedName = options.name || '';
    
    if (!selectedId) {
      wx.showToast({
        title: '未指定植物',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ plantId: selectedId, plantName: selectedName });
  },

  // 选择多张照片
  chooseImage() {
    wx.chooseMedia({
      count: 9 - this.data.tempImagePaths.length, // 剩余可传数量
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    }).then(res => {
      const newPaths = res.tempFiles.map(file => file.tempFilePath);
      this.setData({
        tempImagePaths: this.data.tempImagePaths.concat(newPaths)
      });
    });
  },

  // 删除某张图
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.tempImagePaths;
    list.splice(index, 1);
    this.setData({ tempImagePaths: list });
  },

  // ✨ 放大预览照片
  previewImage(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.url, // 当前显示图片的http链接
      urls: this.data.tempImagePaths // 需要预览的图片http链接列表
    });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  // ✨ 新增：切换养护动作选中状态
  toggleAction(e) {
    const { index } = e.currentTarget.dataset;
    const actions = this.data.actions;
    actions[index].selected = !actions[index].selected;
    this.setData({ actions });
  },

  // 提交保存（核心：多图异步上传）
  async submitJournal() {
    const selectedActions = this.data.actions.filter(a => a.selected);
    if (selectedActions.length === 0) {
      wx.showToast({ title: '请至少选一个动作', icon: 'none' });
      return;
    }

    if (!this.data.note.trim()) {
      wx.showToast({ title: '请填写记录内容', icon: 'none' });
      return;
    }

    if (!this.data.plantId) {
      wx.showToast({ title: '请选择要记录的植物', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在同步云端...' });

    try {
      // 1. 循环上传所有图片
      const uploadTasks = this.data.tempImagePaths.map((path, index) => {
        const cloudPath = `journal/${Date.now()}-${index}.jpg`;
        return wx.cloud.uploadFile({ cloudPath, filePath: path });
      });

      const uploadResults = await Promise.all(uploadTasks);
      const fileIDs = uploadResults.map(res => res.fileID);

      // 2. 拼装动作列表（保存原始图标与标签）
      const selectedActionList = selectedActions.map(a => ({
        label: a.label,
        icon: a.icon
      }));

      // 3. 存入数据库
      await db.collection('journals').add({
        data: {
          plantId: this.data.plantId,
          plantName: this.data.plantName,
          selectedActions: selectedActionList,
          note: this.data.note,
          photoList: fileIDs,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      // ✨ 如果勾选了“浇水”，且开启了提醒，尝试申请一次订阅消息权限
      const hasWatering = selectedActionList.some(a => a.label === '浇水');
      if (hasWatering) {
        console.log('【植光】检测到浇水动作，准备触发订阅消息提醒申请...');
        this.requestSubscribeMessage();
      }

      wx.hideLoading();
      wx.showToast({ title: '记录成功' });
      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      wx.hideLoading();
      console.error(err);
    }
  },

  // ✨ 申请订阅消息权限（预留接口）
  requestSubscribeMessage() {
    // 模板 ID 需要在小程序后台申请，这里先写逻辑
    const TEMPLATE_ID = ''; // 需填入实际的模板ID
    
    if (!TEMPLATE_ID) {
      console.warn('【植光】未配置订阅消息模板ID，跳过申请');
      return;
    }

    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success(res) {
        console.log('【植光】订阅消息申请结果:', res);
        if (res[TEMPLATE_ID] === 'accept') {
          wx.showToast({ title: '提醒已开启', icon: 'success' });
        }
      },
      fail(err) {
        console.error('【植光】订阅消息申请失败:', err);
      }
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }

});