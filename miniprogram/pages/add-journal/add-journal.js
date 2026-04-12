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
      { label: '除虫', value: 'debug', icon: 'icon-qingkong', selected: false },
      { label: '里程碑', value: 'milestone', icon: 'icon-lichengbei', selected: false },
      { label: '自定义', value: 'custom', icon: 'icon-qita', selected: false, isCustom: true }
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
    // 所有标签都可以点击切换选中状态
    actions[index].selected = !actions[index].selected;
    this.setData({ actions });
  },

  // 长按自定义标签
  longPressAction(e) {
    const { index } = e.currentTarget.dataset;
    const actions = this.data.actions;
    const action = actions[index];

    if (action.isCustom) {
      wx.showModal({
        title: '自定义操作',
        editable: true,
        placeholderText: '请输入操作名称',
        content: '',
        success: (res) => {
          if (res.confirm && res.content && res.content.trim()) {
            const customName = res.content.trim();
            // 只修改标签名，不自动选中
            actions[index].label = customName;
            this.setData({ actions });
          }
        }
      });
    }
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
      // ✅ 优化：使用 Promise.allSettled 处理图片上传
      let fileIDs = [];
      
      if (this.data.tempImagePaths.length > 0) {
        const uploadTasks = this.data.tempImagePaths.map((path, index) => {
          const cloudPath = `journal/${Date.now()}-${index}-${Math.floor(Math.random() * 100000)}.jpg`;
          return wx.cloud.uploadFile({ cloudPath, filePath: path });
        });

        const uploadResults = await Promise.allSettled(uploadTasks);
        
        // 收集成功上传的文件ID
        fileIDs = uploadResults
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value.fileID);
        
        const failedCount = uploadResults.filter(r => r.status === 'rejected').length;
        
        // 如果有图片上传失败，提示用户
        if (failedCount > 0) {
          wx.showToast({
            title: `${failedCount}张图片上传失败`,
            icon: 'none',
            duration: 2000
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      const selectedActionList = selectedActions.map(a => ({
        label: a.label,
        icon: a.icon
      }));

      // ✅ 优化：添加事务处理，数据库保存失败时删除已上传的图片
      let journalAdded = false;
      try {
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
        journalAdded = true;

        // 如果本次有浇水动作，重置植物的 lastWaterDate
        const hasWater = selectedActions.some(a => a.label === '浇水');
        if (hasWater) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          await db.collection('plants').doc(this.data.plantId).update({
            data: { lastWaterDate: today, updateTime: db.serverDate() }
          });
        }
      } catch (dbErr) {
        // 数据库操作失败，删除已上传的图片
        if (fileIDs.length > 0) {
          wx.cloud.deleteFile({
            fileList: fileIDs
          }).then(() => {
            console.log('【植光】已清理上传失败的图片');
          }).catch(() => {
            console.warn('【植光】清理图片失败（不影响主流程）');
          });
        }
        throw dbErr; // 继续抛出错误，由外层 catch 处理
      }

      wx.hideLoading();
      wx.showToast({ title: '记录成功' });
      this._submitting = false;
      
      // 恢复自定义标签的原始文字
      const resetActions = this.data.actions.map(a => {
        if (a.isCustom) {
          return { ...a, label: '自定义', selected: false };
        }
        return a;
      });
      this.setData({ actions: resetActions });
      
      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      console.error('【植光】保存日记失败:', err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
