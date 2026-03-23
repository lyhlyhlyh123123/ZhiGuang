// pages/index/index.js
const db = wx.cloud.database();

Page({
  data: {
    plantList: [], // 当前页面展示的植物数组
    allPlants: [], // 原始完整列表，用于分页和搜索
    filteredPlants: [], // 已筛选列表
    searchKey: '', // 搜索关键词
    page: 1,
    pageSize: 8,
    totalPages: 0,
    noResults: false,
    userInfo: null,
    currentDate: '',
    // 待办数据
    todoCount: 0,
    todoPlants: [],
    isTodoFilter: false, // 是否处于待办筛选模式
    // 强制登录状态控制
    showOverlay: false,
    tempAvatarUrl: '',
    tempNickname: '',
    canSubmit: false,
    isChoosingAvatar: false
  },

  onShow() {
    this.fetchPlants();
    this.checkLoginStatus();
    this.setCurrentDate();
  },

  // ✨ 检查登录状态并锁定资料同步
  checkLoginStatus() {
    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (!cachedUserInfo || cachedUserInfo.nickName === '微信用户') {
      this.setData({ showOverlay: true });
    } else {
      this.setData({ 
        userInfo: cachedUserInfo,
        showOverlay: false 
      });
    }
  },

  // ✨ 锁定按钮防止重复触发
  handleAvatarTap() {
    this.setData({ isChoosingAvatar: true });
    // 3秒后自动解锁，防止微信面板未弹出导致的死锁
    setTimeout(() => {
      this.setData({ isChoosingAvatar: false });
    }, 3000);
  },

  // 选择头像回调
  onChooseAvatar(e) {
    this.setData({ isChoosingAvatar: false });
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatarUrl: avatarUrl });
    this.checkCanSubmit();
  },

  // 昵称输入相关
  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value });
    this.checkCanSubmit();
  },
  onNicknameBlur(e) {
    this.setData({ tempNickname: e.detail.value });
    this.checkCanSubmit();
  },

  checkCanSubmit() {
    const { tempAvatarUrl, tempNickname } = this.data;
    this.setData({
      canSubmit: !!(tempAvatarUrl && tempNickname.trim())
    });
  },

  // 保存资料并开启旅程
  async saveUserProfile() {
    const { tempAvatarUrl, tempNickname } = this.data;
    wx.showLoading({ title: '正在开启旅程...' });

    try {
      let finalAvatarUrl = tempAvatarUrl;
      // 头像路径持久化
      if (tempAvatarUrl.startsWith('http://tmp') || tempAvatarUrl.startsWith('wxfile://')) {
        const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempAvatarUrl
        });
        finalAvatarUrl = uploadRes.fileID;
      }

      const userInfo = {
        avatarUrl: finalAvatarUrl,
        nickName: tempNickname
      };

      // 更新全局与缓存
      const app = getApp();
      app.globalData.userInfo = userInfo;
      wx.setStorageSync('userInfo', userInfo);

      this.setData({
        userInfo,
        showOverlay: false, // 资料同步成功，关闭强制遮罩
        tempAvatarUrl: '',
        tempNickname: '',
        canSubmit: false
      });

      wx.hideLoading();
      wx.showToast({ title: '欢迎加入植光！', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('资料保存失败', err);
      wx.showToast({ title: '同步失败，请重试', icon: 'none' });
    }
  },

  // 获取用户信息 (优先显示已同步的)
  updateUserInfo() {
    const cachedUserInfo = wx.getStorageSync('userInfo');
    if (cachedUserInfo) {
      this.setData({ userInfo: cachedUserInfo });
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

  // 点击头像区域：跳转到资料编辑页
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

  // 去云端拉取植物列表的方法
  fetchPlants() {
    wx.showNavigationBarLoading();

    // ✨ 优化：增加 limit(100) 并显式声明查询条件，消除全量查询告警
    db.collection('plants')
      .where({
        _openid: db.command.exists(true) // 显式要求 openid 存在（这会让查询走索引）
      })
      .orderBy('createTime', 'desc')
      .limit(100) // 即使是“我的绿植”，也建议加上合理的上限
      .get()
      .then(async res => {
        wx.hideNavigationBarLoading();
        const allPlants = res.data || [];
        
        // ✨ 核心：计算今日还没打卡（照顾）的植物
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
        console.log('【植光】获取植物列表成功', allPlants);
      })
      .catch(err => {
        wx.hideNavigationBarLoading();
        console.error('【植光】获取植物列表失败', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
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
      
      console.log('【植光】正在查询今日打卡记录...', todayStart);

      // 2. 获取今天所有的日记记录
      const _ = db.command;
      const journalRes = await db.collection('journals')
        .where({
          createTime: _.gte(todayStart)
        })
        .get();
      
      const todayJournals = journalRes.data || [];
      console.log('【植光】今日已打卡记录总数:', todayJournals.length);

      // 拿到今天已经照顾过的植物 ID 列表 (去重)
      const caredPlantIds = [...new Set(todayJournals.map(j => String(j.plantId)))];
      console.log('【植光】今日已打卡植物 ID 列表:', caredPlantIds);

      // 3. 找出还没照顾过的植物
      const todoPlants = plants.filter(plant => {
        const isCared = caredPlantIds.includes(String(plant._id));
        return !isCared;
      });

      console.log('【植光】计算出的待办植物数:', todoPlants.length);

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
      searchKey: isTodoFilter ? '🌱 正在查看今日尚未照顾的植物' : ''
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
      noResults: filteredPlant.length === 0
    });
  },

  /**
   * 用户点击右上角分享给朋友
   */
  onShareAppMessage() {
    return {
      title: '植光 ZhiGuang - 记录每一寸破土而出的生命',
      path: '/pages/index/index',
      imageUrl: '/images/cloud_dev.png' // 使用默认封面
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