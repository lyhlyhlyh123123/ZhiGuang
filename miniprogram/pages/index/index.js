// pages/index/index.js
const db = wx.cloud.database();
const PLANT_QUERY_LIMIT = 100; // 单次查询植物上限

Page({
  data: {
    plantList: [],
    allPlants: [],
    filteredPlants: [],
    searchKey: '',
    page: 1,
    pageSize: 8,
    totalPages: 0,
    noResults: false,
    noPlants: false,
    userInfo: null,
    currentDate: '',
    todoCount: 0,
    todoPlants: [],
    todoAvatars: [],
    isTodoFilter: false,
  },

  onShow() {
    this.fetchPlants();
    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedUserInfo && cachedUserInfo.nickName) {
      this.setData({ userInfo: cachedUserInfo });
    }
    this.setCurrentDate();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },
  // 设置当前日期
  setCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    this.setData({
      currentDate: `${year}年${month}月${day}日`
    });
  },

  // 点击头像区域 → 跳转资料编辑页
  handleProfileTap() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit'
    });
  },

  // ✨ 新增：图片加载失败处理 (解决 403 或其他加载问题)
  onImageError(e) {
    const { id } = e.currentTarget.dataset;
    console.warn('【植光】图片加载失败，ID:', id);
    
    // 尝试通过 getTempFileURL 重新获取临时链接
    const plant = this.data.plantList.find(p => p._id === id);
    if (plant && plant.photoFileID && plant.photoFileID.startsWith('cloud://')) {
      wx.cloud.getTempFileURL({
        fileList: [plant.photoFileID]
      }).then(res => {
        if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
          // 重新获取成功，更新为临时链接
          const plantList = this.data.plantList.map(item => {
            if (item._id === id) {
              return { ...item, photoFileID: res.fileList[0].tempFileURL };
            }
            return item;
          });
          this.setData({ plantList });
        } else {
          // 获取失败，使用兜底图
          this.setFallbackImage(id);
        }
      }).catch(() => {
        // 获取失败，使用兜底图
        this.setFallbackImage(id);
      });
    } else {
      // 非云存储图片，直接使用兜底图
      this.setFallbackImage(id);
    }
  },

  // 设置兜底图片
  setFallbackImage(id) {
    const plantList = this.data.plantList.map(item => {
      if (item._id === id) {
        return { ...item, photoFileID: '/images/avatar.png' };
      }
      return item;
    });
    this.setData({ plantList });
  },

  // 计算距离下次浇水还有几天（负数表示已逾期）
  calcWaterCountdown(plant) {
    const interval = plant.waterInterval || 7;
    if (!plant.lastWaterDate) return interval; // 没有记录，返回完整周期
    const last = new Date(plant.lastWaterDate);
    last.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    return interval - diffDays;
  },

  // 去云端拉取植物列表的方法
  fetchPlants() {
    // 节流：1分钟内不重复请求，但从子页面返回时强制刷新
    const now = Date.now();
    if (!this._needRefresh && this._lastFetchTime && now - this._lastFetchTime < 60000) {
      return;
    }
    this._needRefresh = false;
    this._lastFetchTime = now;
    wx.showNavigationBarLoading();

    const app = getApp();
    app.silentLogin().then(() => {
      // 并行拉取植物列表（通过云函数，无20条限制）和今日日记
      const plantsPromise = wx.cloud.callFunction({
        name: 'getMyPlants'
      });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const _ = db.command;
      const journalsPromise = db.collection('journals')
        .where({ createTime: _.gte(todayStart) })
        .get();

      Promise.all([plantsPromise, journalsPromise])
        .then(([plantsRes, journalsRes]) => {
          wx.hideNavigationBarLoading();
          const rawPlants = (plantsRes.result && plantsRes.result.plants) || [];
          const todayJournals = journalsRes.data || [];

          const allPlants = rawPlants.map(p => ({
            ...p,
            waterCountdown: this.calcWaterCountdown(p)
          }));

          const caredPlantIds = [...new Set(todayJournals.map(j => String(j.plantId)))];
          const todoPlants = allPlants.filter(p => !caredPlantIds.includes(String(p._id)));

          // 如果没有保留的状态，重置为默认值
          const shouldResetState = !this._preserveState;
          this.setData({
            allPlants,
            todoCount: todoPlants.length,
            todoPlants,
            todoAvatars: todoPlants.slice(0, 3), // 只取前3个用于头像展示
            searchKey: shouldResetState ? '' : this.data.searchKey,
            page: shouldResetState ? 1 : this.data.page,
            isTodoFilter: shouldResetState ? false : this.data.isTodoFilter
          });
          this._preserveState = false; // 使用后重置标志
          this.applyFilter(this.data.searchKey || (this.data.isTodoFilter ? 'TODO_CHECKIN' : ''));
        })
        .catch(err => {
          wx.hideNavigationBarLoading();
          console.error('【植光】获取植物列表失败', err);
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    });
  },

  /**
   * ✨ 切换待办（未打卡）筛选模式
   */
  toggleTodoFilter() {
    const isTodoFilter = !this.data.isTodoFilter;
    this.setData({ 
      isTodoFilter,
      page: 1,
      searchKey: '' // 切换时始终清空搜索框，避免显示异常
    });
    this.applyFilter(isTodoFilter ? 'TODO_CHECKIN' : '');
  },

  // 搜索框输入事件（防抖 300ms）
  onSearchInput(e) {
    const searchKey = e.detail.value.trim();
    this.setData({ searchKey, page: 1, isTodoFilter: false });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.applyFilter(searchKey);
    }, 300);
  },

  // 过滤 + 分页（支持联合查询，带缓存优化）
  applyFilter(searchKey) {
    // 性能优化：如果搜索关键词和数据都没变，使用缓存结果
    if (this._lastSearchKey === searchKey && this._cachedFilteredPlants &&
        this._lastAllPlantsCount === (this.data.allPlants || []).length) {
      this.renderPage(this._cachedFilteredPlants);
      return;
    }
    
    let filteredPlant = [];
    
    if (searchKey === 'TODO_CHECKIN') {
      // 打卡模式：显示今日未照顾列表
      filteredPlant = this.data.todoPlants;
    } else {
      // 普通搜索模式（支持 / 联合查询）
      const key = searchKey || '';
      if (!key) {
        filteredPlant = this.data.allPlants || [];
      } else {
        // 支持 / 分隔符联合查询，例如：多肉/客厅
        const parts = key.split('/').map(s => s.trim().toLowerCase()).filter(Boolean);
        filteredPlant = (this.data.allPlants || []).filter(item => {
          return parts.every(part => {
            const name = (item.nickname || '').toLowerCase();
            const species = (item.species || '').toLowerCase();
            const location = (item.location || '').toLowerCase();
            return name.includes(part) || species.includes(part) || location.includes(part);
          });
        });
      }
    }
    
    // 缓存过滤结果
    this._lastSearchKey = searchKey;
    this._cachedFilteredPlants = filteredPlant;
    this._lastAllPlantsCount = (this.data.allPlants || []).length;
    
    this.renderPage(filteredPlant);
  },

  // 渲染分页数据（从 applyFilter 中提取）
  renderPage(filteredPlant) {

    const totalPages = Math.max(1, Math.ceil(filteredPlant.length / this.data.pageSize));
    const page = Math.min(this.data.page, totalPages);
    const start = (page - 1) * this.data.pageSize;
    const plantList = filteredPlant.slice(start, start + this.data.pageSize);

    this.setData({
      filteredPlants: filteredPlant,
      totalPages,
      page,
      plantList,
      noResults: filteredPlant.length === 0 && (this._lastSearchKey !== '' && this._lastSearchKey !== 'TODO_CHECKIN'),
      noPlants: this.data.allPlants.length === 0
    });
  },

  /**
   * 用户点击右上角分享给朋友
   */
  onShareAppMessage() {
    return {
      title: '植光 ZhiGuang - 记录每一寸破土而出的生命',
      path: '/pages/index/index'
    };
  },

  /**
   * 用户点击右上角分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '植光 ZhiGuang - 记录每一寸破土而出的生命',
      path: '/pages/index/index'
    };
  },

  // 翻页按钮（优化：直接渲染，无需重新过滤）
  onPrevPage() {
    const page = Math.max(1, this.data.page - 1);
    this.setData({ page }, () => {
      // 使用缓存的过滤结果，只需重新分页
      if (this._cachedFilteredPlants) {
        this.renderPage(this._cachedFilteredPlants);
      } else {
        this.applyFilter(this.data.searchKey);
      }
    });
  },

  onNextPage() {
    const page = Math.min(this.data.totalPages, this.data.page + 1);
    this.setData({ page }, () => {
      // 使用缓存的过滤结果，只需重新分页
      if (this._cachedFilteredPlants) {
        this.renderPage(this._cachedFilteredPlants);
      } else {
        this.applyFilter(this.data.searchKey);
      }
    });
  },

  goToAddPlant() {
    this._needRefresh = true; // 返回时强制刷新
    wx.navigateTo({ url: '/pages/add-plant/add-plant' });
  },

  goToDetail(e) {
    // 防抖保护：防止用户快速重复点击
    if (this._clicking) return;
    this._clicking = true;
    setTimeout(() => this._clicking = false, 500);
    
    this._needRefresh = true; // 返回时强制刷新
    this._preserveState = true; // 保留当前页面状态
    const plantId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/plant-detail/plant-detail?id=${plantId}` });
  }
});