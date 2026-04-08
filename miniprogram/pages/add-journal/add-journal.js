const db = wx.cloud.database();

Page({
  data: {
    plantId: '',
    plantName: '',
    note: '',
    tempImagePaths: [],
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
      wx.showToast({ title: '未指定植物', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ plantId: selectedId, plantName: selectedName });
  },

  // 选择多张照片
  chooseImage() {
    wx.chooseMedia({
      count: 9 - this.data.tempImagePaths.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    }).then(res => {
      const newPaths = res.tempFiles.map(file => file.tempFilePath);
      this.setData({ tempImagePaths: this.data.tempImagePaths.concat(newPaths) });
    }).catch(err => {
      console.error('【植光】选择照片失败:', err);
    });
  },

  // 删除某张图
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const list = [...this.data.tempImagePaths];
    list.splice(index, 1);
    this.setData({ tempImagePaths: list });
  },

  // 放大预览照片
  previewImage(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.url,
      urls: this.data.tempImagePaths
    });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  // 切换养护动作选中状态
  toggleAction(e) {
    const { index } = e.currentTarget.dataset;
    const actions = this.data.actions;
    actions[index].selected = !actions[index].selected;
    this.setData({ actions });
  },

  // 提交保存
  async submitJournal() {
    if (this._submitting) return;
    this._submitting = true;

    const { note, tempImagePaths, plantId } = this.data;
    const selectedActions = this.data.actions.filter(a => a.selected);

    // 动作、图片、文字三选一即可
    const hasAction = selectedActions.length > 0;
    const hasImage = tempImagePaths.length > 0;
    const hasNote = note.trim().length > 0;

    if (!hasAction && !hasImage && !hasNote) {
      this._submitting = false;
      wx.showToast({ title: '请至少填写一项内容', icon: 'none' });
      return;
    }

    if (!plantId) {
      this._submitting = false;
      wx.showToast({ title: '请选择要记录的植物', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在同步云端...' });

    try {
      // 上传所有图片
      const uploadTasks = this.data.tempImagePaths.map((path, index) => {
        const cloudPath = `journal/${Date.now()}-${index}-${Math.floor(Math.random() * 100000)}.jpg`;
        return wx.cloud.uploadFile({ cloudPath, filePath: path });
      });

      const uploadResults = await Promise.all(uploadTasks);
      const fileIDs = uploadResults.map(res => res.fileID);

      const selectedActionList = selectedActions.map(a => ({
        label: a.label,
        icon: a.icon
      }));

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

      // 如果本次有浇水动作，重置植物的 lastWaterDate
      const hasWater = selectedActions.some(a => a.label === '浇水');
      if (hasWater) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await db.collection('plants').doc(this.data.plantId).update({
          data: { lastWaterDate: today, updateTime: db.serverDate() }
        });
      }

      wx.hideLoading();
      wx.showToast({ title: '记录成功' });
      this._submitting = false;
      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      console.error(err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
