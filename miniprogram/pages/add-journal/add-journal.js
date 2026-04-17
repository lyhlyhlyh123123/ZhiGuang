const { smartCompress } = require('../../utils/imageCompressor.js');
const { invalidateCache } = require('../../utils/imageCache.js');

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
    ],
    editMode: false,  // 是否为编辑模式
    journalId: '',    // 编辑时的日记ID
    originalPhotoList: [],  // 编辑时的原始图片列表（云文件ID）
    selectedDate: '',  // 选择的日期 YYYY-MM-DD
    selectedTime: '',  // 选择的时间 HH:mm
    currentDate: ''    // 当前日期，用于限制不能选择未来日期
  },

  onLoad(options) {
    const selectedId = options.id || '';
    const selectedName = options.name || '';
    const editMode = options.editMode === 'true';
    const journalData = options.journalData;

    // 设置当前日期
    const now = new Date();
    const currentDate = this.formatDate(now);
    
    if (!selectedId) {
      wx.showToast({ title: '未指定植物', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ 
      plantId: selectedId, 
      plantName: selectedName,
      editMode: editMode,
      currentDate: currentDate
    });

    // 如果是编辑模式，加载日记数据
    if (editMode && journalData) {
      try {
        const journal = JSON.parse(decodeURIComponent(journalData));
        this.loadJournalData(journal);
      } catch (err) {
        console.error('【植光】解析日记数据失败:', err);
        wx.showToast({ title: '加载日记失败', icon: 'none' });
      }
    }
  },

  // 格式化日期为 YYYY-MM-DD
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 格式化时间为 HH:mm
  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  // 加载日记数据到编辑表单
  loadJournalData(journal) {
    const actions = [...this.data.actions];
    
    // 重置所有选中状态
    actions.forEach(a => a.selected = false);
    
    // 根据日记中的动作设置选中状态
    if (journal.selectedActions && journal.selectedActions.length > 0) {
      journal.selectedActions.forEach(selectedAction => {
        // 先尝试精确匹配标签名
        let action = actions.find(a => a.label === selectedAction.label);
        
        // 如果没找到，检查是否是自定义标签
        if (!action) {
          // 查找自定义标签项
          const customAction = actions.find(a => a.isCustom);
          if (customAction) {
            // 恢复自定义名称并选中
            customAction.label = selectedAction.label;
            customAction.selected = true;
          }
        } else {
          // 找到了匹配的标准标签，直接选中
          action.selected = true;
        }
      });
    }
    
    // 加载时间信息
    let selectedDate = '';
    let selectedTime = '';
    if (journal.createTime) {
      const createDate = new Date(journal.createTime);
      selectedDate = this.formatDate(createDate);
      selectedTime = this.formatTime(createDate);
    }
    
    this.setData({
      journalId: journal._id,
      note: journal.note || '',
      tempImagePaths: journal.photoList || [],
      originalPhotoList: journal.photoList || [],
      actions: actions,
      selectedDate: selectedDate,
      selectedTime: selectedTime
    });

    // 修改导航栏标题
    wx.setNavigationBarTitle({ title: `编辑 ${this.data.plantName} 的记录` });
  },

  // 日期选择变化
  onDateChange(e) {
    this.setData({
      selectedDate: e.detail.value
    });
  },

  // 时间选择变化
  onTimeChange(e) {
    this.setData({
      selectedTime: e.detail.value
    });
  },

  // 选择多张照片
  async chooseImage() {
    const remaining = 9 - this.data.tempImagePaths.length;
    
    if (remaining <= 0) {
      wx.showToast({ title: '最多只能上传9张图片', icon: 'none' });
      return;
    }

    try {
      const res = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['original'], // ✅ 先选择原图，然后智能压缩
      });

      // ✅ 显示压缩进度
      if (res.tempFiles.length > 0) {
        wx.showLoading({ title: '图片处理中...', mask: true });
      }

      // ✅ 智能压缩所有图片
      const compressTasks = res.tempFiles.map(file =>
        smartCompress(file.tempFilePath)
      );
      
      const compressedPaths = await Promise.all(compressTasks);
      wx.hideLoading();

      this.setData({
        tempImagePaths: this.data.tempImagePaths.concat(compressedPaths)
      });

      wx.showToast({
        title: `已添加${compressedPaths.length}张图片`,
        icon: 'success',
        duration: 1500
      });
    } catch (err) {
      wx.hideLoading();
      console.error('【植光】选择照片失败:', err);
    }
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

  // 获取创建时间（用户选择的时间或当前时间）
  getCreateTime() {
    const { selectedDate, selectedTime } = this.data;
    
    // 如果用户选择了日期和时间（iOS兼容格式：使用T分隔日期和时间）
    if (selectedDate && selectedTime) {
      const dateTimeStr = `${selectedDate}T${selectedTime}:00`;
      return new Date(dateTimeStr);
    }
    
    // 如果只选择了日期，时间为00:00
    if (selectedDate && !selectedTime) {
      const dateTimeStr = `${selectedDate}T00:00:00`;
      return new Date(dateTimeStr);
    }
    
    // 如果只选择了时间，日期为今天
    if (!selectedDate && selectedTime) {
      const today = this.formatDate(new Date());
      const dateTimeStr = `${today}T${selectedTime}:00`;
      return new Date(dateTimeStr);
    }
    
    // 都没选择，使用当前时间
    return new Date();
  },

  // 提交保存
  async submitJournal() {
    if (this._submitting) return;
    this._submitting = true;

    const { note, tempImagePaths, plantId, editMode, journalId, originalPhotoList } = this.data;
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

    wx.showLoading({ title: editMode ? '正在更新...' : '正在同步云端...' });

    try {
      let fileIDs = [];
      let newFileIDs = [];
      let deletedPhotos = [];

      if (editMode) {
        const originalPhotos = originalPhotoList || [];
        const newPhotos = [];
        const keptPhotos = [];

        tempImagePaths.forEach(path => {
          if (path.startsWith('cloud://')) {
            keptPhotos.push(path);
          } else {
            newPhotos.push(path);
          }
        });

        if (newPhotos.length > 0) {
          const uploadTasks = newPhotos.map((path, index) => {
            const cloudPath = `journal/${Date.now()}-${index}-${Math.floor(Math.random() * 100000)}.jpg`;
            return wx.cloud.uploadFile({ cloudPath, filePath: path });
          });

          const uploadResults = await Promise.allSettled(uploadTasks);
          newFileIDs = uploadResults
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value.fileID);

          const failedCount = uploadResults.filter(r => r.status === 'rejected').length;
          if (failedCount > 0) {
            wx.showToast({
              title: `${failedCount}张图片上传失败`,
              icon: 'none',
              duration: 2000
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        let newFileIDIndex = 0;
        fileIDs = tempImagePaths.map(path => {
          if (path.startsWith('cloud://')) return path;
          return newFileIDs[newFileIDIndex++] || null;
        }).filter(Boolean);
        deletedPhotos = (originalPhotoList || []).filter(photo => !fileIDs.includes(photo));
        if (deletedPhotos.length > 0) {
          invalidateCache(deletedPhotos);
        }
      } else {
        if (tempImagePaths.length > 0) {
          const uploadTasks = tempImagePaths.map((path, index) => {
            const cloudPath = `journal/${Date.now()}-${index}-${Math.floor(Math.random() * 100000)}.jpg`;
            return wx.cloud.uploadFile({ cloudPath, filePath: path });
          });

          const uploadResults = await Promise.allSettled(uploadTasks);
          fileIDs = uploadResults
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value.fileID);

          const failedCount = uploadResults.filter(r => r.status === 'rejected').length;
          if (failedCount > 0) {
            wx.showToast({
              title: `${failedCount}张图片上传失败`,
              icon: 'none',
              duration: 2000
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          newFileIDs = fileIDs;
        }
      }

      const selectedActionList = selectedActions.map(a => ({
        label: a.label,
        icon: a.icon
      }));
      const createTime = this.getCreateTime();
      const createTimeValue = createTime.toISOString();

      if (editMode) {
        const updateResult = await wx.cloud.callFunction({
          name: 'updateJournal',
          data: {
            journalId,
            selectedActions: selectedActionList,
            note: note,
            photoList: fileIDs,
            createTime: createTimeValue,
            deletedPhotos,
            newFileIDs
          }
        });

        if (!updateResult.result.success) {
          throw new Error(updateResult.result.message);
        }

        wx.hideLoading();
        wx.showToast({ title: '更新成功' });
        this._submitting = false;
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        const addResult = await wx.cloud.callFunction({
          name: 'addJournal',
          data: {
            plantId,
            selectedActions: selectedActionList,
            note: note,
            photoList: fileIDs,
            createTime: createTimeValue,
            newFileIDs
          }
        });

        if (!addResult.result.success) {
          throw new Error(addResult.result.message);
        }

        wx.hideLoading();
        wx.showToast({ title: '记录成功' });
        this._submitting = false;

        const resetActions = this.data.actions.map(a => {
          if (a.isCustom) {
            return { ...a, label: '自定义', selected: false };
          }
          return { ...a, selected: false };
        });
        this.setData({ actions: resetActions });

        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (err) {
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: editMode ? '更新失败，请重试' : '保存失败，请重试', icon: 'none' });
      console.error('【植光】保存日记失败:', err);
      // 清理本次已上传但未入库的孤儿图片
      if (newFileIDs && newFileIDs.length > 0) {
        wx.cloud.deleteFile({ fileList: newFileIDs }).catch(() => {});
      }
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});