// pages/add-plant/add-plant.js
const { uploadImages } = require('../../utils/imageHelper.js');
const { smartCompress } = require('../../utils/imageCompressor.js');
const { getDefaultPresets } = require('../../utils/careHelper.js');

Page({
  data: {
    nickname: '',
    species: '',
    location: '',
    source: '',
    remark: '',
    adoptDate: '',
    tempImagePaths: [],
    maxImageCount: 9,
    selectedIndex: -1,
    speciesCategories: [],
    locationCategories: [],
    carePlanEnabled: false,
    careTasks: [],
  },

  onLoad() {
    const app = getApp();
    this.setData({
      speciesCategories: app.globalData.speciesCategories || [],
      locationCategories: app.globalData.locationCategories || [],
      careTasks: getDefaultPresets()
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

  onLocationInput(e) {
    this.setData({ location: e.detail.value });
  },

  // 选择品种
  selectSpecies(e) {
    this.setData({ species: e.currentTarget.dataset.val });
  },

  // 选择位置
  selectLocation(e) {
    this.setData({ location: e.currentTarget.dataset.val });
  },

  quickSetLocation(e) {
    this.setData({ location: e.currentTarget.dataset.val });
  },

  // 显示添加品种对话框
  showAddSpeciesDialog() {
    wx.showModal({
      title: '添加品种类目',
      editable: true,
      placeholderText: '请输入植物品种名称',
      success: (res) => {
        if (res.confirm && res.content) {
          const app = getApp();
          const success = app.addSpeciesCategory(res.content);
          if (success) {
            this.setData({
              speciesCategories: app.globalData.speciesCategories
            });
            wx.showToast({ title: '添加成功', icon: 'success' });
          } else {
            wx.showToast({ title: '该类目已存在', icon: 'none' });
          }
        }
      }
    });
  },

  // 显示添加位置对话框
  showAddLocationDialog() {
    wx.showModal({
      title: '添加位置类目',
      editable: true,
      placeholderText: '请输入摆放位置名称',
      success: (res) => {
        if (res.confirm && res.content) {
          const app = getApp();
          const success = app.addLocationCategory(res.content);
          if (success) {
            this.setData({
              locationCategories: app.globalData.locationCategories
            });
            wx.showToast({ title: '添加成功', icon: 'success' });
          } else {
            wx.showToast({ title: '该类目已存在', icon: 'none' });
          }
        }
      }
    });
  },

  // 删除品种类目
  deleteSpeciesCategory(e) {
    const name = e.currentTarget.dataset.val;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${name}"这个品种类目吗？`,
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.removeSpeciesCategory(name);
          this.setData({
            speciesCategories: app.globalData.speciesCategories
          });
          // 如果当前选中的是被删除的类目，清空选择
          if (this.data.species === name) {
            this.setData({ species: '' });
          }
          wx.showToast({ title: '删除成功', icon: 'success' });
        }
      }
    });
  },

  // 删除位置类目
  deleteLocationCategory(e) {
    const name = e.currentTarget.dataset.val;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${name}"这个位置类目吗？`,
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.removeLocationCategory(name);
          this.setData({
            locationCategories: app.globalData.locationCategories
          });
          // 如果当前选中的是被删除的类目，清空选择
          if (this.data.location === name) {
            this.setData({ location: '' });
          }
          wx.showToast({ title: '删除成功', icon: 'success' });
        }
      }
    });
  },

  onSourceInput(e) {
    this.setData({ source: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 选择图片（支持多选）
  async chooseImages() {
    const remaining = this.data.maxImageCount - this.data.tempImagePaths.length;
    
    if (remaining <= 0) {
      wx.showToast({ title: `最多只能上传${this.data.maxImageCount}张图片`, icon: 'none' });
      return;
    }

    try {
      const res = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed', 'original'],
      });

      // ✅ 显示压缩进度
      if (res.tempFiles.length > 0) {
        wx.showLoading({ title: '图片处理中...', mask: true });
      }

      // ✅ 智能压缩所有图片（根据大小自动选择压缩策略）
      const compressTasks = res.tempFiles.map(file =>
        smartCompress(file.tempFilePath)
      );
      
      const compressedPaths = await Promise.all(compressTasks);
      wx.hideLoading();

      const allPaths = [...this.data.tempImagePaths, ...compressedPaths];
      this.setData({ tempImagePaths: allPaths });

      // ✅ 提示压缩结果
      wx.showToast({
        title: `已添加${compressedPaths.length}张图片`,
        icon: 'success',
        duration: 1500
      });
    } catch (err) {
      wx.hideLoading();
      console.error('【小植书】选择照片失败:', err);
    }
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

    const { nickname, species, location, source, remark, adoptDate, tempImagePaths, carePlanEnabled, careTasks } = this.data;

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

    if (carePlanEnabled && !careTasks.some(t => t.enabled)) {
      this._submitting = false;
      wx.showToast({ title: '请至少启用一项养护任务，或关闭养护计划', icon: 'none', duration: 2500 });
      return;
    }

    wx.showLoading({ title: '上传中...' });

    try {
      const uploadResult = await uploadImages(tempImagePaths, 'plant-photos', false);
      const photoList = uploadResult.success;

      if (uploadResult.failed > 0) {
        wx.showToast({ title: `${uploadResult.failed}张图片上传失败`, icon: 'none', duration: 2000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

      const waterTask = careTasks.find(t => t.taskId === 'water');
      const waterInterval = waterTask ? waterTask.interval : 7;

      const addResult = await wx.cloud.callFunction({
        name: 'addPlant',
        data: {
          nickname,
          species,
          location,
          source: source || '',
          remark: remark || '',
          adoptDate: adoptDate || todayStr,
          photoList,
          waterInterval,
          carePlanEnabled,
          careTasks
        }
      });

      if (!addResult.result.success) {
        throw new Error(addResult.result.message);
      }

      const app = getApp();
      app.globalData.needRefreshIndex = true;

      wx.hideLoading();
      this._submitting = false;
      wx.showToast({ title: '添加成功！', icon: 'success', duration: 1000 });
      setTimeout(() => { wx.navigateBack({ delta: 1 }); }, 1000);

    } catch (err) {
      this._submitting = false;
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'error' });
      console.error('【小植书】保存失败:', err);
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  toggleCarePlan() {
    this.setData({ carePlanEnabled: !this.data.carePlanEnabled });
  },

  toggleTaskEnabled(e) {
    const { index } = e.currentTarget.dataset;
    const careTasks = [...this.data.careTasks];
    careTasks[index] = { ...careTasks[index], enabled: !careTasks[index].enabled };
    this.setData({ careTasks });
  },

  onTaskIntervalInput(e) {
    const { index } = e.currentTarget.dataset;
    const val = parseInt(e.detail.value, 10);
    if (isNaN(val) || val < 1) return;
    const careTasks = [...this.data.careTasks];
    careTasks[index] = { ...careTasks[index], interval: Math.min(val, 365) };
    this.setData({ careTasks });
  },

  onTaskNameInput(e) {
    const { index } = e.currentTarget.dataset;
    const careTasks = [...this.data.careTasks];
    careTasks[index] = { ...careTasks[index], name: e.detail.value };
    this.setData({ careTasks });
  },

  addCustomTask() {
    const careTasks = [...this.data.careTasks];
    const taskId = 'custom_' + Date.now();
    careTasks.push({ taskId, name: '', icon: 'icon-jilu', interval: 7, lastDate: null, enabled: true });
    this.setData({ careTasks });
  },

  removeCustomTask(e) {
    const { index } = e.currentTarget.dataset;
    const careTasks = [...this.data.careTasks];
    careTasks.splice(index, 1);
    this.setData({ careTasks });
  },

  onUnload() {
    this._submitting = false;
  }
});
