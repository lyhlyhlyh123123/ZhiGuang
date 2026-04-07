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
    isTodoFilter: false,
  },

  onShow() {
    this.fetchPlants();
    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedUserInfo && cachedUserInfo.nickName) {
      this.setData({ userInfo: cachedUserInfo });
    }
    this.setCurrentDate();
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
    console.warn('【植光】图片加载失败，可能是权限或链接过期，已自动应用兜底图。ID:', id);
    
    // 找到失败的那一项并替换为默认图
    const plantList = this.data.plantList.map(item => {
      if (item._id === id) {
        return { ...item, photoFileID: '/images/avatar.png' }; // 使用本地头像图作为兜底
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
    wx.showNavigationBarLoading();

    const app = getApp();
    app.silentLogin().then(openid => {
      db.collection('plants')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .limit(PLANT_QUERY_LIMIT)
        .get()
        .then(async res => {
          wx.hideNavigationBarLoading();
          const rawPlants = res.data || [];

          const allPlants = rawPlants.map(p => ({
            ...p,
            waterCountdown: this.calcWaterCountdown(p)
          }));

          const { todoCount, todoPlants } = await this.calculateTodayTodos(allPlants);

          this.setData({
            allPlants,
            todoCount,
            todoPlants,
            searchKey: '',
            page: 1,
            isTodoFilter: false
          });
          this.applyFilter('');
        })
        .catch(err => {
          wx.hideNavigationBarLoading();
          console.error('【植光】获取植物列表失败', err);
          wx.showToast({ title: '加载失败', icon: 'none' });
        });
    });
  },

  /**
   * ✨ 计算哪些植物今天还没打卡
   */
  async calculateTodayTodos(plants) {
    if (!plants || plants.length === 0) return { todoCount: 0, todoPlants: [] };

    try {
      // 1. 获取今天零点的时间戳 (本地)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // 2. 获取今天所有的日记记录
      const _ = db.command;
      const journalRes = await db.collection('journals')
        .where({
          createTime: _.gte(todayStart)
        })
        .get();
      
      const todayJournals = journalRes.data || [];

      // 拿到今天已经照顾过的植物 ID 列表 (去重)
      const caredPlantIds = [...new Set(todayJournals.map(j => String(j.plantId)))];

      // 3. 找出还没照顾过的植物
      const todoPlants = plants.filter(plant => {
        const isCared = caredPlantIds.includes(String(plant._id));
        return !isCared;
      });

      return {
        todoCount: todoPlants.length,
        todoPlants
      };
    } catch (err) {
      console.error('【植光】计算今日待办失败:', err);
      // 兜底：如果查询失败，认为所有植物都需要打卡
      return { 
        todoCount: plants.length, 
        todoPlants: plants 
      };
    }
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

  // 搜索框输入事件
  onSearchInput(e) {
    const searchKey = e.detail.value.trim();
    this.setData({ 
      searchKey, 
      page: 1,
      isTodoFilter: false 
    });
    this.applyFilter(searchKey);
  },

  // 过滤 + 分页
  applyFilter(searchKey) {
    let filteredPlant = [];
    
    if (searchKey === 'TODO_CHECKIN') {
      // 打卡模式：显示今日未照顾列表
      filteredPlant = this.data.todoPlants;
    } else {
      // 普通搜索模式
      const lowerKey = (searchKey || '').toLowerCase();
      filteredPlant = (this.data.allPlants || []).filter(item => {
        if (!lowerKey) return true;
        const name = (item.nickname || '').toLowerCase();
        const species = (item.species || '').toLowerCase();
        return name.includes(lowerKey) || species.includes(lowerKey);
      });
    }

    const totalPages = Math.max(1, Math.ceil(filteredPlant.length / this.data.pageSize));
    const page = Math.min(this.data.page, totalPages);
    const start = (page - 1) * this.data.pageSize;
    const plantList = filteredPlant.slice(start, start + this.data.pageSize);

    this.setData({
      filteredPlants: filteredPlant,
      totalPages,
      page,
      plantList,
      noResults: filteredPlant.length === 0 && (searchKey !== '' && searchKey !== 'TODO_CHECKIN'),
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

  // 翻页按钮
  onPrevPage() {
    const page = Math.max(1, this.data.page - 1);
    this.setData({ page }, () => this.applyFilter(this.data.searchKey));
  },

  onNextPage() {
    const page = Math.min(this.data.totalPages, this.data.page + 1);
    this.setData({ page }, () => this.applyFilter(this.data.searchKey));
  },

  // 点击悬浮按钮，跳转到添加植物页面
  goToAddPlant() {
    wx.navigateTo({
      url: '/pages/add-plant/add-plant',
    });
  },

  // 点击植物卡片，跳转到详情页
  goToDetail(e) {
    const plantId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/plant-detail/plant-detail?id=${plantId}`,
    });
  }
});